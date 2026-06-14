export * from '../../shared/types';

export interface Task {
  id: string;
  imageId: string;
  stage: import('../../shared/types').TaskStage;
  progress: number;
  message: string;
  resultFilename?: string;
  resultWidth?: number;
  resultHeight?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  listeners: Set<(progress: import('../../shared/types').RepairProgress) => void>;
}

export interface ImageFile {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  width: number;
  height: number;
  status: 'uploaded' | 'detecting' | 'detected' | 'repairing' | 'completed' | 'error';
  regions?: import('../../shared/types').DetectionRegion[];
  resultFilename?: string;
  createdAt: number;
  completedAt?: number;
  versions?: import('../../shared/types').RepairVersion[];
  currentVersion?: number;
}
