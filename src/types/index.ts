export * from '../../shared/types';

import type { ImageRecord, RepairProgress } from '../../shared/types';

export interface ProcessingTask {
  taskId: string;
  imageId: string;
  stage: RepairProgress['stage'];
  progress: number;
  message: string;
  resultUrl?: string;
}

export interface AppState {
  images: ImageRecord[];
  currentImageId: string | null;
  currentTask: ProcessingTask | null;
  processingMap: Record<string, ProcessingTask>;
}
