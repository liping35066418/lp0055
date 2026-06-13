import { create } from 'zustand';
import type {
  ImageRecord,
  DetectionRegion,
  RepairProgress,
} from '@/types';
import type { ProcessingTask } from '@/types';

interface AppStoreState {
  images: ImageRecord[];
  currentImageId: string | null;
  currentTask: ProcessingTask | null;
  processingMap: Record<string, ProcessingTask>;

  addImage: (image: ImageRecord) => void;
  updateImage: (imageId: string, updates: Partial<ImageRecord>) => void;
  removeImage: (imageId: string) => void;
  setCurrentImage: (imageId: string | null) => void;
  startTask: (taskId: string, imageId: string) => void;
  updateTaskProgress: (progress: RepairProgress) => void;
  clearTask: (taskId: string) => void;
  loadHistory: (images: ImageRecord[]) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  images: [],
  currentImageId: null,
  currentTask: null,
  processingMap: {},

  addImage: (image) =>
    set((state) => ({
      images: [image, ...state.images],
    })),

  updateImage: (imageId, updates) =>
    set((state) => ({
      images: state.images.map((img) =>
        img.id === imageId ? { ...img, ...updates } : img
      ),
    })),

  removeImage: (imageId) =>
    set((state) => ({
      images: state.images.filter((img) => img.id !== imageId),
      currentImageId: state.currentImageId === imageId ? null : state.currentImageId,
    })),

  setCurrentImage: (imageId) =>
    set({
      currentImageId: imageId,
    }),

  startTask: (taskId, imageId) =>
    set((state) => {
      const task: ProcessingTask = {
        taskId,
        imageId,
        stage: 'queued',
        progress: 0,
        message: '任务已排队...',
      };
      return {
        processingMap: {
          ...state.processingMap,
          [taskId]: task,
        },
        currentTask: task,
        images: state.images.map((img) =>
          img.id === imageId ? { ...img, status: 'repairing' } : img
        ),
      };
    }),

  updateTaskProgress: (progress) =>
    set((state) => {
      const task: ProcessingTask = {
        taskId: progress.taskId,
        imageId: state.processingMap[progress.taskId]?.imageId || '',
        stage: progress.stage,
        progress: progress.progress,
        message: progress.message,
        resultUrl: progress.resultUrl,
      };

      const updates: Partial<AppStoreState> = {
        processingMap: {
          ...state.processingMap,
          [progress.taskId]: task,
        },
      };

      if (state.currentTask?.taskId === progress.taskId) {
        updates.currentTask = task;
      }

      const imageId = state.processingMap[progress.taskId]?.imageId;
      if (imageId) {
        const imageUpdates: Partial<ImageRecord> = {};
        if (progress.stage === 'completed') {
          imageUpdates.status = 'completed';
          imageUpdates.resultUrl = progress.resultUrl;
          imageUpdates.completedAt = Date.now();
        } else if (progress.stage === 'error') {
          imageUpdates.status = 'error';
        }
        if (Object.keys(imageUpdates).length > 0) {
          updates.images = state.images.map((img) =>
            img.id === imageId ? { ...img, ...imageUpdates } : img
          );
        }
      }

      return updates;
    }),

  clearTask: (taskId) =>
    set((state) => {
      const newMap = { ...state.processingMap };
      delete newMap[taskId];
      return {
        processingMap: newMap,
        currentTask: state.currentTask?.taskId === taskId ? null : state.currentTask,
      };
    }),

  loadHistory: (images) =>
    set({
      images,
    }),
}));

export function selectImageById(imageId: string | null) {
  return (state: AppStoreState): ImageRecord | undefined => {
    if (!imageId) return undefined;
    return state.images.find((img) => img.id === imageId);
  };
}
