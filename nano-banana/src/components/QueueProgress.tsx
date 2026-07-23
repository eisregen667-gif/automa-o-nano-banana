import React from 'react';
import { QueueProgressState } from '../types';
import { Play, Pause, Square, RefreshCw, Layers, CheckCircle2, AlertTriangle, Zap, Clock } from 'lucide-react';

interface QueueProgressProps {
  queueState: QueueProgressState;
  onStartQueue: () => void;
  onPauseQueue: () => void;
  onResumeQueue: () => void;
  onStopQueue: () => void;
  onRetryFailed: () => void;
  onChangeConcurrency: (concurrency: number) => void;
}

export const QueueProgress: React.FC<QueueProgressProps> = ({
  queueState,
  onStartQueue,
  onPauseQueue,
  onResumeQueue,
  onStopQueue,
  onRetryFailed,
  onChangeConcurrency,
}) => {
  const { total, completed, failed, inProgress, isPaused, concurrency } = queueState;

  if (total === 0) return null;

  const percent = Math.round(((completed + failed) / total) * 100);
  const remaining = total - (completed + failed);
  // Estimate ~3s per image divided by concurrency
  const estimatedSeconds = Math.max(0, Math.ceil((remaining * 3) / concurrency));

  return (
    <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4 relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Bar Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
              Fila de Geração Nano Banana
            </h3>
            {inProgress && !isPaused && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400/20 text-amber-400 border border-amber-400/40 animate-pulse">
                Processando Lote
              </span>
            )}
            {isPaused && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                Pausado
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {completed + failed} de {total} imagens processadas ({percent}%)
          </p>
        </div>

        {/* Action Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Concurrency Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <span className="text-[10px] font-semibold text-slate-400 px-1.5">Lote:</span>
            {[1, 2, 4].map((num) => (
              <button
                key={num}
                onClick={() => onChangeConcurrency(num)}
                className={`px-2 py-1 rounded-lg font-bold text-[11px] transition-all ${
                  concurrency === num
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {num}x
              </button>
            ))}
          </div>

          {!inProgress ? (
            <button
              onClick={onStartQueue}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-400/20 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              Iniciar Geração em Massa
            </button>
          ) : isPaused ? (
            <button
              onClick={onResumeQueue}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" /> Retomar
            </button>
          ) : (
            <button
              onClick={onPauseQueue}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" /> Pausar
            </button>
          )}

          {inProgress && (
            <button
              onClick={onStopQueue}
              className="px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 font-semibold text-xs border border-rose-800 flex items-center gap-1 transition-all cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" /> Parar
            </button>
          )}

          {failed > 0 && !inProgress && (
            <button
              onClick={onRetryFailed}
              className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold text-xs border border-amber-500/40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refazer Falhas ({failed})
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300 rounded-full transition-all duration-300 shadow-sm"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" /> {completed} Concluídas
          </span>
          {failed > 0 && (
            <span className="flex items-center gap-1 text-rose-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> {failed} Falhas
            </span>
          )}
          {inProgress && remaining > 0 && (
            <span className="flex items-center gap-1 text-slate-400 font-mono">
              <Clock className="w-3 h-3 text-amber-400" />
              Tempo est.: ~{estimatedSeconds}s restantes
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
