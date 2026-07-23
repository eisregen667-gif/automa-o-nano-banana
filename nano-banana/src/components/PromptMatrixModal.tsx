import React, { useState } from 'react';
import { GeneratedFrame } from '../types';
import { Sliders, X, Edit2, Play, Sparkles, Clock, Check, Copy, Download } from 'lucide-react';

interface PromptMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  frames: GeneratedFrame[];
  onUpdateFramePrompt: (id: number, updatedPrompt: string) => void;
  onStartQueue: () => void;
}

export const PromptMatrixModal: React.FC<PromptMatrixModalProps> = ({
  isOpen,
  onClose,
  frames,
  onUpdateFramePrompt,
  onStartQueue,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const getPromptsTxtContent = () => {
    return frames.map((f) => `${f.id} ${f.visualPrompt}`).join('\n\n');
  };

  const handleCopyPrompts = () => {
    const text = getPromptsTxtContent();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadPromptsTxt = () => {
    const content = getPromptsTxtContent();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PROMPTS.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Matriz de Prompts do Gemini
                <span className="text-xs bg-amber-400/10 text-amber-400 px-2.5 py-0.5 rounded-full border border-amber-400/30">
                  {frames.length} Prompts Veo Flow
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-mono">
                  01_SKILL_PRINCIPAL ACTIVE
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Revise os prompts sincronizados para Veo Flow com segurança, enquadramentos e context windowing.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prompts List Container */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 scrollbar-thin">
          {frames.map((frame) => (
            <div
              key={frame.id}
              className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center">
                    #{frame.id}
                  </span>
                  <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {frame.timeStart} &rarr; {frame.timeEnd}
                  </span>
                  {frame.sceneId && (
                    <span className="text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono">
                      🎬 {frame.sceneId}
                    </span>
                  )}
                </div>
                {frame.cameraShot && (
                  <span className="text-[10px] font-semibold text-sky-400 bg-sky-950/60 border border-sky-800 px-2 py-0.5 rounded-md">
                    🎥 {frame.cameraShot}
                  </span>
                )}
              </div>

              {/* Subtitle Original */}
              <div className="text-xs text-slate-300">
                <strong className="text-slate-400">Legenda Original:</strong> "{frame.subtitleText}"
              </div>

              {/* Editable Visual Prompt */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-amber-400/90 flex items-center gap-1">
                  <Edit2 className="w-3 h-3" /> Prompt Visual Gerado (Inglês):
                </label>
                <textarea
                  value={frame.visualPrompt}
                  onChange={(e) => onUpdateFramePrompt(frame.id, e.target.value)}
                  rows={2}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400/50 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none resize-none font-mono"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer / Actions */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyPrompts}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
              {copied ? 'Copiado!' : 'Copiar PROMPTS.txt'}
            </button>

            <button
              onClick={handleDownloadPromptsTxt}
              className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              Baixar PROMPTS.txt
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Fechar
            </button>

            <button
              onClick={() => {
                onClose();
                onStartQueue();
              }}
              className="px-6 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-400/20 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              Iniciar Fila de Geração em Massa
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
