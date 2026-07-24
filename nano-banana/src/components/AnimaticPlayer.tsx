import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GeneratedFrame } from '../types';
import { calculateDurationSeconds } from '../utils/srtParser';
import { X, Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';

interface AnimaticPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  frames: GeneratedFrame[];
}

/**
 * Preview Animatic: reproduz os frames concluídos em sequência usando a
 * duração real de cada bloco SRT — um "assistir antes de gerar os vídeos".
 */
export const AnimaticPlayer: React.FC<AnimaticPlayerProps> = ({ isOpen, onClose, frames }) => {
  const playable = useMemo(
    () => [...frames].filter((f) => f.status === 'completed' && f.imageUrl).sort((a, b) => a.id - b.id),
    [frames]
  );

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIndex(0);
      setPlaying(true);
    } else {
      setPlaying(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !playing || playable.length === 0) return;

    const frame = playable[index];
    // Cartelas/B-roll têm duração 0 no SRT; usa 3s padrão para elas
    const rawSeconds = calculateDurationSeconds(frame.timeStart, frame.timeEnd);
    const durationMs = Math.max((rawSeconds || 3) * 1000, 800) / speed;

    timerRef.current = window.setTimeout(() => {
      if (index < playable.length - 1) {
        setIndex(index + 1);
      } else {
        setPlaying(false);
      }
    }, durationMs);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [isOpen, playing, index, speed, playable]);

  if (!isOpen) return null;

  if (playable.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
          <p className="text-sm font-bold text-white">Nenhum frame concluído para reproduzir.</p>
          <p className="text-xs text-slate-400">Gere as imagens pela fila e volte aqui para assistir o animatic.</p>
        </div>
      </div>
    );
  }

  const frame = playable[index];
  const progressPercent = ((index + 1) / playable.length) * 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-950/80">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-bold text-amber-400">▶ Preview Animatic</span>
          <span className="text-slate-400 font-mono">
            {index + 1} / {playable.length}
          </span>
          <span className="text-slate-500 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" /> {frame.timeStart}
          </span>
          {frame.isTitleCard && <span className="bg-amber-400 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded">CARTELA</span>}
          {frame.isBroll && <span className="bg-teal-400 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded">B-ROLL</span>}
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stage */}
      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        <img src={frame.imageUrl} alt={`Frame ${frame.id}`} className="max-w-full max-h-full object-contain" />

        {/* Subtitle overlay (como ficará no vídeo final) */}
        {!frame.isTitleCard && (
          <div className="absolute bottom-8 left-0 right-0 flex justify-center px-8 pointer-events-none">
            <p className="bg-black/70 text-white text-sm sm:text-base font-medium px-4 py-2 rounded-lg max-w-3xl text-center leading-snug">
              {frame.subtitleText.replace(/^B-ROLL:\s*/, '')}
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-5 py-4 bg-slate-950/80 space-y-3">
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 transition-all duration-300" style={{ width: `${progressPercent}%` }} />
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setIndex(Math.max(0, index - 1))}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Frame anterior"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              if (!playing && index === playable.length - 1) setIndex(0);
              setPlaying(!playing);
            }}
            className="p-3.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors"
            title={playing ? 'Pausar' : 'Reproduzir'}
          >
            {playing ? <Pause className="w-5 h-5 fill-slate-950" /> : <Play className="w-5 h-5 fill-slate-950" />}
          </button>

          <button
            onClick={() => setIndex(Math.min(playable.length - 1, index + 1))}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            title="Próximo frame"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 ml-4 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {[1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  speed === s ? 'bg-amber-400 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
