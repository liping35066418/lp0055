import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Check } from 'lucide-react';
import Header from '@/components/Header';
import ImagePreview from '@/components/ImagePreview';
import { useAppStore } from '@/store/appStore';
import { downloadImageUrl } from '@/utils/api';
import type { DownloadOptions } from '@/types';

const formatOptions: {
  value: DownloadOptions['format'];
  label: string;
  description: string;
  hasQuality: boolean;
}[] = [
  { value: 'png', label: 'PNG', description: '无损压缩，透明背景支持', hasQuality: false },
  { value: 'jpg', label: 'JPG', description: '有损压缩，体积较小', hasQuality: true },
  { value: 'webp', label: 'WebP', description: '现代格式，高压缩率', hasQuality: true },
  { value: 'tiff', label: 'TIFF', description: '高质量印刷格式', hasQuality: false },
];

const scaleOptions: { value: number; label: string }[] = [
  { value: 1, label: '原尺寸' },
  { value: 0.5, label: '0.5×' },
  { value: 2, label: '2×' },
];

export default function DownloadCenter() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { images } = useAppStore();

  const image = images.find((img) => img.id === id);

  const [format, setFormat] = useState<DownloadOptions['format']>('png');
  const [quality, setQuality] = useState(95);
  const [scale, setScale] = useState(1);

  const currentFormat = formatOptions.find((f) => f.value === format);

  const downloadUrl = useMemo(() => {
    if (!image) return '';
    return downloadImageUrl(image.id, format, quality, scale);
  }, [image, format, quality, scale]);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `repaired_${image?.originalName.replace(/\.[^/.]+$/, '')}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl, image, format]);

  const estimatedSize = useMemo(() => {
    if (!image) return '';
    let baseSize = image.size;
    if (currentFormat?.hasQuality) {
      baseSize = baseSize * (quality / 100);
    }
    if (format === 'jpg') {
      baseSize = baseSize * 0.6;
    } else if (format === 'webp') {
      baseSize = baseSize * 0.5;
    } else if (format === 'png') {
      baseSize = baseSize * 1.2;
    } else if (format === 'tiff') {
      baseSize = baseSize * 2;
    }
    baseSize = baseSize * scale * scale;
    if (baseSize < 1024) {
      return `${baseSize.toFixed(1)} B`;
    } else if (baseSize < 1024 * 1024) {
      return `${(baseSize / 1024).toFixed(1)} KB`;
    } else {
      return `${(baseSize / 1024 / 1024).toFixed(2)} MB`;
    }
  }, [image, format, quality, scale, currentFormat]);

  if (!image) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header
          leftContent={
            <button
              onClick={() => navigate('/')}
              className="btn-ghost mr-2 flex h-9 w-9 items-center justify-center p-0"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          }
        />
        <div className="container flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mb-4 text-ink-400">图片不存在</div>
            <button onClick={() => navigate('/')} className="btn-primary">
              返回首页
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        leftContent={
          <button
            onClick={() => navigate('/')}
            className="btn-ghost mr-2 flex h-9 w-9 items-center justify-center p-0"
            title="返回"
          >
            <ArrowLeft size={20} strokeWidth={2} />
          </button>
        }
        centerContent={
          <span className="chip-active">
            <Check size={12} strokeWidth={2} />
            修复完成
          </span>
        }
      />

      <div className="container flex flex-1 min-h-0 gap-6 py-6 lg:grid lg:grid-cols-1fr-[320px]">
        <section className="glass-panel flex min-h-0 flex-col overflow-hidden p-4">
          <ImagePreview
            src={`/api/images/${image.id}/download?result=false`}
            alt={image.originalName}
            resultSrc={`/api/images/${image.id}/download?result=true`}
            showCompare={!!image.resultUrl}
          />
          <div className="mt-4 flex items-center justify-between text-sm text-ink-400">
            <div>
              <span className="font-mono">
                {image.width} × {image.height}
              </span>
              {scale !== 1 && (
                <span className="ml-2 text-cyan">
                  → {Math.round(image.width * scale)} × {Math.round(image.height * scale)}
                </span>
              )}
            </div>
            <div>
              预估文件大小: <span className="font-mono text-ink-200">{estimatedSize}</span>
            </div>
          </div>
        </section>

        <aside className="glass-panel flex flex-col p-6">
          <h2 className="mb-6 font-display text-xl font-semibold text-ink-50">
            下载选项
          </h2>

          <div className="mb-6">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              输出格式
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {formatOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={`relative rounded-xl border p-3 text-left transition-all duration-200 ${
                    format === opt.value
                      ? 'border-cyan/50 bg-cyan/10'
                      : 'border-ink-700 bg-ink-800/40 hover:border-ink-600'
                  }`}
                >
                  {format === opt.value && (
                    <div className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-cyan text-ink-950">
                      <Check size={12} strokeWidth={3} />
                    </div>
                  )}
                  <div
                    className={`font-medium text-sm ${
                      format === opt.value ? 'text-cyan' : 'text-ink-100'
                    }`}
                  >
                    {opt.label}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {opt.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {currentFormat?.hasQuality && (
            <div className="mb-6">
              <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-400">
                <span>压缩质量</span>
                <span className="font-mono text-cyan">{quality}%</span>
              </h3>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="input-range"
              />
              <div className="mt-2 flex justify-between text-xs text-ink-500">
                <span>更小体积</span>
                <span>更高质量</span>
              </div>
            </div>
          )}

          <div className="mb-8">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              缩放比例
            </h3>
            <div className="flex gap-2">
              {scaleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScale(opt.value)}
                  className={`flex-1 rounded-full py-2.5 text-sm font-medium transition-all duration-200 ${
                    scale === opt.value
                      ? 'bg-cyan text-ink-950 shadow-glow'
                      : 'bg-ink-800 text-ink-300 border border-ink-700 hover:border-cyan/50 hover:text-cyan'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleDownload}
            disabled={!image.resultUrl}
            className="btn-primary mt-auto flex items-center justify-center gap-2 text-base"
          >
            <Download size={20} strokeWidth={2} />
            下载修复后的图片
          </button>

          <button
            onClick={() => navigate('/')}
            className="btn-ghost mt-3 py-2.5 text-sm"
          >
            继续修复更多图片
          </button>
        </aside>
      </div>
    </div>
  );
}
