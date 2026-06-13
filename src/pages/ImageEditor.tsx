import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  Loader2,
  X,
} from 'lucide-react';
import Header from '@/components/Header';
import ImagePreview from '@/components/ImagePreview';
import RegionOverlay from '@/components/RegionOverlay';
import ProgressBar from '@/components/ProgressBar';
import { useAppStore } from '@/store/appStore';
import {
  detectDefects,
  startRepair,
  subscribeProgress,
} from '@/utils/api';
import type {
  DetectionRegion,
  DefectType,
  RepairMode,
  BBox,
} from '@/types';

const defectTypeColors: Record<DefectType, string> = {
  watermark: '#22D3EE',
  scratch: '#F59E0B',
  stain: '#F87171',
  manual: '#A78BFA',
};

const defectTypeLabels: Record<DefectType, string> = {
  watermark: '水印',
  scratch: '划痕',
  stain: '污渍',
  manual: '手动标记',
};

const modeOptions: {
  value: RepairMode;
  label: string;
  description: string;
}[] = [
  { value: 'auto', label: '自动检测', description: '智能识别各类瑕疵' },
  { value: 'light-watermark', label: '浅水印模式', description: '针对半透明水印优化' },
  { value: 'dense-defects', label: '密集瑕疵模式', description: '处理多处小瑕疵' },
];

const stageLabels: Record<string, string> = {
  detecting: '瑕疵检测中',
  queued: '排队中',
  processing: '修复处理中',
  refining: '优化细节中',
  completed: '已完成',
  error: '出错',
};

