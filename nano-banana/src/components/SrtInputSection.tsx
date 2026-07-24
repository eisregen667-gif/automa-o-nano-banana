import React, { useRef, useState } from 'react';
import { SrtBlock } from '../types';
import { parseSrt } from '../utils/srtParser';
import { SAMPLE_SRT_PRESETS, SampleSrtPreset } from '../data/sampleSrt';
import { FileText, Upload, Sparkles, Clock, Layers, Trash2, Edit3, CheckCircle2 } from 'lucide-react';

interface SrtInputSectionProps {
  srtBlocks: SrtBlock[];
  rawSrtText: string;
  onUpdateSrt: (rawText: string, blocks: SrtBlock[]) => void;
  onApplyPresetStyle: (styleText: string) => void;
}

export const SrtInputSection: React.FC<SrtInputSectionProps> = ({
  srtBlocks,
  rawSrtText,
  onUpdateSrt,
  onApplyPresetStyle,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'preview' | 'presets'>('upload');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseSrt(text);
      onUpdateSrt(text, parsed);
      setActiveTab('preview');
    };
    reader.readAsText(file);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const parsed = parseSrt(text);
    onUpdateSrt(text, parsed);
  };

  const handleLoadPreset = (preset: SampleSrtPreset) => {
    const parsed = parseSrt(preset.content);
    onUpdateSrt(preset.content, parsed);
    onApplyPresetStyle(preset.defaultStyle);
    setActiveTab('preview');
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Legendas do Vídeo (.SRT)
              <span className="text-xs font-semibold bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700">
                {srtBlocks.length} Blocos
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Carregue seu arquivo SRT para converter cada bloco de tempo num prompt visual.
            </p>
          </div>
        </div>

        {/* Tab Controls & Preset Loader */}
        <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'upload'
                ? 'bg-slate-800 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Editor SRT
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'preview'
                ? 'bg-slate-800 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Visualizar ({srtBlocks.length})
          </button>
          <button
            onClick={() => setActiveTab('presets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              activeTab === 'presets'
                ? 'bg-slate-800 text-amber-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Exemplos
          </button>
        </div>
      </div>

      {/* Tab 1: Upload / Textarea Editor */}
      {activeTab === 'upload' && (
        <div className="space-y-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-amber-400/60 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-950/40 hover:bg-slate-950 transition-all"
          >
            <Upload className="w-6 h-6 text-amber-400 mb-1" />
            <p className="text-xs font-bold text-slate-200">
              Clique para selecionar seu arquivo .SRT ou arraste aqui
            </p>
            <p className="text-[11px] text-slate-400">
              Formatos aceitos: .srt (UTF-8)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".srt,text/plain"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
              <span>Cole ou Edite o Código SRT diretamente:</span>
              <span className="text-[10px] text-slate-500">Auto-detecta blocos e tempo</span>
            </label>
            <textarea
              value={rawSrtText}
              onChange={handleTextareaChange}
              rows={6}
              placeholder={`1\n00:00:00,000 --> 00:00:05,000\nSua primeira frase de legenda aqui...\n\n2\n00:00:05,500 --> 00:00:10,000\nSua segunda frase de legenda...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Parsed Blocks List */}
      {activeTab === 'preview' && (
        <div>
          {srtBlocks.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs bg-slate-950/50 rounded-xl border border-slate-800">
              Nenhum bloco de legenda carregado ainda. Adicione texto no editor ou carregue um arquivo SRT.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
              {srtBlocks.map((block) => (
                <div
                  key={block.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-md bg-amber-400/10 text-amber-400 font-bold text-xs flex items-center justify-center shrink-0">
                      #{block.id}
                    </span>
                    <div>
                      <div className="text-[11px] font-mono text-amber-400/90 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {block.timeStart} &rarr; {block.timeEnd}
                      </div>
                      <p className="text-xs text-slate-200 font-medium mt-0.5">
                        "{block.text}"
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Presets Loader */}
      {activeTab === 'presets' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {SAMPLE_SRT_PRESETS.map((preset) => (
            <div
              key={preset.id}
              onClick={() => handleLoadPreset(preset)}
              className="bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-amber-400/50 rounded-xl p-3.5 cursor-pointer transition-all space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white group-hover:text-amber-400 transition-colors">
                  {preset.title}
                </span>
                <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md uppercase">
                  {preset.language}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {preset.description}
              </p>
              <div className="text-[10px] text-amber-400/90 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Carregar este projeto de exemplo
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status */}
      <div className="pt-3 border-t border-slate-800 text-xs text-slate-400">
        Status: <strong className="text-slate-200">{srtBlocks.length}</strong> cenas preparadas — use o <strong className="text-amber-400">Fluxo de Produção</strong> abaixo para gerar.
      </div>
    </div>
  );
};
