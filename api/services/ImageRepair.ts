import sharp from 'sharp';
import type { BBox, DetectionRegion, RepairMode } from '../../shared/types.js';

interface ImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

function bboxToAbsolute(bbox: BBox, width: number, height: number, padding: number = 0) {
  let x1 = Math.floor(bbox.x * width) - padding;
  let y1 = Math.floor(bbox.y * height) - padding;
  let x2 = Math.ceil((bbox.x + bbox.width) * width) + padding;
  let y2 = Math.ceil((bbox.y + bbox.height) * height) + padding;
  x1 = Math.max(0, x1);
  y1 = Math.max(0, y1);
  x2 = Math.min(width - 1, x2);
  y2 = Math.min(height - 1, y2);
  return { x1, y1, x2, y2 };
}

function getPixel(img: ImageData, x: number, y: number): number[] {
  const idx = (y * img.width + x) * img.channels;
  const result: number[] = [];
  for (let c = 0; c < img.channels; c++) {
    result.push(img.data[idx + c]);
  }
  return result;
}

function setPixel(img: ImageData, x: number, y: number, values: number[]): void {
  const idx = (y * img.width + x) * img.channels;
  for (let c = 0; c < Math.min(img.channels, values.length); c++) {
    img.data[idx + c] = Math.max(0, Math.min(255, Math.round(values[c])));
  }
}

function isInBBox(x: number, y: number, bbox: { x1: number; y1: number; x2: number; y2: number }): boolean {
  return x >= bbox.x1 && x <= bbox.x2 && y >= bbox.y1 && y <= bbox.y2;
}

function sampleNeighborhood(
  img: ImageData,
  x: number,
  y: number,
  radius: number,
  bbox: { x1: number; y1: number; x2: number; y2: number }
): number[][] {
  const samples: number[][] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= img.width || ny < 0 || ny >= img.height) continue;
      if (isInBBox(nx, ny, bbox)) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        samples.push(getPixel(img, nx, ny));
      }
    }
  }
  return samples;
}

function weightedAverage(samples: number[][], centerX: number, centerY: number, x: number, y: number): number[] {
  if (samples.length === 0) return [128, 128, 128, 255];

  const channels = samples[0].length;
  const sum = new Array(channels).fill(0);
  let totalWeight = 0;

  for (const sample of samples) {
    const weight = 1;
    for (let c = 0; c < channels; c++) {
      sum[c] += sample[c] * weight;
    }
    totalWeight += weight;
  }

  return sum.map((v) => v / totalWeight);
}

function gaussianBlur1D(img: ImageData, radius: number): void {
  const { width, height, channels } = img;
  const sigma = radius / 3;
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);
  let kernelSum = 0;

  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    kernelSum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= kernelSum;
  }

  const temp = new Uint8ClampedArray(img.data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * channels;
      const sum = new Array(channels).fill(0);
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.max(0, Math.min(width - 1, x + k));
        const sIdx = (y * width + sx) * channels;
        const w = kernel[k + radius];
        for (let c = 0; c < channels; c++) {
          sum[c] += temp[sIdx + c] * w;
        }
      }
      for (let c = 0; c < channels; c++) {
        img.data[outIdx + c] = Math.round(sum[c]);
      }
    }
  }

  const temp2 = new Uint8ClampedArray(img.data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outIdx = (y * width + x) * channels;
      const sum = new Array(channels).fill(0);
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.max(0, Math.min(height - 1, y + k));
        const sIdx = (sy * width + x) * channels;
        const w = kernel[k + radius];
        for (let c = 0; c < channels; c++) {
          sum[c] += temp2[sIdx + c] * w;
        }
      }
      for (let c = 0; c < channels; c++) {
        img.data[outIdx + c] = Math.round(sum[c]);
      }
    }
  }
}

