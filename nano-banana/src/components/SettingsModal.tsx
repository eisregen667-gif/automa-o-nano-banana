import React from 'react';
import { GeneratorConfig } from '../types';
import { Settings, X, Cpu, Key, Sliders, HardDrive, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: GeneratorConfig;
  onChangeConfig: (updated: GeneratorConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Configurações do Nano Banana</h2>
              <p className="text-xs text-slate-400">Ajuste os modelos de visão, resoluções e nomeação de arquivos</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {/* Custom API Key Input */}
          <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-amber-500/20">
            <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Key className="w-4 h-4 text-amber-400" />
                Sua Chave API do Gemini:
              </span>
              <span className="text-[10px] text-amber-400/80 font-normal">
                Personal API Key
              </span>
            </label>
            <input
              type="password"
              placeholder="Cole sua Gemini API Key (ex: AIzaSy...)"
              value={config.customApiKey || ''}
              onChange={(e) => onChangeConfig({ ...config, customApiKey: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-400/50 font-mono"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Necessária para gerar prompts e imagens reais: as chamadas ao Google Gemini / Imagen 3 são feitas diretamente do seu navegador. A chave é salva apenas localmente, no seu navegador. Sem chave, o app gera imagens de demonstração (SVG). Crie a sua grátis em aistudio.google.com/apikey
            </p>
          </div>

          {/* Google Image Search (Custom Search API) */}
          <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-sky-500/20">
            <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Key className="w-4 h-4 text-sky-400" />
                Busca de Imagens Reais (Google Imagens — Opcional):
              </span>
            </label>
            <input
              type="password"
              placeholder="Google Custom Search API Key (ex: AIzaSy...)"
              value={config.googleSearchApiKey || ''}
              onChange={(e) => onChangeConfig({ ...config, googleSearchApiKey: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/50 font-mono"
            />
            <input
              type="text"
              placeholder="Search Engine ID / CX (ex: a1b2c3d4e5f6g7h8i)"
              value={config.googleSearchCx || ''}
              onChange={(e) => onChangeConfig({ ...config, googleSearchCx: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/50 font-mono"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Permite buscar fotos reais no Google Imagens para usar como referência visual das Entidades Canônicas.
              Crie grátis (100 buscas/dia): 1) ative a <strong>Custom Search API</strong> em console.cloud.google.com e gere a chave;
              2) crie um mecanismo em programmablesearchengine.google.com marcando "Pesquisar em toda a web" + "Pesquisa de imagens" e copie o ID (CX).
            </p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-amber-400" />
              Modelo de Geração de Imagem:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => onChangeConfig({ ...config, model: 'gemini-3.1-flash-lite-image' })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  config.model === 'gemini-3.1-flash-lite-image'
                    ? 'bg-amber-400/10 border-amber-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">Flash Lite Image</span>
                  {config.model === 'gemini-3.1-flash-lite-image' && (
                    <Check className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Geração ultra-rápida e otimizada para filas em massa.</p>
              </div>

              <div
                onClick={() => onChangeConfig({ ...config, model: 'gemini-3.1-flash-image' })}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  config.model === 'gemini-3.1-flash-image'
                    ? 'bg-amber-400/10 border-amber-400 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">Flash Image HD</span>
                  {config.model === 'gemini-3.1-flash-image' && (
                    <Check className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <p className="text-[11px] text-slate-400">Alta qualidade visual, resoluções 1K / 2K e fidelidade.</p>
              </div>
            </div>
          </div>

          {/* Filename Template */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              Padrão de Nome dos Arquivos Gerados (ZIP):
            </label>
            <select
              value={config.filenameTemplate}
              onChange={(e) => onChangeConfig({ ...config, filenameTemplate: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            >
              <option value="{index}_{start}_{end}">
                001_00-00-10_00-00-15.png (Índice + Tempo Início + Tempo Fim)
              </option>
              <option value="{index}_{start}">
                001_00-00-10.png (Índice + Tempo Início)
              </option>
              <option value="frame_{index}">
                frame_001.png (Somente Índice do Quadro)
              </option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            Salvar e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
