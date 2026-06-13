export type DefectType = 'watermark' | 'scratch' | 'stain' | 'manual';

export type RepairMode = 'auto' | 'light-watermark' | 'dense-defects';

export type TaskStage = 'detecting' | 'processing' | 'refining' | 'completed' | 'error' | 'queued';

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectionRegion {
  id: string;
  type: DefectType;
  confidence: number;
  bbox: BBox;
}

export interface UploadImageResponse {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  previewUrl: string;
  createdAt: number;
}

export interface DetectDefectsResponse {
  imageId: string;
  regions: DetectionRegion[];
  processingTime: number;
}

export interface RepairRegionInput {
  id?: string;
  type?: DefectType;
  bbox: BBox;
  strength?: number;
}

export interface RepairRequest {
  imageId: string;
  regions: RepairRegionInput[];
  mode?: RepairMode;
}

export interface RepairProgress {
  taskId: string;
  stage: TaskStage;
  progress: number;
  message: string;
  resultUrl?: string;
  resultWidth?: number;
  resultHeight?: number;
}

export interface DownloadOptions {
  format: 'png' | 'jpg' | 'webp' | 'tiff';
  quality: number;
  scale: number;
}

export interface ImageRecord {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  previewUrl: string;
  resultUrl?: string;
  status: 'uploaded' | 'detecting' | 'detected' | 'repairing' | 'completed' | 'error';
  regions?: DetectionRegion[];
  mode?: RepairMode;
  createdAt: number;
  completedAt?: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
