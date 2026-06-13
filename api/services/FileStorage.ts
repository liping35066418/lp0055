import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const DIRS = {
  uploads: path.join(PROJECT_ROOT, 'uploads'),
  temp: path.join(PROJECT_ROOT, 'temp'),
  outputs: path.join(PROJECT_ROOT, 'outputs'),
} as const;

type DirType = keyof typeof DIRS;

class FileStorageService {
  private initialized = false;

  init(): void {
    if (this.initialized) return;

    for (const dir of Object.values(DIRS)) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.initialized = true;
  }

  ensureInit(): void {
    if (!this.initialized) {
      this.init();
    }
  }

  generateUniqueFilename(originalName: string): string {
    const ext = path.extname(originalName) || '.png';
    const id = nanoid(16);
    return `${id}${ext}`;
  }

  generateId(): string {
    return nanoid(16);
  }

  getDirPath(type: DirType): string {
    this.ensureInit();
    return DIRS[type];
  }

  getFilePath(type: DirType, filename: string): string {
    return path.join(this.getDirPath(type), filename);
  }

  async saveFile(type: DirType, filename: string, data: Buffer | string): Promise<string> {
    this.ensureInit();
    const filePath = this.getFilePath(type, filename);

    if (typeof data === 'string') {
      await fs.promises.writeFile(filePath, data);
    } else {
      await fs.promises.writeFile(filePath, data);
    }

    return filePath;
  }

  async readFile(type: DirType, filename: string): Promise<Buffer> {
    const filePath = this.getFilePath(type, filename);
    return fs.promises.readFile(filePath);
  }

  async deleteFile(type: DirType, filename: string): Promise<boolean> {
    const filePath = this.getFilePath(type, filename);
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  fileExists(type: DirType, filename: string): boolean {
    const filePath = this.getFilePath(type, filename);
    return fs.existsSync(filePath);
  }

  async cleanupOldFiles(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<{ deleted: number; totalSize: number }> {
    this.ensureInit();
    const now = Date.now();
    let deleted = 0;
    let totalSize = 0;

    for (const dir of Object.values(DIRS)) {
      try {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          try {
            const stat = await fs.promises.stat(filePath);
            if (now - stat.mtimeMs > maxAgeMs) {
              totalSize += stat.size;
              await fs.promises.unlink(filePath);
              deleted++;
            }
          } catch {
            continue;
          }
        }
      } catch {
        continue;
      }
    }

    return { deleted, totalSize };
  }

  startCleanupInterval(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanupOldFiles().catch((err) => {
        console.error('[FileStorage] Cleanup error:', err);
      });
    }, intervalMs);
  }
}

export const FileStorage = new FileStorageService();
