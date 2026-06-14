import { Wand2 } from 'lucide-react';

interface HeaderProps {
  leftContent?: React.ReactNode;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export default function Header({ leftContent, centerContent, rightContent }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-ink-800 bg-ink-900/80 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          {leftContent}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan/15 text-cyan">
              <Wand2 size={20} strokeWidth={2} />
            </div>
            <span className="font-display text-lg font-semibold text-ink-50">
              像素修复师
            </span>
          </div>
        </div>

        <div className="flex items-center">{centerContent}</div>

        <div className="flex items-center">
          {rightContent ?? (
            <span className="chip-default">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
              单文件 ≤10MB
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
