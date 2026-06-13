import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DetectionRegion, DefectType, BBox } from '@/types';

interface RegionOverlayProps {
  imageWidth: number;
  imageHeight: number;
  regions: DetectionRegion[];
  selectedId: string | null;
  onSelectRegion: (id: string | null) => void;
  onAddRegion: (bbox: BBox) => void;
  onRemoveRegion: (id: string) => void;
  drawMode: boolean;
}

const defectColors: Record<DefectType, string> = {
  watermark: '#22D3EE',
  scratch: '#F59E0B',
  stain: '#F87171',
  manual: '#A78BFA',
};

const defectLabels: Record<DefectType, string> = {
  watermark: '水印',
  scratch: '划痕',
  stain: '污渍',
  manual: '手动',
};

interface DrawState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export default function RegionOverlay({
  imageWidth,
  imageHeight,
  regions,
  selectedId,
  onSelectRegion,
  onAddRegion,
  onRemoveRegion,
  drawMode,
}: RegionOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawState, setDrawState] = useState<DrawState | null>(null);
  const [scale, setScale] = useState(1);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const x = (clientX - rect.left) / scale;
      const y = (clientY - rect.top) / scale;

      return {
        x: Math.max(0, Math.min(imageWidth, x)),
        y: Math.max(0, Math.min(imageHeight, y)),
      };
    },
    [imageWidth, imageHeight, scale]
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const newScale = Math.min(
      containerWidth / imageWidth,
      containerHeight / imageHeight
    );
    setScale(newScale);

    const displayWidth = imageWidth * newScale;
    const displayHeight = imageHeight * newScale;

    canvas.width = imageWidth * dpr;
    canvas.height = imageHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, imageWidth, imageHeight);

    regions.forEach((region) => {
      const color = defectColors[region.type];
      const isSelected = region.id === selectedId;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.fillStyle = `${color}${isSelected ? '33' : '1A'}`;

      ctx.beginPath();
      ctx.rect(
        region.bbox.x,
        region.bbox.y,
        region.bbox.width,
        region.bbox.height
      );
      ctx.fill();
      ctx.stroke();

      const labelHeight = 20;
      const labelPadding = 6;
      const labelText = `${defectLabels[region.type]} ${Math.round(region.confidence * 100)}%`;

      ctx.font = '12px system-ui';
      const labelWidth = ctx.measureText(labelText).width + labelPadding * 2;

      ctx.fillStyle = color;
      ctx.fillRect(
        region.bbox.x,
        region.bbox.y - labelHeight,
        labelWidth,
        labelHeight
      );

      ctx.fillStyle = '#020617';
      ctx.fillText(
        labelText,
        region.bbox.x + labelPadding,
        region.bbox.y - labelHeight / 2 + 4
      );

      ctx.restore();
    });

    if (drawState && drawState.isDrawing) {
      const x = Math.min(drawState.startX, drawState.currentX);
      const y = Math.min(drawState.startY, drawState.currentY);
      const w = Math.abs(drawState.currentX - drawState.startX);
      const h = Math.abs(drawState.currentY - drawState.startY);

      ctx.save();
      ctx.strokeStyle = defectColors.manual;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.fillStyle = `${defectColors.manual}1A`;

      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }, [imageWidth, imageHeight, regions, selectedId, drawState]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!drawMode) return;
      const coords = getCanvasCoords(e.clientX, e.clientY);
      setDrawState({
        isDrawing: true,
        startX: coords.x,
        startY: coords.y,
        currentX: coords.x,
        currentY: coords.y,
      });
    },
    [drawMode, getCanvasCoords]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!drawState?.isDrawing) return;
      const coords = getCanvasCoords(e.clientX, e.clientY);
      setDrawState((prev) =>
        prev
          ? { ...prev, currentX: coords.x, currentY: coords.y }
          : prev
      );
    },
    [drawState, getCanvasCoords]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawState?.isDrawing) return;

    const x = Math.min(drawState.startX, drawState.currentX);
    const y = Math.min(drawState.startY, drawState.currentY);
    const w = Math.abs(drawState.currentX - drawState.startX);
    const h = Math.abs(drawState.currentY - drawState.startY);

    if (w > 5 && h > 5) {
      onAddRegion({ x, y, width: w, height: h });
    }

    setDrawState(null);
  }, [drawState, onAddRegion]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (drawMode) return;

      const coords = getCanvasCoords(e.clientX, e.clientY);
      const clickedRegion = regions.find((r) => {
        return (
          coords.x >= r.bbox.x &&
          coords.x <= r.bbox.x + r.bbox.width &&
          coords.y >= r.bbox.y &&
          coords.y <= r.bbox.y + r.bbox.height
        );
      });

      onSelectRegion(clickedRegion ? clickedRegion.id : null);
    },
    [drawMode, regions, getCanvasCoords, onSelectRegion]
  );

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center"
      style={{ cursor: drawMode ? 'crosshair' : 'pointer' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
        className="absolute z-10"
      />
      {selectedId && !drawMode && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveRegion(selectedId);
          }}
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all hover:bg-red-600"
        >
          <X size={20} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
