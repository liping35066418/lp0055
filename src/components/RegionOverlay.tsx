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

interface DisplayInfo {
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
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
  const displayInfoRef = useRef<DisplayInfo>({
    displayWidth: 0,
    displayHeight: 0,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  });
  const [drawState, setDrawState] = useState<DrawState | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || imageWidth === 0 || imageHeight === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    if (containerWidth === 0 || containerHeight === 0) return;

    const scale = Math.min(
      containerWidth / imageWidth,
      containerHeight / imageHeight
    );
    const displayWidth = imageWidth * scale;
    const displayHeight = imageHeight * scale;
    const offsetX = (containerWidth - displayWidth) / 2;
    const offsetY = (containerHeight - displayHeight) / 2;

    displayInfoRef.current = { displayWidth, displayHeight, offsetX, offsetY, scale };

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.left = `${offsetX}px`;
    canvas.style.top = `${offsetY}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    regions.forEach((region) => {
      const color = defectColors[region.type];
      const isSelected = region.id === selectedId;

      const px = region.bbox.x * displayWidth;
      const py = region.bbox.y * displayHeight;
      const pw = region.bbox.width * displayWidth;
      const ph = region.bbox.height * displayHeight;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.fillStyle = `${color}${isSelected ? '33' : '1A'}`;

      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.fill();
      ctx.stroke();

      const labelHeight = 20;
      const labelPadding = 6;
      const labelText = `${defectLabels[region.type]} ${Math.round(region.confidence * 100)}%`;

      ctx.font = '12px system-ui';
      const labelWidth = ctx.measureText(labelText).width + labelPadding * 2;

      const labelX = px;
      const labelY = py > labelHeight ? py - labelHeight : py;

      ctx.fillStyle = color;
      ctx.fillRect(labelX, labelY, labelWidth, labelHeight);

      ctx.fillStyle = '#020617';
      ctx.fillText(
        labelText,
        labelX + labelPadding,
        labelY + labelHeight / 2 + 4
      );

      ctx.restore();
    });

    if (drawState && drawState.isDrawing) {
      const info = displayInfoRef.current;
      const sx = (drawState.startX / imageWidth) * info.displayWidth;
      const sy = (drawState.startY / imageHeight) * info.displayHeight;
      const cx = (drawState.currentX / imageWidth) * info.displayWidth;
      const cy = (drawState.currentY / imageHeight) * info.displayHeight;

      const x = Math.min(sx, cx);
      const y = Math.min(sy, cy);
      const w = Math.abs(cx - sx);
      const h = Math.abs(cy - sy);

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
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      draw();
    });

    resizeObserver.observe(container);

    const handleWindowResize = () => draw();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [draw]);

  const getCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const info = displayInfoRef.current;
      if (!canvas || info.displayWidth === 0) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * imageWidth;
      const y = ((clientY - rect.top) / rect.height) * imageHeight;

      return {
        x: Math.max(0, Math.min(imageWidth, x)),
        y: Math.max(0, Math.min(imageHeight, y)),
      };
    },
    [imageWidth, imageHeight]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!drawMode) return;
      e.preventDefault();
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

    if (w > 1 && h > 1) {
      const nx = Math.max(0, x / imageWidth);
      const ny = Math.max(0, y / imageHeight);
      const nw = Math.min(1 - nx, w / imageWidth);
      const nh = Math.min(1 - ny, h / imageHeight);
      onAddRegion({
        x: nx,
        y: ny,
        width: nw,
        height: nh,
      });
    }

    setDrawState(null);
  }, [drawState, onAddRegion, imageWidth, imageHeight]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (drawMode) return;

      const coords = getCanvasCoords(e.clientX, e.clientY);
      const nx = coords.x / imageWidth;
      const ny = coords.y / imageHeight;

      const clickedRegion = regions.find((r) => {
        return (
          nx >= r.bbox.x &&
          nx <= r.bbox.x + r.bbox.width &&
          ny >= r.bbox.y &&
          ny <= r.bbox.y + r.bbox.height
        );
      });

      onSelectRegion(clickedRegion ? clickedRegion.id : null);
    },
    [drawMode, regions, getCanvasCoords, onSelectRegion, imageWidth, imageHeight]
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
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