export default function ImageEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { images, updateImage, startTask, updateTaskProgress, clearTask } =
    useAppStore();

  const image = images.find((img) => img.id === id);

  const [regions, setRegions] = useState<DetectionRegion[]>([]);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [mode, setMode] = useState<RepairMode>('auto');
  const [drawMode, setDrawMode] = useState(false);
  const [strength, setStrength] = useState(70);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairProgress, setRepairProgress] = useState(0);
  const [repairStage, setRepairStage] = useState('');
  const [repairMessage, setRepairMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (image && image.regions) {
      setRegions(image.regions);
    }
  }, [image]);

  const runDetection = useCallback(async () => {
    if (!image) return;
    setIsDetecting(true);
    setError(null);
    try {
      updateImage(image.id, { status: 'detecting' });
      const result = await detectDefects(image.id);
      setRegions(result.regions);
      updateImage(image.id, {
        status: 'detected',
        regions: result.regions,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '检测失败');
      updateImage(image.id, { status: 'uploaded' });
    } finally {
      setIsDetecting(false);
    }
  }, [image, updateImage]);

  useEffect(() => {
    if (image && image.status === 'uploaded' && !isDetecting) {
      runDetection();
    }
  }, [image, isDetecting, runDetection]);

  const handleAddRegion = useCallback(
    (bbox: BBox) => {
      const newRegion: DetectionRegion = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'manual',
        confidence: 1,
        bbox,
      };
      setRegions((prev) => [...prev, newRegion]);
      setDrawMode(false);
    },
    []
  );

  const handleRemoveRegion = useCallback((regionId: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== regionId));
    setSelectedRegionId(null);
  }, []);

  const handleClearAll = useCallback(() => {
    setRegions([]);
    setSelectedRegionId(null);
  }, []);

  const handleStartRepair = useCallback(async () => {
    if (!image || regions.length === 0 || isRepairing) return;

    setIsRepairing(true);
    setError(null);
    setRepairProgress(0);
    setRepairStage('queued');
    setRepairMessage('任务已排队...');

    try {
      const repairRegions = regions.map((r) => ({
        id: r.id,
        type: r.type,
        bbox: r.bbox,
        strength: strength / 100,
      }));

      const { taskId } = await startRepair(image.id, repairRegions, mode);
      startTask(taskId, image.id);

      subscribeProgress(taskId, (progress) => {
        updateTaskProgress(progress);
        setRepairProgress(progress.progress);
        setRepairStage(progress.stage);
        setRepairMessage(progress.message);

        if (progress.stage === 'completed') {
          clearTask(taskId);
          setIsRepairing(false);
          navigate(`/download/${image.id}`);
        } else if (progress.stage === 'error') {
          clearTask(taskId);
          setIsRepairing(false);
          setError(progress.message || '修复失败');
        }
      });
    } catch (e) {
      setIsRepairing(false);
      setError(e instanceof Error ? e.message : '修复失败');
    }
  }, [image, regions, mode, strength, isRepairing, startTask, updateTaskProgress, clearTask, navigate]);

  const defectStats = useMemo(() => {
    const stats: Record<DefectType, number> = {
      watermark: 0,
      scratch: 0,
      stain: 0,
      manual: 0,
    };
    regions.forEach((r) => {
      stats[r.type] = (stats[r.type] || 0) + 1;
    });
    return stats;
  }, [regions]);

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
    <div className="flex min-h-screen flex-col">
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
          <span className="font-medium text-ink-100">{image.originalName}</span>
        }
      />

      <div className="container flex flex-1 gap-6 py-6 lg:grid lg:grid-cols-[240px_1fr_280px]">
        <aside className="glass-panel flex flex-col gap-6 p-5">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              修复模式
            </h3>
            <div className="space-y-2">
              {modeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${
                    mode === opt.value
                      ? 'border-cyan/50 bg-cyan/10 text-ink-50'
                      : 'border-ink-700 bg-transparent text-ink-300 hover:border-ink-600'
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-ink-400">{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              工具
            </h3>
            <div className="space-y-2">
              <button
                onClick={runDetection}
                disabled={isDetecting || isRepairing}
                className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5"
              >
                {isDetecting ? (
                  <Loader2 size={18} strokeWidth={2} className="animate-spin" />
                ) : (
                  <Sparkles size={18} strokeWidth={2} />
                )}
                {isDetecting ? '检测中...' : '检测瑕疵'}
              </button>
              <button
                onClick={() => setDrawMode((v) => !v)}
                disabled={isRepairing}
                className={`flex w-full items-center justify-center gap-2 rounded-full px-6 py-2.5 font-medium transition-all duration-300 ${
                  drawMode
                    ? 'bg-cyan text-ink-950 shadow-glow'
                    : 'bg-ink-800 text-ink-100 border border-ink-700 hover:border-cyan/50 hover:text-cyan'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Square size={18} strokeWidth={2} />
                {drawMode ? '绘制中...' : '矩形框选'}
              </button>
              <button
                onClick={handleClearAll}
                disabled={isRepairing || regions.length === 0}
                className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5"
              >
                <Trash2 size={18} strokeWidth={2} />
                清除全部
              </button>
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              修复强度
            </h3>
            <div className="space-y-2">
              <input
                type="range"
                min={30}
                max={100}
                value={strength}
                onChange={(e) => setStrength(Number(e.target.value))}
                disabled={isRepairing}
                className="input-range"
              />
              <div className="flex justify-between text-xs text-ink-400">
                <span>30%</span>
                <span className="font-mono font-medium text-cyan">{strength}%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="glass-panel flex flex-col overflow-hidden p-4">
          {image && (
            <ImagePreview
              src={image.previewUrl}
              alt={image.originalName}
            >
              {image.width > 0 && image.height > 0 && (
                <RegionOverlay
                  imageWidth={image.width}
                  imageHeight={image.height}
                  regions={regions}
                  selectedId={selectedRegionId}
                  onSelectRegion={setSelectedRegionId}
                  onAddRegion={handleAddRegion}
                  onRemoveRegion={handleRemoveRegion}
                  drawMode={drawMode}
                />
              )}
            </ImagePreview>
          )}

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(defectStats) as DefectType[]).map((type) => (
                <span
                  key={type}
                  className="chip border"
                  style={{
                    borderColor: `${defectTypeColors[type]}50`,
                    backgroundColor: `${defectTypeColors[type]}15`,
                    color: defectTypeColors[type],
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: defectTypeColors[type] }}
                  />
                  {defectTypeLabels[type]} · {defectStats[type]}
                </span>
              ))}
            </div>
            <button
              onClick={handleStartRepair}
              disabled={
                regions.length === 0 || isDetecting || isRepairing
              }
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              {isRepairing ? (
                <Loader2 size={18} strokeWidth={2} className="animate-spin" />
              ) : (
                <Wand2 size={18} strokeWidth={2} />
              )}
              {isRepairing ? '修复中...' : '开始修复'}
            </button>
          </div>

          {isRepairing && (
            <div className="mt-4">
              <ProgressBar
                progress={repairProgress}
                stage={stageLabels[repairStage] || repairStage}
                message={repairMessage}
              />
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </section>

        <aside className="glass-panel flex flex-col p-5">
          <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-400">
            <span>区域列表</span>
            <span className="font-mono text-ink-500">{regions.length}</span>
          </h3>

          {regions.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 text-ink-500">
                <Sparkles size={22} strokeWidth={2} />
              </div>
              <p className="text-sm text-ink-300">暂无检测区域</p>
              <p className="mt-1 text-xs text-ink-500">
                点击"检测瑕疵"或手动绘制
              </p>
            </div>
          ) : (
            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {regions.map((region, idx) => (
                <div
                  key={region.id}
                  onClick={() => setSelectedRegionId(region.id)}
                  className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all duration-200 ${
                    selectedRegionId === region.id
                      ? 'border-cyan/50 bg-cyan/5'
                      : 'border-ink-700 bg-ink-800/40 hover:border-ink-600'
                  }`}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    style={{
                      backgroundColor: `${defectTypeColors[region.type]}20`,
                      color: defectTypeColors[region.type],
                    }}
                  >
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-medium text-sm"
                        style={{ color: defectTypeColors[region.type] }}
                      >
                        {defectTypeLabels[region.type]}
                      </span>
                      {region.confidence < 1 && (
                        <span className="text-xs text-ink-500">
                          {Math.round(region.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500 font-mono">
                      {Math.round(region.bbox.x)}×{Math.round(region.bbox.y)}
                      {' · '}
                      {Math.round(region.bbox.width)}×{Math.round(region.bbox.height)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRegion(region.id);
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-500 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
