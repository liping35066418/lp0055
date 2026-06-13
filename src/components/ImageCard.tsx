import { Check, AlertCircle, Loader2, Trash2, Eye } from 'lucide-react';
import type { ImageRecord } from '@/types';

interface ImageCardProps {
  image: ImageRecord;
  isSelected?: boolean;
  onSelect?: () => void;
  onClick?: () => void;
  onDelete?: () => void;
  showProgress?: boolean;
  progress?: number;
  progressMessage?: string;
}

const statusConfig: Record<
  ImageRecord['status'],
  { label: string; className: string; icon: React.ReactNode }
> = {
  uploaded: {
    label: '已上传',
    className: 'bg-cyan/15 text-cyan border-cyan/30',
    icon: <Check size={12} strokeWidth={2} />,
  },
  detecting: {
    label: '检测中',
    className: 'bg-amber/15 text-amber border-amber/30',
    icon: <Loader2 size={12} strokeWidth={2} className="animate-spin" />,
  },
  detected: {
    label: '已检测',
    className: 'bg-cyan/15 text-cyan border-cyan/30',
    icon: <Check size={12} strokeWidth={2} />,
  },
  repairing: {
    label: '修复中',
    className: 'bg-amber/15 text-amber border-amber/30',
    icon: <Loader2 size={12} strokeWidth={2} className="animate-spin" />,
  },
  completed: {
    label: '已完成',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    icon: <Check size={12} strokeWidth={2} />,
  },
  error: {
    label: '错误',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
    icon: <AlertCircle size={12} strokeWidth={2} />,
  },
};

export default function ImageCard({
  image,
  isSelected,
  onSelect,
  onClick,
  onDelete,
  showProgress,
  progress,
  progressMessage,
}: ImageCardProps) {
  const status = statusConfig[image.status];
  const isProcessing = image.status === 'detecting' || image.status === 'repairing';

  const handleClick = (e: React.MouseEvent) => {
    if (onSelect) {
      e.preventDefault();
      e.stopPropagation();
      onSelect();
      return;
    }
    onClick?.();
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      onClick={handleClick}
      className={`glass-panel group relative cursor-pointer overflow-hidden transition-all duration-300 hover:border-cyan/50 hover:shadow-glow ${
        isSelected ? 'ring-2 ring-cyan ring-offset-2 ring-offset-ink-900' : ''
      }`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-ink-800">
        {image.previewUrl ? (
          <img
            src={image.previewUrl}
            alt={image.originalName}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="shimmer-bg h-full w-full" />
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm">
            {showProgress && progress !== undefined ? (
              <div className="w-3/4 space-y-2">
                <div className="text-center text-xs text-ink-200">
                  {progressMessage || '处理中...'}
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full rounded-full bg-cyan transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                  />
                </div>
                <div className="text-center font-mono text-xs text-cyan">
                  {Math.round(progress)}%
                </div>
              </div>
            ) : (
              <Loader2 size={32} strokeWidth={2} className="animate-spin text-cyan" />
            )}
          </div>
        )}

        <div className="absolute left-3 top-3">
          <span className={`chip border ${status.className}`}>
            {status.icon}
            {status.label}
          </span>
        </div>

        <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          {!onSelect && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick?.();
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900/80 text-ink-200 backdrop-blur-sm transition-all hover:bg-cyan hover:text-ink-950"
            >
              <Eye size={16} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-900/80 text-ink-200 backdrop-blur-sm transition-all hover:bg-red-500 hover:text-white"
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <div className="space-y-2 p-4">
        <p className="truncate text-sm font-medium text-ink-100">
          {image.originalName}
        </p>
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <span>{image.width} × {image.height}</span>
          <span className="text-ink-600">·</span>
          <span>{(image.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
      </div>
    </div>
  );
}
