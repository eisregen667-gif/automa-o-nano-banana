import React, { useState, useEffect } from 'react';
import { EntityRegistry, ScriptEntity } from '../types';
import { searchGoogleImages, fetchImageAsDataUrl, ImageSearchResult } from '../services/googleImageSearch';
import { logError } from '../utils/logger';
import { Users, Plus, Trash2, CheckCircle, Sparkles, X, Edit2, ShieldAlert, Search, Loader2 } from 'lucide-react';

interface EntityReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  registry: EntityRegistry;
  onSaveAndContinue: (updatedRegistry: EntityRegistry) => void;
  isProcessingPrompts?: boolean;
  searchApiKey?: string;
  searchCx?: string;
  entityReferenceSheets?: Record<string, string>;
  onSetReferenceSheet?: (entityId: string, dataUrl: string) => void | Promise<void>;
}

export const EntityReviewModal: React.FC<EntityReviewModalProps> = ({
  isOpen,
  onClose,
  registry,
  onSaveAndContinue,
  isProcessingPrompts = false,
  searchApiKey,
  searchCx,
  entityReferenceSheets = {},
  onSetReferenceSheet,
}) => {
  const [entities, setEntities] = useState<ScriptEntity[]>([]);
  const [detectedNiche, setDetectedNiche] = useState('General');
  const [detectedEra, setDetectedEra] = useState('');

  // Google image search state (per entity)
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, ImageSearchResult[]>>({});
  const [searchingEntityId, setSearchingEntityId] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const [searchErrors, setSearchErrors] = useState<Record<string, string>>({});

  const hasSearchConfig = !!(searchApiKey?.trim() && searchCx?.trim());

  const defaultQueryFor = (entity: ScriptEntity) => {
    const base = entity.aliases[0] || entity.id;
    return [base, detectedEra].filter(Boolean).join(' ');
  };

  const handleSearchImages = async (entity: ScriptEntity) => {
    if (!hasSearchConfig) {
      setSearchErrors((prev) => ({
        ...prev,
        [entity.id]: 'Configure a chave da Custom Search API e o CX nas Configurações (engrenagem no topo).'
      }));
      return;
    }

    const query = (searchQueries[entity.id] ?? defaultQueryFor(entity)).trim();
    if (!query) return;

    setSearchingEntityId(entity.id);
    setSearchErrors((prev) => ({ ...prev, [entity.id]: '' }));
    try {
      const results = await searchGoogleImages(query, searchApiKey!.trim(), searchCx!.trim());
      setSearchResults((prev) => ({ ...prev, [entity.id]: results }));
      if (results.length === 0) {
        setSearchErrors((prev) => ({ ...prev, [entity.id]: 'Nenhuma imagem encontrada. Tente outros termos.' }));
      }
    } catch (err: any) {
      logError(`Google Imagens: falha na busca para ${entity.id}: ${err?.message || err}`);
      setSearchErrors((prev) => ({ ...prev, [entity.id]: err?.message || 'Falha na busca de imagens.' }));
    } finally {
      setSearchingEntityId(null);
    }
  };

  const handlePickImage = async (entity: ScriptEntity, result: ImageSearchResult) => {
    if (!onSetReferenceSheet) return;
    setDownloadingUrl(result.imageUrl);
    setSearchErrors((prev) => ({ ...prev, [entity.id]: '' }));
    try {
      const dataUrl = await fetchImageAsDataUrl(result);
      await onSetReferenceSheet(entity.id, dataUrl);
      setSearchResults((prev) => ({ ...prev, [entity.id]: [] }));
    } catch (err: any) {
      setSearchErrors((prev) => ({ ...prev, [entity.id]: err?.message || 'Falha ao baixar a imagem.' }));
    } finally {
      setDownloadingUrl(null);
    }
  };

  useEffect(() => {
    if (registry) {
      setEntities(registry.entities || []);
      setDetectedNiche(registry.detected_niche || 'General');
      setDetectedEra(registry.detected_era || '');
    }
  }, [registry]);

  if (!isOpen) return null;

  const handleUpdateEntity = (index: number, field: keyof ScriptEntity, value: any) => {
    const updated = [...entities];
    updated[index] = { ...updated[index], [field]: value };
    setEntities(updated);
  };

  const handleAliasesChange = (index: number, rawString: string) => {
    const aliases = rawString.split(',').map((s) => s.trim()).filter(Boolean);
    handleUpdateEntity(index, 'aliases', aliases);
  };

  const handleDeleteEntity = (index: number) => {
    const updated = entities.filter((_, i) => i !== index);
    setEntities(updated);
  };

  const handleAddEntity = () => {
    const newId = `CHAR_${String(entities.length + 1).padStart(2, '0')}`;
    const newEntity: ScriptEntity = {
      id: newId,
      type: 'person',
      aliases: [],
      canonical_description: '',
      appears_in_blocks: [],
      implicit_blocks: [],
      is_primary: true,
      reference_image_recommended: true,
    };
    setEntities([...entities, newEntity]);
  };

  const handleConfirm = () => {
    onSaveAndContinue({
      detected_niche: detectedNiche,
      detected_era: detectedEra,
      entities,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Passada 1: Registro Canônico de Entidades</h2>
                <input
                  type="text"
                  value={detectedNiche}
                  onChange={(e) => setDetectedNiche(e.target.value)}
                  className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full focus:outline-none focus:border-amber-400"
                  placeholder="Nicho"
                />
                <input
                  type="text"
                  value={detectedEra}
                  onChange={(e) => setDetectedEra(e.target.value)}
                  className="text-[11px] font-bold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full focus:outline-none focus:border-amber-400"
                  placeholder="Era Detectada"
                />
              </div>
              <p className="text-xs text-slate-400">
                Revise as entidades e descrições físicas imutáveis extraídas pelo Gemini antes de gerar os prompts das cenas.
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

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {entities.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl space-y-3">
              <ShieldAlert className="w-10 h-10 text-amber-400/60 mx-auto" />
              <p className="text-sm font-medium text-slate-300">Nenhuma entidade recorrente identificada no roteiro.</p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                O roteiro parece ser composto de cenas isoladas. Você pode adicionar entidades manualmente se desejar travar a consistência visual.
              </p>
              <button
                onClick={handleAddEntity}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-semibold transition-colors"
              >
                <Plus className="w-4 h-4" /> Adicionar Entidade
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {entities.map((entity, idx) => (
                <div
                  key={entity.id + idx}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-md">
                        {entity.id}
                      </span>

                      <select
                        value={entity.type}
                        onChange={(e) => handleUpdateEntity(idx, 'type', e.target.value)}
                        className="text-xs font-medium bg-slate-900 border border-slate-700 text-slate-200 rounded-md px-2 py-1 focus:outline-none focus:border-amber-400"
                      >
                        <option value="person">Pessoa (Person)</option>
                        <option value="group">Grupo (Group)</option>
                        <option value="creature">Criatura/Animal</option>
                        <option value="object">Objeto/Relíquia</option>
                        <option value="structure">Estrutura/Local</option>
                        <option value="location">Cenário (Location)</option>
                        <option value="technology">Veículo/Tecnologia</option>
                      </select>

                      {entity.appears_in_blocks && entity.appears_in_blocks.length > 0 && (
                        <span className="text-[10px] text-slate-400 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                          {entity.appears_in_blocks.length} blocos
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={!!entity.reference_image_recommended}
                          onChange={(e) => handleUpdateEntity(idx, 'reference_image_recommended', e.target.checked)}
                          className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
                        />
                        <span>Gerar Ficha de Referência</span>
                      </label>

                      <button
                        onClick={() => handleDeleteEntity(idx)}
                        className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-900 transition-colors"
                        title="Remover entidade"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Aliases */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Aliases / Menções no roteiro (separados por vírgula):
                    </label>
                    <input
                      type="text"
                      value={entity.aliases.join(', ')}
                      onChange={(e) => handleAliasesChange(idx, e.target.value)}
                      placeholder="Ex: os três homens, os pescadores, eles"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* Implicit Blocks */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Blocos Implícitos (IDs separados por vírgula):
                    </label>
                    <input
                      type="text"
                      value={(entity.implicit_blocks || []).join(', ')}
                      onChange={(e) => {
                        const val = e.target.value;
                        const blocks = val.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
                        handleUpdateEntity(idx, 'implicit_blocks', blocks);
                      }}
                      placeholder="Ex: 3, 4, 10"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                    />
                  </div>

                  {/* Canonical Description */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Descrição Canônica (Word-for-Word Injected into Prompts):
                    </label>
                    <textarea
                      rows={3}
                      value={entity.canonical_description}
                      onChange={(e) => handleUpdateEntity(idx, 'canonical_description', e.target.value)}
                      placeholder="Descrição detalhada em inglês (idade, fisionomia, roupas, cores imutáveis...)"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-amber-400 rounded-lg p-2.5 text-xs text-slate-200 font-sans focus:outline-none leading-relaxed"
                    />
                  </div>

                  {/* Google Image Search (real reference image) */}
                  <div className="pt-2 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[11px] font-medium text-sky-400 flex items-center gap-1.5">
                        <Search className="w-3.5 h-3.5" />
                        Imagem de Referência Real (Google Imagens):
                      </label>
                      {entityReferenceSheets[entity.id] && (
                        <span className="flex items-center gap-2">
                          <img
                            src={entityReferenceSheets[entity.id]}
                            alt={`Referência de ${entity.id}`}
                            className="w-10 h-10 object-cover rounded-md border border-emerald-500/60"
                          />
                          <span className="text-[10px] text-emerald-400 font-semibold">Referência ativa</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={searchQueries[entity.id] ?? defaultQueryFor(entity)}
                        onChange={(e) => setSearchQueries((prev) => ({ ...prev, [entity.id]: e.target.value }))}
                        placeholder="Termos de busca (ex: estátua Nossa Senhora Aparecida original)"
                        className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-400 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
                      />
                      <button
                        onClick={() => handleSearchImages(entity)}
                        disabled={searchingEntityId === entity.id}
                        className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {searchingEntityId === entity.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Search className="w-3.5 h-3.5" />
                        )}
                        Buscar
                      </button>
                    </div>

                    {searchErrors[entity.id] && (
                      <p className="text-[11px] text-rose-400">{searchErrors[entity.id]}</p>
                    )}

                    {searchResults[entity.id] && searchResults[entity.id].length > 0 && (
                      <div>
                        <p className="text-[10px] text-slate-400 mb-1.5">
                          Clique na melhor imagem para usá-la como referência visual desta entidade:
                        </p>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                          {searchResults[entity.id].map((result) => (
                            <button
                              key={result.imageUrl}
                              onClick={() => handlePickImage(entity, result)}
                              disabled={downloadingUrl !== null}
                              title={result.title}
                              className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 hover:border-sky-400 transition-colors disabled:opacity-60"
                            >
                              <img
                                src={result.thumbnailUrl}
                                alt={result.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                              {downloadingUrl === result.imageUrl && (
                                <span className="absolute inset-0 bg-slate-950/70 flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            onClick={handleAddEntity}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4 text-amber-400" /> Adicionar Entidade
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-400 hover:text-white text-xs font-medium transition-colors"
            >
              Cancelar
            </button>

            <button
              onClick={handleConfirm}
              disabled={isProcessingPrompts}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 text-xs font-bold shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all"
            >
              {isProcessingPrompts ? (
                <>
                  <Sparkles className="w-4 h-4 animate-spin" /> Gerando Prompts da Passada 2...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" /> Continuar para Prompts Visuais
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
