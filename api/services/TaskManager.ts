import type { DetectionRegion, RepairMode, RepairProgress, TaskStage } from '../../shared/types.js';
import type { Task, ImageFile } from '../types/index.js';
import { FileStorage } from './FileStorage.js';
import { DefectDetector } from './DefectDetector.js';
import { ImageRepair } from './ImageRepair.js';
import { nanoid } from 'nanoid';

type ProgressListener = (progress: RepairProgress) => void;

class TaskManagerService {
  private tasks: Map<string, Task> = new Map();
  private images: Map<string, ImageFile> = new Map();

  createImage(image: Omit<ImageFile, 'id' | 'status' | 'createdAt'>): ImageFile {
    const id = FileStorage.generateId();
    const record: ImageFile = {
      ...image,
      id,
      status: 'uploaded',
      createdAt: Date.now(),
    };
    this.images.set(id, record);
    return record;
  }

  getImage(id: string): ImageFile | undefined {
    return this.images.get(id);
  }

  updateImage(id: string, updates: Partial<ImageFile>): ImageFile | undefined {
    const image = this.images.get(id);
    if (!image) return undefined;
    const updated = { ...image, ...updates };
    this.images.set(id, updated);
    return updated;
  }

  deleteImage(id: string): boolean {
    return this.images.delete(id);
  }

  getAllImages(): ImageFile[] {
    return Array.from(this.images.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  createTask(imageId: string, regions: DetectionRegion[], mode: RepairMode = 'auto'): Task {
    const taskId = nanoid(16);
    const task: Task = {
      id: taskId,
      imageId,
      stage: 'queued',
      progress: 0,
      message: '任务已排队，等待执行...',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      listeners: new Set<ProgressListener>(),
    };
    this.tasks.set(taskId, task);

    setImmediate(() => {
      this.executeTask(taskId, regions, mode).catch((err) => {
        console.error('[TaskManager] Task execution error:', err);
        this.updateTaskProgress(taskId, 'error', 100, `任务执行失败: ${err.message}`);
      });
    });

    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  subscribe(taskId: string, listener: ProgressListener): () => void {
    const task = this.tasks.get(taskId);
    if (!task) {
      return () => {};
    }
    task.listeners.add(listener);

    const currentProgress: RepairProgress = {
      taskId: task.id,
      stage: task.stage,
      progress: task.progress,
      message: task.message,
      resultUrl: task.resultFilename ? `/api/images/${task.imageId}/download` : undefined,
      resultWidth: task.resultWidth,
      resultHeight: task.resultHeight,
    };
    listener(currentProgress);

    return () => {
      task.listeners.delete(listener);
    };
  }

  private updateTaskProgress(
    taskId: string,
    stage: TaskStage,
    progress: number,
    message: string,
    extra?: Partial<Task>
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.stage = stage;
    task.progress = progress;
    task.message = message;
    task.updatedAt = Date.now();

    if (extra) {
      Object.assign(task, extra);
    }

    const progressEvent: RepairProgress = {
      taskId: task.id,
      stage: task.stage,
      progress: task.progress,
      message: task.message,
      resultUrl: task.resultFilename ? `/api/images/${task.imageId}/download` : undefined,
      resultWidth: task.resultWidth,
      resultHeight: task.resultHeight,
    };

    for (const listener of task.listeners) {
      try {
        listener(progressEvent);
      } catch (err) {
        console.error('[TaskManager] Listener error:', err);
      }
    }
  }

  private async executeTask(
    taskId: string,
    regions: DetectionRegion[],
    mode: RepairMode
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const image = this.images.get(task.imageId);
    if (!image) {
      this.updateTaskProgress(taskId, 'error', 100, '图片不存在');
      return;
    }

    this.updateTaskProgress(taskId, 'queued', 5, '任务已加入队列');
    await this.sleep(50);

    this.updateTaskProgress(taskId, 'detecting', 10, '正在分析图片...');

    let detectRegions = regions;
    if (detectRegions.length === 0) {
      try {
        const imageBuffer = await FileStorage.readFile('uploads', image.filename);
        const detectResult = await DefectDetector.detectAll(imageBuffer);
        detectRegions = detectResult.regions;
        this.updateImage(image.id, { regions: detectRegions, status: 'detected' });
      } catch (err) {
        console.error('[TaskManager] Detection error:', err);
      }
    }

    this.updateTaskProgress(taskId, 'processing', 30, `检测到 ${detectRegions.length} 处瑕疵，开始修复...`);
    this.updateImage(image.id, { status: 'repairing' });

    try {
      const imageBuffer = await FileStorage.readFile('uploads', image.filename);

      const totalSteps = detectRegions.length > 0 ? detectRegions.length : 1;
      let currentStep = 0;

      const repairResult = await ImageRepair.repairImage(imageBuffer, detectRegions, mode);

      this.updateTaskProgress(taskId, 'refining', 80, '正在优化修复效果...');

      const resultFilename = FileStorage.generateUniqueFilename(`repaired_${image.filename}`);
      const pngFilename = resultFilename.replace(/\.[^.]+$/, '.png');
      await FileStorage.saveFile('outputs', pngFilename, repairResult.buffer);

      this.updateTaskProgress(
        taskId,
        'completed',
        100,
        '修复完成！',
        {
          resultFilename: pngFilename,
          resultWidth: repairResult.width,
          resultHeight: repairResult.height,
        }
      );

      this.updateImage(image.id, {
        status: 'completed',
        resultFilename: pngFilename,
        completedAt: Date.now(),
      });
    } catch (err) {
      console.error('[TaskManager] Repair error:', err);
      this.updateTaskProgress(taskId, 'error', 100, `修复失败: ${(err as Error).message}`);
      this.updateImage(image.id, { status: 'error' });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const TaskManager = new TaskManagerService();
