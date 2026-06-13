import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ImageOff, Sparkles } from 'lucide-react';
import Header from '@/components/Header';
import ImageUploader from '@/components/ImageUploader';
import ImageCard from '@/components/ImageCard';
import ProgressBar from '@/components/ProgressBar';
import { useAppStore } from '@/store/appStore';
import {
  uploadImage,
  getHistory,
  deleteImage as deleteImageApi,
  subscribeProgress,
} from '@/utils/api';
import type { UploadImageResponse } from '@/types';

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    images,
    processingMap,
    addImage,
    updateImage,
    removeImage,
    loadHistory,
    updateTaskProgress,
  } = useAppStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getHistory()
      .then((data) => {
        loadHistory(data);
      })
      .catch((e) => {
        setError(e.message || '加载历史记录失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [loadHistory]);

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const results: UploadImageResponse[] = [];
      for (const file of files) {
        try {
          const result = await uploadImage(file);
          results.push(result);
          addImage({
            id: result.id,
            filename: result.filename,
            originalName: result.originalName,
            size: result.size,
            mimeType: result.mimeType,
            width: result.width,
            height: result.height,
            previewUrl: result.previewUrl,
            status: 'uploaded',
            createdAt: result.createdAt,
          });
        } catch (e) {
          console.error('Upload error:', e);
        }
      }

      if (results.length === 1) {
        navigate(`/editor/${results[0].id}`);
      }
    },
    [addImage, navigate]
  );

  const handleDeleteImage = useCallback(
    async (imageId: string) => {
      try {
        await deleteImageApi(imageId);
        removeImage(imageId);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(imageId);
          return next;
        });
      } catch (e) {
        console.error('Delete error:', e);
      }
    },
    [removeImage]
  );

  const handleBulkDelete = useCallback(async () => {
    for (const id of selectedIds) {
      try {
        await deleteImageApi(id);
        removeImage(id);
      } catch (e) {
        console.error('Delete error:', e);
      }
    }
    setSelectedIds(new Set());
  }, [selectedIds, removeImage]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCardClick = useCallback(
    (imageId: string) => {
      navigate(`/editor/${imageId}`);
    },
    [navigate]
  );

  const processingImages = images.filter(
    (img) => img.status === 'detecting' || img.status === 'repairing'
  );
  const completedImages = images.filter(
    (img) =>
      img.status !== 'detecting' && img.status !== 'repairing'
  );

  useEffect(() => {
    const cleanups: (() => void)[] = [];

    Object.values(processingMap).forEach((task) => {
      if (task.stage !== 'completed' && task.stage !== 'error') {
        const cleanup = subscribeProgress(task.taskId, (progress) => {
          updateTaskProgress(progress);
        });
        cleanups.push(cleanup);
      }
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [processingMap, updateTaskProgress]);

  const bulkMode = selectedIds.size > 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="container flex-1 py-8">
        <section className="mb-12">
          <div className="mb-6 text-center">
            <h1 className="mb-3 font-display text-4xl font-bold text-ink-50">
              AI 图片瑕疵修复
            </h1>
            <p className="text-ink-400">
              智能检测并修复水印、划痕、污渍，让图片焕然一新
            </p>
          </div>
          <ImageUploader onFilesSelected={handleFilesSelected} />
        </section>

        {processingImages.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 flex items-center gap-2 font-display text-xl font-semibold text-ink-100">
              <Sparkles
                size={20}
                strokeWidth={2}
                className="text-amber animate-pulse"
              />
              正在处理
            </h2>
            <div className="space-y-4">
              {processingImages.map((image) => {
                const task = Object.values(processingMap).find(
                  (t) => t.imageId === image.id
                );
                return (
                  <div
                    key={image.id}
                    className="glass-panel flex items-center gap-6 p-4"
                  >
                    <img
                      src={image.previewUrl}
                      alt={image.originalName}
                      className="h-20 w-28 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <p className="mb-2 font-medium text-ink-100">
                        {image.originalName}
                      </p>
                      <ProgressBar
                        progress={task?.progress || 0}
                        stage={
                          task?.stage === 'detecting'
                            ? '瑕疵检测中'
                            : task?.stage === 'processing'
                            ? '修复处理中'
                            : task?.stage === 'refining'
                            ? '优化细节中'
                            : task?.stage === 'queued'
                            ? '排队中'
                            : undefined
                        }
                        message={task?.message}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold text-ink-100">
              历史记录
              {completedImages.length > 0 && (
                <span className="ml-2 text-sm font-normal text-ink-400">
                  ({completedImages.length})
                </span>
              )}
            </h2>
            {bulkMode && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-ink-400">
                  已选择 {selectedIds.size} 项
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="btn-secondary flex items-center gap-2 py-2"
                >
                  <Trash2 size={16} strokeWidth={2} />
                  批量删除
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="glass-panel overflow-hidden"
                >
                  <div className="shimmer-bg aspect-[4/3] w-full" />
                  <div className="space-y-2 p-4">
                    <div className="shimmer-bg h-4 w-3/4 rounded" />
                    <div className="shimmer-bg h-3 w-1/2 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : completedImages.length === 0 ? (
            <div className="glass-panel flex flex-col items-center justify-center py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-800 text-ink-500">
                <ImageOff size={32} strokeWidth={2} />
              </div>
              <p className="mb-1 font-medium text-ink-200">暂无图片</p>
              <p className="text-sm text-ink-400">
                上传图片开始修复您的第一张图片
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {completedImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isSelected={selectedIds.has(image.id)}
                  onClick={() => handleCardClick(image.id)}
                  onDelete={() => handleDeleteImage(image.id)}
                  onSelect={
                    bulkMode ? () => toggleSelect(image.id) : undefined
                  }
                />
              ))}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
