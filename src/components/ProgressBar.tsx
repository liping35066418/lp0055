interface ProgressBarProps {
  progress: number;
  stage?: string;
  message?: string;
  showPulse?: boolean;
}

export default function ProgressBar({
  progress,
  stage,
  message,
  showPulse = true,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className="w-full space-y-2">
      {(stage || message) && (
        <div className="flex items-center justify-between text-sm">
          {stage && (
            <span className="font-medium text-cyan">{stage}</span>
          )}
          <span className="text-ink-400">{message}</span>
          <span className="font-mono text-ink-300">
            {Math.round(clampedProgress)}%
          </span>
        </div>
      )}
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ease-out ${
            showPulse && clampedProgress < 100 ? 'animate-pulseGlow' : ''
          }`}
          style={{
            width: `${clampedProgress}%`,
            background:
              'linear-gradient(90deg, #22D3EE 0%, #06B6D4 50%, #22D3EE 100%)',
          }}
        />
      </div>
    </div>
  );
}
