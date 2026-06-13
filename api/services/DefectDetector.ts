import sharp from 'sharp';
import type { DetectionRegion, DefectType, BBox } from '../../shared/types.js';
import { nanoid } from 'nanoid';

interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

interface AbsoluteBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function normalizeBBox(bbox: AbsoluteBBox, width: number, height: number): BBox {
  return {
    x: Math.max(0, bbox.x1 / width),
    y: Math.max(0, bbox.y1 / height),
    width: Math.min(1, (bbox.x2 - bbox.x1) / width),
    height: Math.min(1, (bbox.y2 - bbox.y1) / height),
  };
}

function toGrayscale(pixels: PixelData): Uint8ClampedArray {
  const { data, width, height, channels } = pixels;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    gray[i] = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
  }
  return gray;
}

function computeLocalVariance(gray: Uint8ClampedArray, width: number, height: number, window: number): Float32Array {
  const variance = new Float32Array(width * height);
  const half = Math.floor(window / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const v = gray[ny * width + nx];
            sum += v;
            sumSq += v * v;
            count++;
          }
        }
      }

      const mean = sum / count;
      variance[y * width + x] = sumSq / count - mean * mean;
    }
  }
  return variance;
}

function connectedComponents(mask: Uint8Array, width: number, height: number): number[][] {
  const visited = new Uint8Array(width * height);
  const components: number[][] = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] && !visited[idx]) {
        const component: number[] = [];
        const stack = [idx];
        visited[idx] = 1;

        while (stack.length > 0) {
          const current = stack.pop()!;
          component.push(current);
          const cx = current % width;
          const cy = Math.floor(current / width);

          for (const [dx, dy] of dirs) {
            const nx = cx + dx;
            const ny = cy + dy;
            const nIdx = ny * width + nx;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              stack.push(nIdx);
            }
          }
        }

        if (component.length > 5) {
          components.push(component);
        }
      }
    }
  }
  return components;
}

function bboxFromComponent(component: number[], width: number): AbsoluteBBox {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const idx of component) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    x1 = Math.min(x1, x);
    y1 = Math.min(y1, y);
    x2 = Math.max(x2, x);
    y2 = Math.max(y2, y);
  }
  const pad = 2;
  return {
    x1: Math.max(0, x1 - pad),
    y1: Math.max(0, y1 - pad),
    x2: Math.min(width - 1, x2 + pad),
    y2: Math.min(Infinity, y2 + pad),
  };
}

function computeConfidence(component: number[], mask: Uint8Array, gray: Uint8ClampedArray, width: number, height: number): number {
  if (component.length === 0) return 0;

  let sumAnomaly = 0;
  for (const idx of component) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    let neighborSum = 0;
    let neighborCount = 0;
    for (let dy = -5; dy <= 5; dy++) {
      for (let dx = -5; dx <= 5; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIdx = ny * width + nx;
          if (!mask[nIdx]) {
            neighborSum += gray[nIdx];
            neighborCount++;
          }
        }
      }
    }
    if (neighborCount > 0) {
      const localMean = neighborSum / neighborCount;
      sumAnomaly += Math.abs(gray[idx] - localMean) / 255;
    }
  }

  const avgAnomaly = sumAnomaly / component.length;
  const sizeScore = Math.min(1, component.length / 500);
  return Math.min(0.98, 0.4 + avgAnomaly * 0.4 + sizeScore * 0.2);
}

function mergeOverlappingBBoxes(
  regions: { bbox: AbsoluteBBox; confidence: number; type: DefectType }[],
  width: number,
  height: number,
  iouThreshold: number = 0.3
): { bbox: AbsoluteBBox; confidence: number; type: DefectType }[] {
  const result: { bbox: AbsoluteBBox; confidence: number; type: DefectType }[] = [];
  const used = new Set<number>();

  for (let i = 0; i < regions.length; i++) {
    if (used.has(i)) continue;
    let { bbox, confidence, type } = regions[i];
    used.add(i);

    for (let j = i + 1; j < regions.length; j++) {
      if (used.has(j)) continue;
      const other = regions[j];
      const iou = computeIoU(bbox, other.bbox);
      if (iou > iouThreshold) {
        bbox = {
          x1: Math.min(bbox.x1, other.bbox.x1),
          y1: Math.min(bbox.y1, other.bbox.y1),
          x2: Math.max(bbox.x2, other.bbox.x2),
          y2: Math.max(bbox.y2, other.bbox.y2),
        };
        confidence = Math.max(confidence, other.confidence);
        used.add(j);
      }
    }

    result.push({ bbox, confidence, type });
  }

  return result;
}

