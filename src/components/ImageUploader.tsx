import { useCallback, useRef, useState } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface ImageUploaderProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/tiff'];
const ACCEPTED_EXT = '.jpg,.jpeg,.png,.webp,.tiff';

export default function ImageUploader({
  onFilesSelected,
  maxFiles = 10,
  maxSizeMB = 10,
}: ImageUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (files: FileList | File[]): File[] => {
      const valid: File[] = [];
      const fileArray = Array.from(files).slice(0, maxFiles);

      for (const file of fileArray) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          continue;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
          continue;
        }
        valid.push(file);
      }

      return valid;
    },
    [maxFiles, maxSizeMB]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const validFiles = validateFiles(files);
      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [onFilesSelected, validateFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
      }
    },
    [handleFiles]
  );

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-300 ${
        isDragging
          ? 'border-cyan bg-cyan/5 shadow-glow'
          : 'border-ink-700 hover:border-cyan/60 hover:bg-ink-800/40'
      }`}
    >
      <div className="border-gradient rounded-2xl pointer-events-none" />

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXT}
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center gap-4">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
            isDragging ? 'bg-cyan text-ink-950' : 'bg-ink-800 text-cyan'
          }`}
        >
          {isDragging ? (
            <Upload size={32} strokeWidth={2} />
          ) : (
            <ImageIcon size={32} strokeWidth={2} />
          )}
        </div>

        <div>
          <p className="font-display text-lg font-medium text-ink-100">
            {isDragging ? '松开鼠标上传图片' : '拖拽图片到此处，或点击选择'}
          </p>
          <p className="mt-1 text-sm text-ink-400">
            支持批量上传，最多 {maxFiles} 张
          </p>
        </div>

        <div className="flex gap-2 text-xs text-ink-500">
          <span className="chip bg-ink-800/60 text-ink-400 border-ink-700">
            JPG / JPEG
          </span>
          <span className="chip bg-ink-800/60 text-ink-400 border-ink-700">
            PNG
          </span>
          <span className="chip bg-ink-800/60 text-ink-400 border-ink-700">
            WebP
          </span>
          <span className="chip bg-ink-800/60 text-ink-400 border-ink-700">
            TIFF
          </span>
          <span className="chip bg-ink-800/60 text-ink-400 border-ink-700">
            ≤ {maxSizeMB}MB
          </span>
        </div>
      </div>
    </div>
  );
}
