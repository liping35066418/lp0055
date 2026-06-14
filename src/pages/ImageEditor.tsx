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
  Undo2,
  Download,
  CheckSquare,
  Square as SquareIcon,
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
  undoRepair,
  downloadImageUrl,
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

const DEFAULT_STRENGTH = 70;

export default function ImageEditor() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { images, updateImage, startTask, updateTaskProgress, clearTask } =
    useAppStore();

  const image = images.find((img) => img.id === id);

  const [regions, setRegions] = useState<DetectionRegion[]>([]);
  const [selectedRegionIds, setSelectedRegionIds] = useState<string[]>([]);
  const [mode, setMode] = useState<RepairMode>('auto');
  const [drawMode, setDrawMode] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [repairProgress, setRepairProgress] = useState(0);
  const [repairStage, setRepairStage] = useState('');
  const [repairMessage, setRepairMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (image && image.regions) {
      setRegions(
        image.regions.map((r) => ({
          ...r,
          strength: r.strength ?? DEFAULT_STRENGTH / 100,
        }))
      );
    }
  }, [image]);

  const runDetection = useCallback(async () => {
    if (!image) return;
    setIsDetecting(true);
    setError(null);
    try {
      updateImage(image.id, { status: 'detecting' });
      const result = await detectDefects(image.id);
      const regionsWithStrength = result.regions.map((r) => ({
        ...r,
        strength: DEFAULT_STRENGTH / 100,
      }));
      setRegions(regionsWithStrength);
      updateImage(image.id, {
        status: 'detected',
        regions: regionsWithStrength,
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

  const handleToggleRegion = useCallback((regionId: string, additive: boolean) => {
    setSelectedRegionIds((prev) => {
      if (additive) {
        if (prev.includes(regionId)) {
          return prev.filter((id) => id !== regionId);
        }
        return [...prev, regionId];
      }
      if (prev.length === 1 && prev[0] === regionId) {
        return [];
      }
      return [regionId];
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedRegionIds([]);
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedRegionIds(regions.map((r) => r.id));
  }, [regions]);

  const handleInvertSelection = useCallback(() => {
    setSelectedRegionIds(
      regions.filter((r) => !selectedRegionIds.includes(r.id)).map((r) => r.id)
    );
  }, [regions, selectedRegionIds]);

  const handleAddRegion = useCallback(
    (bbox: BBox) => {
      const newRegion: DetectionRegion = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'manual',
        confidence: 1,
        bbox,
        strength: DEFAULT_STRENGTH / 100,
      };
      setRegions((prev) => [...prev, newRegion]);
      setSelectedRegionIds([newRegion.id]);
      setDrawMode(false);
    },
    []
  );

  const handleRemoveRegion = useCallback((regionId: string) => {
    setRegions((prev) => prev.filter((r) => r.id !== regionId));
    setSelectedRegionIds((prev) => prev.filter((id) => id !== regionId));
  }, []);

  const handleClearAll = useCallback(() => {
    setRegions([]);
    setSelectedRegionIds([]);
  }, []);

  const handleRegionStrengthChange = useCallback((regionId: string, strength: number) => {
    setRegions((prev) =>
      prev.map((r) => (r.id === regionId ? { ...r, strength } : r))
    );
  }, []);

  const handleSetAllStrength = useCallback(
    (strength: number) => {
      if (selectedRegionIds.length === 0) return;
      setRegions((prev) =>
        prev.map((r) =>
          selectedRegionIds.includes(r.id) ? { ...r, strength } : r
        )
      );
    },
    [selectedRegionIds]
  );

  const handleStartRepair = useCallback(async () => {
    if (!image || selectedRegionIds.length === 0 || isRepairing) return;

    setIsRepairing(true);
    setError(null);
    setRepairProgress(0);
    setRepairStage('queued');
    setRepairMessage('任务已排队...');

    try {
      const selectedRegions = regions.filter((r) =>
        selectedRegionIds.includes(r.id)
      );
      const repairRegions = selectedRegions.map((r) => ({
        id: r.id,
        type: r.type,
        bbox: r.bbox,
        strength: r.strength ?? DEFAULT_STRENGTH / 100,
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
  }, [image, regions, selectedRegionIds, mode, isRepairing, startTask, updateTaskProgress, clearTask]);

  const handleUndo = useCallback(async () => {
    if (!image || isUndoing || isRepairing) return;
    if (!image.versions || image.versions.length === 0) return;

    setIsUndoing(true);
    setError(null);
    try {
      const updated = await undoRepair(image.id);
      updateImage(image.id, {
        status: updated.status,
        resultUrl: updated.resultUrl,
        versions: updated.versions,
        currentVersion: updated.currentVersion,
        completedAt: updated.completedAt,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setIsUndoing(false);
    }
  }, [image, isUndoing, isRepairing, updateImage]);

  const handleDownload = useCallback(() => {
    if (!image) return;
    const version = image.currentVersion && image.currentVersion > 0
      ? image.currentVersion
      : undefined;
    const url = downloadImageUrl(image.id, 'png', 100, 1, version);
    const link = document.createElement('a');
    link.href = url;
    link.download = `repaired_${image.originalName.replace(/\.[^/.]+$/, '')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [image]);

  const previewSrc = useMemo(() => {
    if (!image) return '';
    if (image.currentVersion && image.currentVersion > 0 && image.resultUrl) {
      return downloadImageUrl(image.id, 'webp', 85, 1, image.currentVersion);
    }
    return `/api/images/${image.id}/download?result=false`;
  }, [image]);

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

  const canUndo = !!(image?.versions && image.versions.length > 0 && !isRepairing && !isUndoing);

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
    <div className="flex h-screen flex-col">
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
          <div className="flex items-center gap-3">
            <span className="font-medium text-ink-100">{image.originalName}</span>
            {image.currentVersion && image.currentVersion > 0 && (
              <span className="chip-active text-xs">
                v{image.currentVersion}
              </span>
            )}
          </div>
        }
        rightContent={
          <div className="flex items-center gap-2">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="btn-secondary flex h-9 items-center gap-2 px-3"
              title="撤销上一次修复"
            >
              {isUndoing ? (
                <Loader2 size={16} strokeWidth={2} className="animate-spin" />
              ) : (
                <Undo2 size={16} strokeWidth={2} />
              )}
              撤销
            </button>
            <button
              onClick={handleDownload}
              disabled={!image.resultUrl || isRepairing}
              className="btn-secondary flex h-9 items-center gap-2 px-3"
              title="下载当前版本"
            >
              <Download size={16} strokeWidth={2} />
              下载
            </button>
          </div>
        }
      />

      <div className="flex flex-1 min-h-0 gap-6 p-6">
        <aside className="glass-panel w-[280px] shrink-0 min-h-0 flex flex-col gap-5 overflow-y-auto p-5">
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
              修复模式
            </h3>
            <div className="space-y-2">
              {modeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  disabled={isRepairing}
                  className={`w-full rounded-xl border p-3 text-left transition-all duration-200 ${
                    mode === opt.value
                      ? 'border-cyan/50 bg-cyan/10 text-ink-50'
                      : 'border-ink-700 bg-transparent text-ink-300 hover:border-ink-600'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
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

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={handleSelectAll}
                  disabled={isRepairing || regions.length === 0}
                  className="btn-secondary flex items-center justify-center gap-1.5 py-2 text-sm"
                >
                  <CheckSquare size={16} strokeWidth={2} />
                  全选
                </button>
                <button
                  onClick={handleInvertSelection}
                  disabled={isRepairing || regions.length === 0}
                  className="btn-secondary flex items-center justify-center gap-1.5 py-2 text-sm"
                >
                  <SquareIcon size={16} strokeWidth={2} />
                  反选
                </button>
              </div>

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

          {selectedRegionIds.length > 0 && (
            <div>
              <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-400">
                <span>选中区域强度</span>
                <span className="font-mono text-ink-500">{selectedRegionIds.length} 个</span>
              </h3>
              <div className="space-y-2">
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={(() => {
                    const selected = regions.filter((r) =>
                      selectedRegionIds.includes(r.id)
                    );
                    if (selected.length === 0) return DEFAULT_STRENGTH;
                    const avg =
                      selected.reduce(
                        (sum, r) => sum + ((r.strength ?? DEFAULT_STRENGTH / 100) * 100),
                        0
                      ) / selected.length;
                    return Math.round(avg);
                  })()}
                  onChange={(e) =>
                    handleSetAllStrength(Number(e.target.value) / 100)
                  }
                  disabled={isRepairing}
                  className="input-range"
                />
                <div className="flex justify-between text-xs text-ink-400">
                  <span>轻柔 30%</span>
                  <span>强力 100%</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        <section className="glass-panel flex min-h-0 min-w-0 flex-1 flex-col p-4">
          {image && (
            <ImagePreview
              src={previewSrc}
              alt={image.originalName}
              resultSrc={
                image.currentVersion && image.currentVersion > 0
                  ? downloadImageUrl(image.id, 'webp', 85, 1, image.currentVersion)
                  : undefined
              }
              showCompare={!!(image.resultUrl && image.currentVersion && image.currentVersion > 0)}
            >
              {image.width > 0 && image.height > 0 && (
                <RegionOverlay
                  imageWidth={image.width}
                  imageHeight={image.height}
                  regions={regions}
                  selectedIds={selectedRegionIds}
                  onToggleRegion={handleToggleRegion}
                  onClearSelection={handleClearSelection}
                  onAddRegion={handleAddRegion}
                  onRemoveRegion={handleRemoveRegion}
                  drawMode={drawMode}
                />
              )}
            </ImagePreview>
          )}

          <div className="mt-4 shrink-0 flex items-center justify-between gap-4">
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
              {selectedRegionIds.length > 0 && (
                <span className="chip-active">
                  已选 {selectedRegionIds.length} 个
                </span>
              )}
            </div>
            <button
              onClick={handleStartRepair}
              disabled={
                selectedRegionIds.length === 0 || isDetecting || isRepairing
              }
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
            >
              {isRepairing ? (
                <Loader2 size={18} strokeWidth={2} className="animate-spin" />
              ) : (
                <Wand2 size={18} strokeWidth={2} />
              )}
              {isRepairing
                ? '修复中...'
                : selectedRegionIds.length > 0
                  ? `修复选中的 ${selectedRegionIds.length} 个区域`
                  : '请先选择区域'}
            </button>
          </div>

          {isRepairing && (
            <div className="mt-4 shrink-0">
              <ProgressBar
                progress={repairProgress}
                stage={stageLabels[repairStage] || repairStage}
                message={repairMessage}
              />
            </div>
          )}

          {error && (
            <div className="mt-4 shrink-0 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </section>

        <aside className="glass-panel w-[320px] shrink-0 min-h-0 flex flex-col p-5">
          <h3 className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink-400">
            <span>区域列表</span>
            <span className="font-mono text-ink-500">{regions.length}</span>
          </h3>

          {regions.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-ink-800 text-ink-500">
                <Sparkles size={22} strokeWidth={2} />
              </div>
              <p className="text-sm text-ink-300">暂无检测区域</p>
              <p className="mt-1 text-xs text-ink-500">
                点击"检测瑕疵"或手动绘制
              </p>
            </div>
          ) : (
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {regions.map((region, idx) => {
                const isSelected = selectedRegionIds.includes(region.id);
                const strengthPercent = Math.round(
                  (region.strength ?? DEFAULT_STRENGTH / 100) * 100
                );
                return (
                  <div
                    key={region.id}
                    onClick={() => handleToggleRegion(region.id, false)}
                    className={`group cursor-pointer rounded-xl border p-3 transition-all duration-200 ${
                      isSelected
                        ? 'border-cyan/50 bg-cyan/5'
                        : 'border-ink-700 bg-ink-800/40 hover:border-ink-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
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
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="font-medium text-sm truncate"
                            style={{ color: defectTypeColors[region.type] }}
                          >
                            {defectTypeLabels[region.type]}
                          </span>
                          {region.confidence < 1 && (
                            <span className="text-xs text-ink-500 shrink-0">
                              {Math.round(region.confidence * 100)}%
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveRegion(region.id);
                            }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-500 opacity-0 transition-all hover:bg-red-500/15 hover:text-red-400 group-hover:opacity-100"
                          >
                            <X size={14} strokeWidth={2} />
                          </button>
                        </div>
                        <div className="mt-0.5 text-xs text-ink-500 font-mono">
                          {Math.round(region.bbox.x * image.width)}×
                          {Math.round(region.bbox.y * image.height)}
                          {' · '}
                          {Math.round(region.bbox.width * image.width)}×
                          {Math.round(region.bbox.height * image.height)}
                        </div>

                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-ink-500 mb-1">
                            <span>修复强度</span>
                            <span className="font-mono text-cyan">
                              {strengthPercent}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={30}
                            max={100}
                            value={strengthPercent}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleRegionStrengthChange(
                                region.id,
                                Number(e.target.value) / 100
                              );
                            }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={isRepairing}
                            className="input-range w-full"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