function computeIoU(a: AbsoluteBBox, b: AbsoluteBBox): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

class DefectDetectorService {
  async detectWatermarks(buffer: Buffer): Promise<{ regions: DetectionRegion[]; width: number; height: number }> {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels: PixelData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    const gray = toGrayscale(pixels);

    const downscale = Math.max(1, Math.floor(Math.min(width, height) / 400));
    const dw = Math.floor(width / downscale);
    const dh = Math.floor(height / downscale);
    const smallGray = new Uint8ClampedArray(dw * dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        smallGray[y * dw + x] = gray[(y * downscale) * width + (x * downscale)];
      }
    }

    const variance = computeLocalVariance(smallGray, dw, dh, 11);
    const meanVar = variance.reduce((a, b) => a + b, 0) / variance.length;

    const lowVarMask = new Uint8Array(dw * dh);
    const threshold = Math.max(2, meanVar * 0.15);
    for (let i = 0; i < dw * dh; i++) {
      lowVarMask[i] = variance[i] < threshold ? 1 : 0;
    }

    const brightnessMask = new Uint8Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      const v = smallGray[i];
      if (v > 200 && v < 250) {
        brightnessMask[i] = lowVarMask[i];
      } else if (v > 30 && v < 80) {
        brightnessMask[i] = lowVarMask[i];
      }
    }

    const components = connectedComponents(brightnessMask, dw, dh);
    const candidateRegions: { bbox: AbsoluteBBox; confidence: number; type: DefectType }[] = [];

    for (const component of components) {
      const absBbox = bboxFromComponent(component, dw);
      const realBbox: AbsoluteBBox = {
        x1: absBbox.x1 * downscale,
        y1: absBbox.y1 * downscale,
        x2: absBbox.x2 * downscale,
        y2: absBbox.y2 * downscale,
      };

      const w = realBbox.x2 - realBbox.x1;
      const h = realBbox.y2 - realBbox.y1;
      const aspect = w / Math.max(1, h);
      const areaRatio = (w * h) / (width * height);

      if (areaRatio < 0.001 || areaRatio > 0.5) continue;
      if (aspect < 0.2 || aspect > 5) continue;

      const confidence = computeConfidence(component, brightnessMask, smallGray, dw, dh);
      if (confidence > 0.45) {
        candidateRegions.push({ bbox: realBbox, confidence, type: 'watermark' });
      }
    }

    const merged = mergeOverlappingBBoxes(candidateRegions, width, height, 0.2);
    const regions: DetectionRegion[] = merged.map((r) => ({
      id: nanoid(8),
      type: r.type,
      confidence: r.confidence,
      bbox: normalizeBBox(r.bbox, width, height),
    }));

    return { regions, width, height };
  }

  async detectScratches(buffer: Buffer): Promise<{ regions: DetectionRegion[]; width: number; height: number }> {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels: PixelData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    const gray = toGrayscale(pixels);

    const downscale = Math.max(1, Math.floor(Math.min(width, height) / 500));
    const dw = Math.floor(width / downscale);
    const dh = Math.floor(height / downscale);
    const smallGray = new Uint8ClampedArray(dw * dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        smallGray[y * dw + x] = gray[(y * downscale) * width + (x * downscale)];
      }
    }

    const gx = new Float32Array(dw * dh);
    const gy = new Float32Array(dw * dh);
    const gradMag = new Float32Array(dw * dh);

    for (let y = 1; y < dh - 1; y++) {
      for (let x = 1; x < dw - 1; x++) {
        const idx = y * dw + x;
        gx[idx] = smallGray[idx - 1] - smallGray[idx + 1];
        gy[idx] = smallGray[idx - dw] - smallGray[idx + dw];
        gradMag[idx] = Math.sqrt(gx[idx] * gx[idx] + gy[idx] * gy[idx]);
      }
    }

    const meanGrad = gradMag.reduce((a, b) => a + b, 0) / (dw * dh);
    const stdGrad = Math.sqrt(
      gradMag.reduce((a, b) => a + (b - meanGrad) * (b - meanGrad), 0) / (dw * dh)
    );

    const gradThreshold = meanGrad + stdGrad * 1.5;
    const lineMask = new Uint8Array(dw * dh);

    for (let y = 2; y < dh - 2; y++) {
      for (let x = 2; x < dw - 2; x++) {
        const idx = y * dw + x;
        if (gradMag[idx] < gradThreshold) continue;

        const direction = Math.atan2(gy[idx], gx[idx]);
        const angle = Math.abs(((direction * 180) / Math.PI) % 180);
        const isHorizontal = angle < 20 || angle > 160;
        const isVertical = (angle > 70 && angle < 110);

        if (isHorizontal || isVertical) {
          let linePixels = 0;
          if (isHorizontal) {
            for (let dx = -10; dx <= 10; dx++) {
              const nx = x + dx;
              if (nx >= 0 && nx < dw && gradMag[y * dw + nx] > gradThreshold * 0.6) {
                linePixels++;
              }
            }
          } else {
            for (let dy = -10; dy <= 10; dy++) {
              const ny = y + dy;
              if (ny >= 0 && ny < dh && gradMag[ny * dw + x] > gradThreshold * 0.6) {
                linePixels++;
              }
            }
          }

          if (linePixels >= 10) {
            lineMask[idx] = 1;
          }
        }
      }
    }

    const components = connectedComponents(lineMask, dw, dh);
    const candidateRegions: { bbox: AbsoluteBBox; confidence: number; type: DefectType }[] = [];

    for (const component of components) {
      const absBbox = bboxFromComponent(component, dw);
      const realBbox: AbsoluteBBox = {
        x1: absBbox.x1 * downscale,
        y1: absBbox.y1 * downscale,
        x2: absBbox.x2 * downscale,
        y2: absBbox.y2 * downscale,
      };

      const w = realBbox.x2 - realBbox.x1;
      const h = realBbox.y2 - realBbox.y1;
      const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
      const areaRatio = (w * h) / (width * height);

      if (aspect < 3) continue;
      if (areaRatio < 0.0005) continue;

      const confidence = computeConfidence(component, lineMask, smallGray, dw, dh);
      if (confidence > 0.4) {
        candidateRegions.push({ bbox: realBbox, confidence, type: 'scratch' });
      }
    }

    const merged = mergeOverlappingBBoxes(candidateRegions, width, height, 0.3);
    const regions: DetectionRegion[] = merged.map((r) => ({
      id: nanoid(8),
      type: r.type,
      confidence: r.confidence,
      bbox: normalizeBBox(r.bbox, width, height),
    }));

    return { regions, width, height };
  }

  async detectStains(buffer: Buffer): Promise<{ regions: DetectionRegion[]; width: number; height: number }> {
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels: PixelData = {
      data: new Uint8ClampedArray(data),
      width: info.width,
      height: info.height,
      channels: info.channels,
    };

    const gray = toGrayscale(pixels);

    const downscale = Math.max(1, Math.floor(Math.min(width, height) / 400));
    const dw = Math.floor(width / downscale);
    const dh = Math.floor(height / downscale);
    const smallGray = new Uint8ClampedArray(dw * dh);
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        smallGray[y * dw + x] = gray[(y * downscale) * width + (x * downscale)];
      }
    }

    const boxSize = 25;
    const halfBox = Math.floor(boxSize / 2);
    const localMean = new Float32Array(dw * dh);

    const integral = new Float32Array((dw + 1) * (dh + 1));
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        integral[(y + 1) * (dw + 1) + x + 1] =
          smallGray[y * dw + x] +
          integral[y * (dw + 1) + x + 1] +
          integral[(y + 1) * (dw + 1) + x] -
          integral[y * (dw + 1) + x];
      }
    }

    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const x1 = Math.max(0, x - halfBox);
        const y1 = Math.max(0, y - halfBox);
        const x2 = Math.min(dw - 1, x + halfBox);
        const y2 = Math.min(dh - 1, y + halfBox);
        const area = (x2 - x1 + 1) * (y2 - y1 + 1);

        localMean[y * dw + x] =
          (integral[(y2 + 1) * (dw + 1) + x2 + 1] -
            integral[y1 * (dw + 1) + x2 + 1] -
            integral[(y2 + 1) * (dw + 1) + x1] +
            integral[y1 * (dw + 1) + x1]) /
          area;
      }
    }

    const stainMask = new Uint8Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      const diff = Math.abs(smallGray[i] - localMean[i]);
      if (diff > 20 && diff < 150) {
        stainMask[i] = 1;
      }
    }

    const colorChannels = info.channels >= 3;
    if (colorChannels) {
      for (let y = 0; y < dh; y++) {
        for (let x = 0; x < dw; x++) {
          if (!stainMask[y * dw + x]) continue;
          const sx = x * downscale;
          const sy = y * downscale;
          const pIdx = (sy * width + sx) * info.channels;
          const r = pixels.data[pIdx];
          const g = pixels.data[pIdx + 1];
          const b = pixels.data[pIdx + 2];
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
          if (saturation < 0.15) {
            stainMask[y * dw + x] = 1;
          } else if (saturation > 0.4) {
            stainMask[y * dw + x] = 1;
          }
        }
      }
    }

    const components = connectedComponents(stainMask, dw, dh);
    const candidateRegions: { bbox: AbsoluteBBox; confidence: number; type: DefectType }[] = [];

    for (const component of components) {
      const absBbox = bboxFromComponent(component, dw);
      const realBbox: AbsoluteBBox = {
        x1: absBbox.x1 * downscale,
        y1: absBbox.y1 * downscale,
        x2: absBbox.x2 * downscale,
        y2: absBbox.y2 * downscale,
      };

      const w = realBbox.x2 - realBbox.x1;
      const h = realBbox.y2 - realBbox.y1;
      const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
      const areaRatio = (w * h) / (width * height);

      if (areaRatio < 0.0008 || areaRatio > 0.4) continue;
      if (aspect > 4) continue;

      const confidence = computeConfidence(component, stainMask, smallGray, dw, dh);
      if (confidence > 0.45) {
        candidateRegions.push({ bbox: realBbox, confidence, type: 'stain' });
      }
    }

    const merged = mergeOverlappingBBoxes(candidateRegions, width, height, 0.3);
    const regions: DetectionRegion[] = merged.map((r) => ({
      id: nanoid(8),
      type: r.type,
      confidence: r.confidence,
      bbox: normalizeBBox(r.bbox, width, height),
    }));

    return { regions, width, height };
  }

  async detectAll(buffer: Buffer): Promise<{ regions: DetectionRegion[]; width: number; height: number }> {
    const [watermarkResult, scratchResult, stainResult] = await Promise.all([
      this.detectWatermarks(buffer),
      this.detectScratches(buffer),
      this.detectStains(buffer),
    ]);

    const width = watermarkResult.width;
    const height = watermarkResult.height;

    const allRegions = [
      ...watermarkResult.regions,
      ...scratchResult.regions,
      ...stainResult.regions,
    ];

    const absRegions = allRegions.map((r) => ({
      region: r,
      abs: {
        x1: r.bbox.x * width,
        y1: r.bbox.y * height,
        x2: (r.bbox.x + r.bbox.width) * width,
        y2: (r.bbox.y + r.bbox.height) * height,
      } as AbsoluteBBox,
    }));

    const filtered: DetectionRegion[] = [];
    const used = new Set<number>();

    for (let i = 0; i < absRegions.length; i++) {
      if (used.has(i)) continue;
      let best = absRegions[i];
      used.add(i);

      for (let j = i + 1; j < absRegions.length; j++) {
        if (used.has(j)) continue;
        const iou = computeIoU(best.abs, absRegions[j].abs);
        if (iou > 0.4) {
          if (absRegions[j].region.confidence > best.region.confidence) {
            best = absRegions[j];
          }
          used.add(j);
        }
      }

      filtered.push(best.region);
    }

    return { regions: filtered, width, height };
  }
}

export const DefectDetector = new DefectDetectorService();
