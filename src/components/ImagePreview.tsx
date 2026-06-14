import { useCallback, useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, Move, RefreshCw } from 'lucide-react';

interface ImagePreviewProps {
  src: string;
  alt?: string;
  resultSrc?: string;
  showCompare?: boolean;
  children?: React.ReactNode;
}

export default function ImagePreview({
  src,
  alt = '预览图片',
  resultSrc,
  showCompare = false,
  children,
}: ImagePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [sliderPos, setSliderPos] = useState(50);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [resultLoaded, setResultLoaded] = useState(false);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z * 1.2, 5));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(z / 1.2, 0.5));
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (showCompare) return;
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    },
    [showCompare, position]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleSliderMove = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      setSliderPos(Math.max(0, Math.min(100, x)));
    },
    []
  );

  const handleSliderDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handleSliderMove(e);

      const handleMove = (moveEvent: MouseEvent) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const x =
          ((moveEvent.clientX - rect.left) / rect.width) * 100;
        setSliderPos(Math.max(0, Math.min(100, x)));
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [handleSliderMove]
  );

  useEffect(() => {
    setImageLoaded(false);
  }, [src]);

  useEffect(() => {
    setResultLoaded(false);
  }, [resultSrc]);

  return (
    <div className="flex h-0 w-full flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={showCompare}
            className="btn-ghost flex h-9 w-9 items-center justify-center p-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="缩小"
          >
            <ZoomOut size={18} strokeWidth={2} />
          </button>
          <span className="w-16 text-center font-mono text-sm text-ink-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={showCompare}
            className="btn-ghost flex h-9 w-9 items-center justify-center p-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="放大"
          >
            <ZoomIn size={18} strokeWidth={2} />
          </button>
          <button
            onClick={handleReset}
            disabled={showCompare}
            className="btn-ghost flex h-9 w-9 items-center justify-center p-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title="重置"
          >
            <RefreshCw size={18} strokeWidth={2} />
          </button>
        </div>
        {!showCompare && (
          <div className="flex items-center gap-1 text-xs text-ink-400">
            <Move size={14} strokeWidth={2} />
            拖拽平移
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="relative h-0 flex-1 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: showCompare ? 'default' : isDragging ? 'grabbing' : 'grab' }}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 z-0">
            <div className="shimmer-bg h-full w-full" />
          </div>
        )}

        {showCompare && resultSrc ? (
          <>
            <img
              src={src}
              alt={`${alt} - 原图`}
              onLoad={() => setImageLoaded(true)}
              className="absolute inset-0 h-full w-full object-contain"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                clipPath: `inset(0 0 0 ${sliderPos}%)`,
              }}
            >
              <img
                src={resultSrc}
                alt={`${alt} - 修复后`}
                onLoad={() => setResultLoaded(true)}
                className="absolute inset-0 h-full w-full object-contain"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
                draggable={false}
              />
            </div>
            <div
              className="absolute inset-y-0 z-20 w-1 cursor-ew-resize bg-cyan shadow-glow"
              style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
              onMouseDown={handleSliderDown}
            >
              <div className="absolute top-1/2 left-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-cyan text-ink-950 shadow-glow">
                <div className="flex gap-1">
                  <div className="h-4 w-0.5 rounded-full bg-ink-950" />
                  <div className="h-4 w-0.5 rounded-full bg-ink-950" />
                </div>
              </div>
            </div>
            <div className="absolute bottom-4 left-4 chip bg-ink-900/80 backdrop-blur-sm">
              原图
            </div>
            {resultLoaded && (
              <div className="absolute bottom-4 right-4 chip-active">
                修复后
              </div>
            )}
          </>
        ) : (
          <img
            src={src}
            alt={alt}
            onLoad={() => setImageLoaded(true)}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        )}

        {children && (
          <div className="absolute inset-0 z-10">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
