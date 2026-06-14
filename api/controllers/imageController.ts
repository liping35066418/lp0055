import type { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import { FileStorage } from '../services/FileStorage.js';
import { DefectDetector } from '../services/DefectDetector.js';
import { TaskManager } from '../services/TaskManager.js';
import { AppError } from '../middleware/errorHandler.js';
import type {
  UploadImageResponse,
  DetectDefectsResponse,
  RepairRequest,
  ImageRecord,
  RepairMode,
  DetectionRegion,
  DownloadOptions,
  BBox,
  RepairRegionInput,
  DefectType,
} from '../../shared/types.js';
import { nanoid } from 'nanoid';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function toImageRecord(img: ReturnType<typeof TaskManager.getImage>): ImageRecord | null {
  if (!img) return null;
  return {
    id: img.id,
    filename: img.filename,
    originalName: img.originalName,
    size: img.size,
    mimeType: img.mimeType,
    width: img.width,
    height: img.height,
    previewUrl: `/api/images/${img.id}/download?format=webp&quality=60&scale=0.3&result=false`,
    resultUrl: img.resultFilename ? `/api/images/${img.id}/download` : undefined,
    status: img.status,
    regions: img.regions,
    createdAt: img.createdAt,
    completedAt: img.completedAt,
    versions: img.versions,
    currentVersion: img.currentVersion,
  };
}

function normalizeRepairRegions(inputs: RepairRegionInput[]): DetectionRegion[] {
  return inputs.map((input) => ({
    id: input.id || nanoid(8),
    type: (input.type || 'manual') as DefectType,
    confidence: 0.9,
    bbox: input.bbox,
    strength: input.strength,
  }));
}

function isValidBBox(bbox: BBox): boolean {
  if (!bbox || typeof bbox !== 'object') return false;
  const { x, y, width, height } = bbox;
  return (
    typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number' &&
    x >= 0 && x <= 1 &&
    y >= 0 && y <= 1 &&
    width > 0 && width <= 1 &&
    height > 0 && height <= 1 &&
    x + width <= 1.01 &&
    y + height <= 1.01
  );
}

export const uploadImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.file) {
      throw new AppError(400, 'NO_FILE', '请选择要上传的图片文件');
    }

    if (!ALLOWED_MIME_TYPES.includes(req.file.mimetype)) {
      throw new AppError(
        400,
        'INVALID_FORMAT',
        `不支持的图片格式: ${req.file.mimetype}。仅支持 JPG, PNG, WebP, TIFF`
      );
    }

    if (req.file.size > MAX_FILE_SIZE) {
      throw new AppError(400, 'FILE_TOO_LARGE', `文件过大，最大支持 10MB`);
    }

    const filename = FileStorage.generateUniqueFilename(req.file.originalname);
    await FileStorage.saveFile('uploads', filename, req.file.buffer);

    let width = 0;
    let height = 0;
    try {
      const metadata = await sharp(req.file.buffer).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
    } catch {
      throw new AppError(400, 'INVALID_IMAGE', '无法读取图片信息，请检查文件是否损坏');
    }

    const image = TaskManager.createImage({
      filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      width,
      height,
    });

    const response: UploadImageResponse = {
      id: image.id,
      filename: image.filename,
      originalName: image.originalName,
      size: image.size,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      previewUrl: `/api/images/${image.id}/download?format=webp&quality=60&scale=0.3&result=false`,
      createdAt: image.createdAt,
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (err) {
    next(err);
  }
};

export const getImageInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const image = TaskManager.getImage(id);

    if (!image) {
      throw new AppError(404, 'NOT_FOUND', '图片不存在');
    }

    const record = toImageRecord(image);
    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};

export const detectDefects = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const image = TaskManager.getImage(id);

    if (!image) {
      throw new AppError(404, 'NOT_FOUND', '图片不存在');
    }

    if (!FileStorage.fileExists('uploads', image.filename)) {
      throw new AppError(404, 'FILE_NOT_FOUND', '图片文件不存在或已被清理');
    }

    TaskManager.updateImage(id, { status: 'detecting' });

    const startTime = Date.now();
    const buffer = await FileStorage.readFile('uploads', image.filename);
    const result = await DefectDetector.detectAll(buffer);
    const processingTime = Date.now() - startTime;

    TaskManager.updateImage(id, {
      status: 'detected',
      regions: result.regions,
    });

    const response: DetectDefectsResponse = {
      imageId: id,
      regions: result.regions,
      processingTime,
    };

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (err) {
    next(err);
  }
};

