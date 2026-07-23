import React from 'react';
import { Film, Sparkles, Settings, Download, Play, Sliders, Image as ImageIcon, Trash2, Power } from 'lucide-react';

interface HeaderProps {
  totalFrames: number;
  completedFrames: number;
  inProgress: boolean;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onOpenPromptMatrix: () => void;
  onOpenEntities?: () => void;
  hasPrompts: boolean;
  hasEntities?: boolean;
  onClearData?: () => void;
  onHardReset?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  totalFrames,
  completedFrames,
  inProgress,
  onOpenSettings,
  onOpenExport,
  onOpenPromptMatrix,
  onOpenEntities,
  hasPrompts,
  hasEntities,
  onClearData,
  onHardReset,
}) => {
  const progressPercent = totalFrames > 0 ? Math.round((completedFrames / totalFrames) * 100) : 0;

  return (
    <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 lg:px-8 py-3.5 shadow-xl">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand Logo & Tagline */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 text-slate-950 font-black shadow-lg shadow-amber-500/20 ring-1 ring-yellow-300/50">
            <span className="text-xl tracking-tighter">🍌</span>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-slate-900 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-slate-950" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-1.5">
                NANO BANANA
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-400/10 text-amber-400 border border-amber-400/30 rounded-full">
                  AI Studio Mass Engine
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Automação de imagens em massa por SRT + Gemini &amp; Stylecard
            </p>
          </div>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Progress Indicator Badge */}
          {totalFrames > 0 && (
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs">
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-slate-300 font-medium">
                {completedFrames} / {totalFrames} Imagens ({progressPercent}%)
              </span>
            </div>
          )}

          {/* Entities Registry Review */}
          {hasEntities && onOpenEntities && (
            <button
              onClick={onOpenEntities}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Entidades Canônicas
            </button>
          )}

          {/* Prompt Matrix Viewer */}
          {hasPrompts && (
            <button
              onClick={onOpenPromptMatrix}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
              Matriz de Prompts
            </button>
          )}

          {/* Export Center Button */}
          <button
            onClick={onOpenExport}
            disabled={completedFrames === 0}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md ${
              completedFrames > 0
                ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-500/10 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border border-slate-800 opacity-60 cursor-not-allowed'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Lote ({completedFrames})
          </button>

          {/* Settings Trigger */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Configurações da Engine"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Clear Data Button */}
          {onClearData && (
             <button
              onClick={onClearData}
              className="p-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-400 border border-red-900/50 transition-colors ml-2"
              title="Limpar todos os dados e recomeçar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Hard Reset Button */}
          {onHardReset && (
             <button
              onClick={onHardReset}
              className="p-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-500 border border-red-900/50 transition-colors ml-2"
              title="Hard Reset (Limpar banco local e forçar recarregamento)"
            >
              <Power className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
