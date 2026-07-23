import React, { useState } from 'react';
import { GeneratedFrame } from '../types';
import {
  Sparkles,
  RefreshCw,
  Download,
  Copy,
  Edit3,
  Check,
  Clock,
  Maximize2,
  X,
  AlertCircle,
  CheckCircle2,
  Filter,
  Grid,
  List
} from 'lucide-react';

interface GalleryGridProps {
  frames: GeneratedFrame[];
  onRegenerateFrame: (id: number) => void;
  onUpdateFramePrompt: (id: number, newPrompt: string) => void;
  onDownloadSingle: (frame: GeneratedFrame) => void;
}

export const GalleryGrid: React.FC<GalleryGridProps> = ({
  frames,
  onRegenerateFrame,
  onUpdateFramePrompt,
  onDownloadSingle,
}) => {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedVideoId, setCopiedVideoId] = useState<number | null>(null);
  const [zoomedFrame, setZoomedFrame] = useState<GeneratedFrame | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'generating' | 'failed'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const filteredFrames = frames.filter((f) => {
    if (filterStatus === 'all') return true;
    return f.status === filterStatus;
  });

  const handleCopyPrompt = (frame: GeneratedFrame) => {
    navigator.clipboard.writeText(frame.visualPrompt);
    setCopiedId(frame.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Sequential position (1-based, zero-padded) matching the exported image numbering
  const getFrameSequence = (frame: GeneratedFrame): string => {
    const sortedIds = [...frames].sort((a, b) => a.id - b.id).map((f) => f.id);
    const pad = Math.max(3, String(frames.length).length);
    return String(sortedIds.indexOf(frame.id) + 1).padStart(pad, '0');
  };

  const handleCopyVideoPrompt = (frame: GeneratedFrame) => {
    if (!frame.videoPrompt) return;
    navigator.clipboard.writeText(`${getFrameSequence(frame)} ${frame.videoPrompt}`);
    setCopiedVideoId(frame.id);
    setTimeout(() => setCopiedVideoId(null), 2000);
  };

  if (frames.length === 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
          <Sparkles className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">Nenhum Quadro Visual Gerado Ainda</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Carregue suas legendas SRT e clique em <strong>"1. Gerar Prompts Visuais"</strong> para a magia do Nano Banana começar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Gallery Bar Controls: Filter & View Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-slate-200">Filtrar por Status:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            {[
              { id: 'all', label: `Todos (${frames.length})` },
              { id: 'completed', label: `Concluídos (${frames.filter((f) => f.status === 'completed').length})` },
              { id: 'generating', label: `Gerando (${frames.filter((f) => f.status === 'generating').length})` },
              { id: 'failed', label: `Falhas (${frames.filter((f) => f.status === 'failed').length})` },
            ].map((st) => (
              <button
                key={st.id}
                onClick={() => setFilterStatus(st.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  filterStatus === st.id
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'grid' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Visualização em Grade"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg transition-colors ${
              viewMode === 'list' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white'
            }`}
            title="Visualização em Lista Detalhada"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid or List Display */}
      <div
        className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'
            : 'space-y-4'
        }
      >
        {filteredFrames.map((frame) => {
          const isEditing = editingId === frame.id;
          const isCopied = copiedId === frame.id;

          return (
            <div
              key={frame.id}
              className={`bg-slate-900 border rounded-2xl overflow-hidden flex flex-col shadow-lg transition-all group ${
                frame.status === 'generating'
                  ? 'border-amber-400 ring-2 ring-amber-400/20'
                  : frame.status === 'failed'
                  ? 'border-rose-800/80'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Image Preview Container */}
              <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800">
                {frame.imageUrl ? (
                  <img
                    src={frame.imageUrl}
                    alt={`Frame ${frame.id}`}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : frame.status === 'generating' ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <Sparkles className="w-8 h-8 text-amber-400 animate-spin" />
                    <p className="text-xs font-bold text-amber-400">Gerando Imagem com IA...</p>
                    <p className="text-[10px] text-slate-500">Renderizando modelo de visão</p>
                  </div>
                ) : frame.status === 'failed' ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-1 text-rose-400">
                    <AlertCircle className="w-8 h-8 mb-1" />
                    <p className="text-xs font-bold">Falha na Geração</p>
                    <p className="text-[10px] text-slate-400 max-w-xs">{frame.error || 'Erro ao processar imagem.'}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center text-slate-600 space-y-1">
                    <Clock className="w-8 h-8" />
                    <p className="text-xs font-medium">Aguardando Fila de Processamento</p>
                  </div>
                )}

                {/* Overlays on Image */}
                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                  {frame.isTitleCard ? (
                    <span className="bg-amber-400 text-slate-950 font-extrabold text-[10px] px-2.5 py-1 rounded-lg shadow-md">
                      📋 CARTELA
                    </span>
                  ) : (
                    <span className="bg-slate-950/80 backdrop-blur-md text-amber-400 font-extrabold text-xs px-2.5 py-1 rounded-lg border border-slate-800">
                      #{frame.id}
                    </span>
                  )}
                  <span className="bg-slate-950/80 backdrop-blur-md text-slate-200 font-mono text-[11px] px-2.5 py-1 rounded-lg border border-slate-800 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-400" />
                    {frame.timeStart}
                  </span>
                </div>

                {/* Quick Zoom Button */}
                {frame.imageUrl && (
                  <button
                    onClick={() => setZoomedFrame(frame)}
                    className="absolute top-3 right-3 p-2 rounded-lg bg-slate-950/80 text-white hover:bg-amber-400 hover:text-slate-950 transition-colors opacity-0 group-hover:opacity-100"
                    title="Ampliar Imagem"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Details & Director Controls */}
              <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                {/* Subtitle Text */}
                <div>
                  <p className="text-xs font-semibold text-slate-200 leading-snug">
                    "{frame.subtitleText}"
                  </p>
                </div>

                {/* Visual Prompt Section */}
                <div className="space-y-1.5 bg-slate-950 p-3 rounded-xl border border-slate-800/80">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-amber-400 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Prompt Visual Gemini:
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyPrompt(frame)}
                        className="p-1 hover:text-amber-400 text-slate-400 transition-colors"
                        title="Copiar Prompt"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditingId(isEditing ? null : frame.id)}
                        className="p-1 hover:text-amber-400 text-slate-400 transition-colors"
                        title="Editar Prompt do Frame"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={frame.visualPrompt}
                        onChange={(e) => onUpdateFramePrompt(frame.id, e.target.value)}
                        rows={3}
                        className="w-full bg-slate-900 border border-amber-400/50 rounded-lg p-2 text-xs text-white focus:outline-none resize-none font-mono"
                      />
                      <button
                        onClick={() => {
                          setEditingId(null);
                          onRegenerateFrame(frame.id);
                        }}
                        className="w-full py-1.5 rounded-lg bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-2 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Salvar e Regenerar Imagem
                      </button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-300 font-mono leading-relaxed line-clamp-3">
                      {frame.visualPrompt}
                    </p>
                  )}
                </div>

                {/* Video Motion Prompt (Image-to-Video) */}
                {frame.videoPrompt && (
                  <div className="space-y-1.5 bg-violet-950/30 p-3 rounded-xl border border-violet-500/30">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-violet-300 flex items-center gap-1">
                        🎬 Prompt de Vídeo #{getFrameSequence(frame)} (Image-to-Video):
                      </span>
                      <button
                        onClick={() => handleCopyVideoPrompt(frame)}
                        className="p-1 hover:text-violet-300 text-slate-400 transition-colors"
                        title="Copiar Prompt de Vídeo para colar na sua ferramenta"
                      >
                        {copiedVideoId === frame.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-violet-200/90 font-mono leading-relaxed line-clamp-3">
                      {frame.videoPrompt}
                    </p>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onRegenerateFrame(frame.id)}
                    disabled={frame.status === 'generating'}
                    className="flex-1 py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${frame.status === 'generating' ? 'animate-spin' : ''}`} />
                    Refazer Imagem
                  </button>

                  <button
                    onClick={() => onDownloadSingle(frame)}
                    disabled={!frame.imageUrl}
                    className={`p-1.5 rounded-xl border transition-colors ${
                      frame.imageUrl
                        ? 'bg-amber-400/10 hover:bg-amber-400/20 text-amber-400 border-amber-400/30 cursor-pointer'
                        : 'bg-slate-950 text-slate-600 border-slate-900 cursor-not-allowed'
                    }`}
                    title="Baixar Imagem"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Screen Zoom Modal */}
      {zoomedFrame && (
        <div
          onClick={() => setZoomedFrame(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
        >
          <div className="relative max-w-5xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoomedFrame(null)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-slate-950/80 text-slate-300 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="aspect-video bg-black rounded-xl overflow-hidden flex items-center justify-center">
              <img src={zoomedFrame.imageUrl} alt="Zoomed Frame" className="w-full h-full object-contain" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-amber-400 text-sm">Frame #{zoomedFrame.id} ({zoomedFrame.timeStart})</span>
              </div>
              <p className="text-xs text-white">"{zoomedFrame.subtitleText}"</p>
              <p className="text-xs text-slate-400 font-mono">{zoomedFrame.visualPrompt}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