export const startRepair = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const image = TaskManager.getImage(id);

    if (!image) {
      throw new AppError(404, 'NOT_FOUND', '图片不存在');
    }

    const body = req.body as Partial<RepairRequest>;
    let regions: DetectionRegion[] = [];

    if (body.regions && Array.isArray(body.regions) && body.regions.length > 0) {
      for (const r of body.regions) {
        if (!isValidBBox(r.bbox)) {
          throw new AppError(400, 'INVALID_BBOX', `无效的 bbox 坐标: ${JSON.stringify(r.bbox)}`);
        }
      }
      regions = normalizeRepairRegions(body.regions);
    } else if (image.regions && image.regions.length > 0) {
      regions = image.regions;
    }

    const mode: RepairMode = (body.mode as RepairMode) || 'auto';
    if (!['auto', 'light-watermark', 'dense-defects'].includes(mode)) {
      throw new AppError(400, 'INVALID_MODE', `无效的修复模式: ${mode}`);
    }

    const task = TaskManager.createTask(id, regions, mode);

    res.status(200).json({
      success: true,
      data: {
        taskId: task.id,
        stage: task.stage,
        message: task.message,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getProgress = (req: Request, res: Response): void => {
  const { taskId } = req.params;
  const task = TaskManager.getTask(taskId);

  if (!task) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: '任务不存在',
      },
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const unsubscribe = TaskManager.subscribe(taskId, (progress) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
    if (progress.stage === 'completed' || progress.stage === 'error') {
      setTimeout(() => {
        res.end();
      }, 500);
    }
  });

  req.on('close', () => {
    unsubscribe();
  });
};

export const downloadImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const image = TaskManager.getImage(id);

    if (!image) {
      throw new AppError(404, 'NOT_FOUND', '图片不存在');
    }

    const format = (req.query.format as string) || 'png';
    const quality = parseInt(req.query.quality as string) || 90;
    const scale = parseFloat(req.query.scale as string) || 1;
    const versionParam = req.query.version;

    if (!['png', 'jpg', 'webp', 'tiff'].includes(format)) {
      throw new AppError(400, 'INVALID_FORMAT', `不支持的输出格式: ${format}`);
    }

    if (quality < 1 || quality > 100) {
      throw new AppError(400, 'INVALID_QUALITY', '质量参数必须在 1-100 之间');
    }

    if (scale < 0.1 || scale > 3) {
      throw new AppError(400, 'INVALID_SCALE', '缩放参数必须在 0.1-3 之间');
    }

    let sourceFilename = image.filename;
    let sourceDir: 'uploads' | 'outputs' = 'uploads';

    if (versionParam !== undefined) {
      const versionNum = parseInt(versionParam as string);
      if (!isNaN(versionNum) && versionNum > 0 && image.versions) {
        const targetVersion = image.versions.find((v) => v.version === versionNum);
        if (targetVersion && FileStorage.fileExists('outputs', targetVersion.resultFilename)) {
          sourceFilename = targetVersion.resultFilename;
          sourceDir = 'outputs';
        }
      }
    } else {
      const useResult = req.query.result !== 'false' && image.resultFilename;
      if (useResult && FileStorage.fileExists('outputs', image.resultFilename)) {
        sourceFilename = image.resultFilename;
        sourceDir = 'outputs';
      }
    }

    if (!FileStorage.fileExists(sourceDir, sourceFilename)) {
      throw new AppError(404, 'FILE_NOT_FOUND', '图片文件不存在或已被清理');
    }

    const buffer = await FileStorage.readFile(sourceDir, sourceFilename);
    let sharpImg = sharp(buffer);

    if (scale !== 1) {
      sharpImg = sharpImg.resize({
        width: Math.round(image.width * scale),
        height: Math.round(image.height * scale),
        withoutEnlargement: false,
      });
    }

    let outputBuffer: Buffer;
    let contentType: string;
    let downloadName: string;

    const baseName = image.originalName.replace(/\.[^.]+$/, '');

    switch (format) {
      case 'jpg':
      case 'jpeg':
        outputBuffer = await sharpImg.jpeg({ quality, mozjpeg: true }).toBuffer();
        contentType = 'image/jpeg';
        downloadName = `${baseName}_repaired.jpg`;
        break;
      case 'webp':
        outputBuffer = await sharpImg.webp({ quality }).toBuffer();
        contentType = 'image/webp';
        downloadName = `${baseName}_repaired.webp`;
        break;
      case 'tiff':
        outputBuffer = await sharpImg.tiff({ quality }).toBuffer();
        contentType = 'image/tiff';
        downloadName = `${baseName}_repaired.tiff`;
        break;
      case 'png':
      default:
        outputBuffer = await sharpImg.png({ quality }).toBuffer();
        contentType = 'image/png';
        downloadName = `${baseName}_repaired.png`;
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', outputBuffer.length);

    const isDownload = req.query.download === 'true';
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    res.status(200).send(outputBuffer);
  } catch (err) {
    next(err);
  }
};

export const getHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const images = TaskManager.getAllImages();
    const records = images
      .map((img) => toImageRecord(img))
      .filter(Boolean) as ImageRecord[];

    res.status(200).json({
      success: true,
      data: records,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteImage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const image = TaskManager.getImage(id);

    if (!image) {
      throw new AppError(404, 'NOT_FOUND', '图片不存在');
    }

    if (image.filename) {
      await FileStorage.deleteFile('uploads', image.filename);
    }
    if (image.versions && image.versions.length > 0) {
      for (const v of image.versions) {
        await FileStorage.deleteFile('outputs', v.resultFilename);
      }
    } else if (image.resultFilename) {
      await FileStorage.deleteFile('outputs', image.resultFilename);
    }

    TaskManager.deleteImage(id);

    res.status(200).json({
      success: true,
      data: {
        message: '删除成功',
        imageId: id,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const undoRepair = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const image = TaskManager.getImage(id);

    if (!image) {
      throw new AppError(404, 'NOT_FOUND', '图片不存在');
    }

    if (!image.versions || image.versions.length === 0) {
      throw new AppError(400, 'NO_VERSION', '没有可撤销的修复版本');
    }

    const updated = TaskManager.undoRepair(id);
    if (!updated) {
      throw new AppError(500, 'UNDO_FAILED', '撤销失败');
    }

    const record = toImageRecord(updated);
    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};