class ImageRepairService {
  async processRegion(
    sharpImg: sharp.Sharp,
    bbox: BBox,
    strength: number = 0.8
  ): Promise<sharp.Sharp> {
    const metadata = await sharpImg.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const channels = metadata.channels || 3;

    const absBbox = bboxToAbsolute(bbox, width, height, Math.max(3, Math.round(strength * 8)));

    const { data, info } = await sharpImg.raw().toBuffer({ resolveWithObject: true });
    const img: ImageData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    const iterations = Math.max(3, Math.round(strength * 8));
    const maxRadius = Math.max(3, Math.round(strength * 6));

    for (let iter = 0; iter < iterations; iter++) {
      const radius = Math.max(2, Math.round(maxRadius * (1 - iter / iterations)));
      const pixelsToProcess: { x: number; y: number; values: number[] }[] = [];

      for (let y = absBbox.y1; y <= absBbox.y2; y++) {
        for (let x = absBbox.x1; x <= absBbox.x2; x++) {
          const samples = sampleNeighborhood(img, x, y, radius, absBbox);
          if (samples.length > 0) {
            const avg = weightedAverage(samples, absBbox.x1, absBbox.y1, x, y);
            pixelsToProcess.push({ x, y, values: avg });
          }
        }
      }

      for (const p of pixelsToProcess) {
        const current = getPixel(img, p.x, p.y);
        const blend = 0.5 + 0.3 * (1 - iter / iterations);
        const blended = current.map((v, i) => v * (1 - blend) + p.values[i] * blend);
        setPixel(img, p.x, p.y, blended);
      }
    }

    const blurRadius = Math.max(1, Math.round(strength * 2));
    for (let y = absBbox.y1; y <= absBbox.y2; y++) {
      for (let x = absBbox.x1; x <= absBbox.x2; x++) {
        const isEdge =
          x === absBbox.x1 ||
          x === absBbox.x2 ||
          y === absBbox.y1 ||
          y === absBbox.y2;
        if (isEdge) {
          const samples = sampleNeighborhood(img, x, y, blurRadius + 1, {
            x1: -1,
            y1: -1,
            x2: -1,
            y2: -1,
          });
          if (samples.length > 0) {
            const avg = weightedAverage(samples, 0, 0, x, y);
            const current = getPixel(img, x, y);
            const blended = current.map((v, i) => v * 0.6 + avg[i] * 0.4);
            setPixel(img, x, y, blended);
          }
        }
      }
    }

    return sharp(Buffer.from(img.data), {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });
  }

  async inpaintLightWatermark(sharpImg: sharp.Sharp, bbox: BBox): Promise<sharp.Sharp> {
    const metadata = await sharpImg.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const absBbox = bboxToAbsolute(bbox, width, height, 5);

    const { data, info } = await sharpImg.raw().toBuffer({ resolveWithObject: true });
    const img: ImageData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    const sampleSize = 10;
    const borderColors: number[][] = [];
    const channels = info.channels;

    for (let i = 0; i < sampleSize; i++) {
      const t = (i + 0.5) / sampleSize;
      if (absBbox.y1 > 5) {
        const x = Math.round(absBbox.x1 + t * (absBbox.x2 - absBbox.x1));
        borderColors.push(getPixel(img, x, absBbox.y1 - 3));
      }
      if (absBbox.y2 < height - 5) {
        const x = Math.round(absBbox.x1 + t * (absBbox.x2 - absBbox.x1));
        borderColors.push(getPixel(img, x, absBbox.y2 + 3));
      }
      if (absBbox.x1 > 5) {
        const y = Math.round(absBbox.y1 + t * (absBbox.y2 - absBbox.y1));
        borderColors.push(getPixel(img, absBbox.x1 - 3, y));
      }
      if (absBbox.x2 < width - 5) {
        const y = Math.round(absBbox.y1 + t * (absBbox.y2 - absBbox.y1));
        borderColors.push(getPixel(img, absBbox.x2 + 3, y));
      }
    }

    const avgBorder = new Array(channels).fill(0);
    for (const color of borderColors) {
      for (let c = 0; c < channels; c++) {
        avgBorder[c] += color[c];
      }
    }
    for (let c = 0; c < channels; c++) {
      avgBorder[c] /= borderColors.length;
    }

    for (let y = absBbox.y1; y <= absBbox.y2; y++) {
      for (let x = absBbox.x1; x <= absBbox.x2; x++) {
        const pixel = getPixel(img, x, y);

        let minDist = Infinity;
        for (const color of borderColors) {
          let dist = 0;
          for (let c = 0; c < 3; c++) {
            dist += (pixel[c] - color[c]) * (pixel[c] - color[c]);
          }
          minDist = Math.min(minDist, Math.sqrt(dist));
        }

        if (minDist < 60) {
          setPixel(img, x, y, avgBorder);
        }
      }
    }

    const iterations = 6;
    for (let iter = 0; iter < iterations; iter++) {
      for (let y = absBbox.y1; y <= absBbox.y2; y++) {
        for (let x = absBbox.x1; x <= absBbox.x2; x++) {
          let current = getPixel(img, x, y);
          let matchesBorder = false;
          for (const color of borderColors) {
            let dist = 0;
            for (let c = 0; c < 3; c++) {
              dist += (current[c] - color[c]) * (current[c] - color[c]);
            }
            if (Math.sqrt(dist) < 60) {
              matchesBorder = true;
              break;
            }
          }

          if (!matchesBorder) continue;

          const neighbors: number[][] = [];
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            if (isInBBox(nx, ny, absBbox)) continue;
            neighbors.push(getPixel(img, nx, ny));
          }

          if (neighbors.length > 0) {
            const avg = weightedAverage(neighbors, x, y, x, y);
            const blend = 0.3 + 0.1 * iter;
            const blended = current.map((v, i) => v * (1 - blend) + avg[i] * blend);
            setPixel(img, x, y, blended);
          }
        }
      }
    }

    let resultSharp = sharp(Buffer.from(img.data), {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });

    const regionWidth = absBbox.x2 - absBbox.x1 + 1;
    const regionHeight = absBbox.y2 - absBbox.y1 + 1;
    if (regionWidth > 20 && regionHeight > 20) {
      resultSharp = await this.processRegion(resultSharp, bbox, 0.5);
    }

    return resultSharp;
  }

  async inpaintDenseDefects(sharpImg: sharp.Sharp, regions: BBox[]): Promise<sharp.Sharp> {
    const metadata = await sharpImg.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    let current = sharpImg;

    const paddedRegions = regions.map((r) => {
      const abs = bboxToAbsolute(r, width, height, 0);
      const bw = abs.x2 - abs.x1 + 1;
      const bh = abs.y2 - abs.y1 + 1;
      const padding = Math.max(2, Math.round(Math.min(bw, bh) * 0.15));
      return bboxToAbsolute(r, width, height, padding);
    });

    const merged: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const bbox of paddedRegions) {
      let mergedInto = false;
      for (const m of merged) {
        const overlap = !(bbox.x2 < m.x1 - 10 || bbox.x1 > m.x2 + 10 || bbox.y2 < m.y1 - 10 || bbox.y1 > m.y2 + 10);
        if (overlap) {
          m.x1 = Math.min(m.x1, bbox.x1);
          m.y1 = Math.min(m.y1, bbox.y1);
          m.x2 = Math.max(m.x2, bbox.x2);
          m.y2 = Math.max(m.y2, bbox.y2);
          mergedInto = true;
          break;
        }
      }
      if (!mergedInto) {
        merged.push({ ...bbox });
      }
    }

    const outerIterations = 3;
    for (let oi = 0; oi < outerIterations; oi++) {
      for (const region of merged) {
        const normBbox: BBox = {
          x: region.x1 / width,
          y: region.y1 / height,
          width: (region.x2 - region.x1) / width,
          height: (region.y2 - region.y1) / height,
        };

        const strength = 0.5 + 0.2 * oi;
        current = await this.processRegion(current, normBbox, strength);
      }
    }

    const { data, info } = await current.raw().toBuffer({ resolveWithObject: true });
    const img: ImageData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    for (const region of merged) {
      const featherWidth = 5;
      for (let i = 0; i < featherWidth; i++) {
        const alpha = 1 - (i + 1) / (featherWidth + 1);
        const inner = {
          x1: region.x1 + i,
          y1: region.y1 + i,
          x2: region.x2 - i,
          y2: region.y2 - i,
        };

        const processEdge = (x: number, y: number) => {
          if (x < 0 || x >= width || y < 0 || y >= height) return;
          const samples: number[][] = [];
          const r = 3;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
              if (nx >= inner.x1 && nx <= inner.x2 && ny >= inner.y1 && ny <= inner.y2) continue;
              samples.push(getPixel(img, nx, ny));
            }
          }
          if (samples.length > 0) {
            const avg = weightedAverage(samples, 0, 0, x, y);
            const current = getPixel(img, x, y);
            const blended = current.map((v, idx) => v * alpha + avg[idx] * (1 - alpha));
            setPixel(img, x, y, blended);
          }
        };

        for (let x = inner.x1; x <= inner.x2; x++) {
          processEdge(x, inner.y1);
          processEdge(x, inner.y2);
        }
        for (let y = inner.y1 + 1; y < inner.y2; y++) {
          processEdge(inner.x1, y);
          processEdge(inner.x2, y);
        }
      }
    }

    gaussianBlur1D(img, 1);

    return sharp(Buffer.from(img.data), {
      raw: { width: info.width, height: info.height, channels: info.channels },
    });
  }

  async repairImage(
    imageBuffer: Buffer,
    regions: DetectionRegion[],
    mode: RepairMode = 'auto'
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    let current = sharp(imageBuffer);

    if (mode === 'light-watermark' || (mode === 'auto' && regions.some((r) => r.type === 'watermark'))) {
      const watermarks = regions.filter((r) => r.type === 'watermark');
      for (const region of watermarks) {
        current = await this.inpaintLightWatermark(current, region.bbox);
      }
      const remaining = regions.filter((r) => r.type !== 'watermark');
      if (remaining.length > 0) {
        if (remaining.length > 5) {
          current = await this.inpaintDenseDefects(current, remaining.map((r) => r.bbox));
        } else {
          for (const region of remaining) {
            const strength = region.confidence > 0.7 ? 0.8 : 0.6;
            current = await this.processRegion(current, region.bbox, strength);
          }
        }
      }
    } else if (mode === 'dense-defects' || (mode === 'auto' && regions.length > 5)) {
      current = await this.inpaintDenseDefects(current, regions.map((r) => r.bbox));
    } else {
      for (const region of regions) {
        const strength = region.confidence > 0.7 ? 0.8 : 0.6;
        current = await this.processRegion(current, region.bbox, strength);
      }
    }

    const resultBuffer = await current.png().toBuffer();
    return { buffer: resultBuffer, width, height };
  }
}

export const ImageRepair = new ImageRepairService();
