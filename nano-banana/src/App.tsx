import React, { useState, useEffect, useRef } from 'react';
import {
  SrtBlock,
  StyleCard,
  GeneratedFrame,
  QueueProgressState,
  GeneratorConfig,
  EntityRegistry,
  ScriptEntity
} from './types';
import { parseSrt, generateFilename, calculateDurationSeconds } from './utils/srtParser';
import { urlToOptimizedBlob, downloadBlob } from './utils/imageExporter';
import { getDbItem, setDbItem, clearDb } from './utils/db';
import {
  parseEntities,
  parsePrompts,
  generateEntityReference,
  generateImage,
  generateVideoPrompts
} from './services/geminiClient';
import { logInfo, logSuccess, logWarn, logError } from './utils/logger';
import { ActivityLog } from './components/ActivityLog';
import { SAMPLE_SRT_PRESETS } from './data/sampleSrt';
import { Header } from './components/Header';
import { StylecardSection } from './components/StylecardSection';
import { SrtInputSection } from './components/SrtInputSection';
import { EntityReviewModal } from './components/EntityReviewModal';
import { PromptMatrixModal } from './components/PromptMatrixModal';
import { QueueProgress } from './components/QueueProgress';
import { GalleryGrid } from './components/GalleryGrid';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
// StyleBibleModal removed
import { Film } from 'lucide-react';

export default function App() {
  const defaultPreset = SAMPLE_SRT_PRESETS[0];

  const [rawSrtText, setRawSrtText] = useState<string>(defaultPreset.content);
  const [srtBlocks, setSrtBlocks] = useState<SrtBlock[]>(() => parseSrt(defaultPreset.content));

  const [stylecard, setStylecard] = useState<StyleCard>({
    textStyle: defaultPreset.defaultStyle,
    aspectRatio: '16:9',
    presetName: 'Cyberpunk Neon Noir'
  });

  const [config, setConfig] = useState<GeneratorConfig>(() => {
    const savedKey = typeof window !== 'undefined' ? (localStorage.getItem('nano_banana_api_key') || '') : '';
    return {
      model: 'gemini-3.1-flash-lite-image',
      qualityResolution: '1K',
      customProvider: 'gemini',
      customApiKey: savedKey,
      filenameTemplate: '{index}_{start}_{end}'
    };
  });

  const [entityRegistry, setEntityRegistry] = useState<EntityRegistry | null>(null);
  const [entityReferenceSheets, setEntityReferenceSheets] = useState<Record<string, string>>({});

  const [frames, setFrames] = useState<GeneratedFrame[]>([]);
  const [isAnalyzingEntities, setIsAnalyzingEntities] = useState<boolean>(false);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = useState<boolean>(false);
  const [isGeneratingVideoPrompts, setIsGeneratingVideoPrompts] = useState<boolean>(false);

  const [queueState, setQueueState] = useState<QueueProgressState>({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: false,
    isPaused: false,
    concurrency: 4
  });

  const [activeModal, setActiveModal] = useState<
    'settings' | 'export' | 'promptMatrix' | 'entityReview' | null
  >(null);

  // Queue processing refs
  const isProcessingRef = useRef(false);
  const isPausedRef = useRef(false);
  const queueStateRef = useRef(queueState);
  queueStateRef.current = queueState;

  const framesRef = useRef(frames);
  framesRef.current = frames;

  // Restore State from IndexedDB on Load
  useEffect(() => {
    async function loadSavedState() {
      try {
        const savedSrt = await getDbItem<string>('rawSrtText');
        if (savedSrt) {
          setRawSrtText(savedSrt);
          setSrtBlocks(parseSrt(savedSrt));
        }

        const savedRegistry = await getDbItem<EntityRegistry>('entityRegistry');
        if (savedRegistry) setEntityRegistry(savedRegistry);

        const savedRefSheets = await getDbItem<Record<string, string>>('entityReferenceSheets');
        if (savedRefSheets) setEntityReferenceSheets(savedRefSheets);

        const savedFrames = await getDbItem<GeneratedFrame[]>('frames');
        if (savedFrames && Array.isArray(savedFrames) && savedFrames.length > 0) {
          const resetFrames = savedFrames.map((f) => 
            f.status === 'generating' ? { ...f, status: 'pending' as const } : f
          );
          setFrames(resetFrames);
          setQueueState((prev) => ({
            ...prev,
            total: resetFrames.length,
            completed: resetFrames.filter((f) => f.status === 'completed').length,
            failed: resetFrames.filter((f) => f.status === 'failed').length
          }));
        }

        const savedStylecard = await getDbItem<StyleCard>('stylecard');
        if (savedStylecard) setStylecard(savedStylecard);

        if (savedFrames && Array.isArray(savedFrames) && savedFrames.length > 0) {
          logInfo(`Projeto anterior restaurado: ${savedFrames.length} frames carregados do navegador.`);
        } else {
          logInfo('Nano Banana pronto. Carregue um SRT e gere seus prompts visuais.');
        }
      } catch (err) {
        console.warn('Could not load saved state from IndexedDB:', err);
        logError('Não foi possível restaurar o estado salvo do navegador.');
      }
    }
    loadSavedState();
  }, []);

  // Sync state changes to IndexedDB
  useEffect(() => {
    if (rawSrtText) setDbItem('rawSrtText', rawSrtText);
  }, [rawSrtText]);

  useEffect(() => {
    if (entityRegistry) setDbItem('entityRegistry', entityRegistry);
  }, [entityRegistry]);

  useEffect(() => {
    if (entityReferenceSheets) setDbItem('entityReferenceSheets', entityReferenceSheets);
  }, [entityReferenceSheets]);

  useEffect(() => {
    if (frames.length > 0) setDbItem('frames', frames);
  }, [frames]);

  useEffect(() => {
    if (stylecard) setDbItem('stylecard', stylecard);
  }, [stylecard]);

  useEffect(() => {
    if (config.customApiKey !== undefined) {
      localStorage.setItem('nano_banana_api_key', config.customApiKey);
    }
  }, [config.customApiKey]);

  // PASSADA 1: Entity Analysis (PROMPT_ENTITY_REGISTRY)
  const handleGeneratePrompts = async () => {
    if (srtBlocks.length === 0) return;

    try {
      setIsAnalyzingEntities(true);

      const registry = await parseEntities(srtBlocks, config.customApiKey);

      setEntityRegistry(registry);
      await setDbItem('entityRegistry', registry);
      setActiveModal('entityReview');
    } catch (err: any) {
      console.error('Failed in Pass 1 Entity Analysis:', err);
      // Fallback: If entity analysis fails, go directly to prompt parsing
      await executePass2PromptGeneration(
        entityRegistry || { detected_niche: 'General', entities: [] }
      );
    } finally {
      setIsAnalyzingEntities(false);
    }
  };

  // PASSADA 2: Generate Visual Prompts (Injected with Entity Registry)
  const executePass2PromptGeneration = async (registryToUse: EntityRegistry) => {
    try {
      setIsGeneratingPrompts(true);

      // Generate reference sheet images for recommended entities first
      const newRefSheets = { ...entityReferenceSheets };
      if (registryToUse.entities && registryToUse.entities.length > 0) {
        const recommendedEntities = registryToUse.entities.filter(
          (e) => e.reference_image_recommended && !newRefSheets[e.id]
        );

        for (const entity of recommendedEntities) {
          try {
            const refImageUrl = await generateEntityReference(entity, stylecard.textStyle, config.customApiKey);
            if (refImageUrl) {
              newRefSheets[entity.id] = refImageUrl;
            }
          } catch (refErr) {
            console.warn(`Failed to generate reference sheet for ${entity.id}:`, refErr);
          }
        }

        setEntityReferenceSheets(newRefSheets);
        await setDbItem('entityReferenceSheets', newRefSheets);
      }

      // Call Pass 2 in batches to keep each Gemini request small
      const batchSize = 10;
      let allFrames: any[] = [];

      for (let i = 0; i < srtBlocks.length; i += batchSize) {
        const batch = srtBlocks.slice(i, i + batchSize);
        const batchFrames = await parsePrompts(
          batch,
          registryToUse,
          stylecard.textStyle,
          stylecard.referenceImageBase64,
          config.customApiKey
        );
        allFrames = [...allFrames, ...batchFrames];
      }

      logSuccess(`Passada 2 concluída: ${allFrames.length} prompts visuais gerados.`);

      if (allFrames.length > 0) {
        const generatedFrames: GeneratedFrame[] = allFrames.map((f: any) => ({
          id: f.id,
          timeStart: f.timeStart,
          timeEnd: f.timeEnd,
          subtitleText: f.subtitleText,
          visualPrompt: f.visualPrompt,
          originalPrompt: f.visualPrompt,
          cameraShot: f.cameraShot,
          mood: f.mood,
          sceneId: f.sceneId,
          status: 'pending'
        }));

        setFrames(generatedFrames);
        await setDbItem('frames', generatedFrames);

        setQueueState((prev) => ({
          ...prev,
          total: generatedFrames.length,
          completed: 0,
          failed: 0,
          inProgress: false,
          isPaused: false
        }));

        setActiveModal('promptMatrix');
      } else {
        alert('Erro ao gerar prompts visuais.');
      }
    } catch (err: any) {
      console.error('Failed to parse prompts with Gemini:', err);
      logError(`Falha ao gerar prompts visuais: ${err?.message || err}`);
      alert('Ocorreu uma falha ao gerar os prompts visuais.');
    } finally {
      setIsGeneratingPrompts(false);
    }
  };

  const handleSaveAndContinueEntities = async (updatedRegistry: EntityRegistry) => {
    setEntityRegistry(updatedRegistry);
    await setDbItem('entityRegistry', updatedRegistry);
    setActiveModal(null);
    await executePass2PromptGeneration(updatedRegistry);
  };

  // Generate Single Image via API
  const processFrameItem = async (frame: GeneratedFrame): Promise<{ success: boolean; imageUrl?: string; error?: string }> => {
    try {
      // Find relevant entity reference images for this frame
      const frameBlockId = Number(frame.id);
      const relevantRefImages: string[] = [];
      
      if (entityRegistry?.entities) {
        for (const entity of entityRegistry.entities) {
          const inAppears = entity.appears_in_blocks?.includes(frameBlockId);
          const inImplicit = entity.implicit_blocks?.includes(frameBlockId);
          
          if (inAppears || inImplicit) {
            const refImg = entityReferenceSheets[entity.id];
            if (refImg) {
              relevantRefImages.push(refImg);
            }
          }
        }
      }

      const data = await generateImage({
        prompt: frame.visualPrompt,
        subtitleText: frame.subtitleText,
        timecode: frame.timeStart,
        styleText: stylecard.textStyle,
        aspectRatio: stylecard.aspectRatio,
        referenceImageBase64: stylecard.referenceImageBase64,
        referenceImages: relevantRefImages,
        model: relevantRefImages.length > 0 ? 'gemini-3.1-flash-image' : config.model,
        apiKey: config.customApiKey
      });

      if (data.success && data.imageUrl) {
        return { success: true, imageUrl: data.imageUrl };
      } else {
        return { success: false, error: data.error || 'Erro desconhecido na geração da imagem.' };
      }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Falha de conexão com a API de imagem.' };
    }
  };

  // Queue Processing Execution
  const startQueueProcessing = async () => {
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    isPausedRef.current = false;

    setQueueState((prev) => ({
      ...prev,
      inProgress: true,
      isPaused: false
    }));

    const currentFrames = [...framesRef.current];
    const pendingFrames = currentFrames.filter((f) => f.status === 'pending' || f.status === 'failed');

    if (pendingFrames.length === 0) {
      isProcessingRef.current = false;
      setQueueState((prev) => ({ ...prev, inProgress: false }));
      return;
    }

    const concurrency = queueStateRef.current.concurrency || 4;
    logInfo(`Fila iniciada: ${pendingFrames.length} imagens para gerar (lotes de ${concurrency}).`);

    try {
      for (let i = 0; i < pendingFrames.length; i += concurrency) {
        if (!isProcessingRef.current) break;

        while (isPausedRef.current) {
          await new Promise((r) => setTimeout(r, 500));
          if (!isProcessingRef.current) break;
        }

        const chunk = pendingFrames.slice(i, i + concurrency);

        setFrames((prev) =>
          prev.map((item) =>
            chunk.some((c) => c.id === item.id) ? { ...item, status: 'generating' } : item
          )
        );

        await Promise.all(
          chunk.map(async (item) => {
            const res = await processFrameItem(item);

            if (res.success) {
              logSuccess(`Frame #${item.id}: imagem gerada com sucesso.`);
            } else {
              logError(`Frame #${item.id}: falha na geração — ${res.error || 'erro desconhecido'}.`);
            }

            setFrames((prev) => {
              const next = prev.map((f) => {
                if (f.id === item.id) {
                  return {
                    ...f,
                    status: res.success ? ('completed' as const) : ('failed' as const),
                    imageUrl: res.success ? res.imageUrl : undefined,
                    error: res.error
                  };
                }
                return f;
              });
              setDbItem('frames', next).catch(() => {});
              setQueueState((q) => ({
                ...q,
                completed: next.filter((f) => f.status === 'completed').length,
                failed: next.filter((f) => f.status === 'failed').length
              }));
              return next;
            });
          })
        );
      }
    } catch (error: any) {
      console.error('Queue processing error:', error);
      logError(`Erro no processamento da fila: ${error?.message || error}`);
    } finally {
      isProcessingRef.current = false;
      const finalFrames = framesRef.current;
      logInfo(`Fila finalizada: ${finalFrames.filter((f) => f.status === 'completed').length} concluídas, ${finalFrames.filter((f) => f.status === 'failed').length} falhas.`);
      setQueueState((prev) => ({
        ...prev,
        inProgress: false,
        isPaused: false
      }));
    }
  };

  const handlePauseQueue = () => {
    isPausedRef.current = true;
    logWarn('Fila pausada pelo usuário.');
    setQueueState((prev) => ({ ...prev, isPaused: true }));
  };

  const handleResumeQueue = () => {
    isPausedRef.current = false;
    logInfo('Fila retomada.');
    setQueueState((prev) => ({ ...prev, isPaused: false }));
  };

  const handleStopQueue = () => {
    isProcessingRef.current = false;
    isPausedRef.current = false;
    logWarn('Fila interrompida pelo usuário.');
    setQueueState((prev) => ({ ...prev, inProgress: false, isPaused: false }));
  };

  const handleRetryFailed = () => {
    const failedCount = framesRef.current.filter((f) => f.status === 'failed').length;
    logInfo(`Refazendo ${failedCount} frame(s) com falha...`);
    setFrames((prev) =>
      prev.map((f) => (f.status === 'failed' ? { ...f, status: 'pending', error: undefined } : f))
    );
    setQueueState((prev) => ({ ...prev, failed: 0 }));
    startQueueProcessing();
  };

  const handleRegenerateSingleFrame = async (id: number) => {
    const targetFrame = frames.find((f) => f.id === id);
    if (!targetFrame) return;
    logInfo(`Frame #${id}: regenerando imagem individualmente...`);

    setFrames((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: 'generating', error: undefined } : f))
    );

    const res = await processFrameItem(targetFrame);

    if (res.success) {
      logSuccess(`Frame #${id}: imagem regenerada com sucesso.`);
    } else {
      logError(`Frame #${id}: falha na regeneração — ${res.error || 'erro desconhecido'}.`);
    }

    setFrames((prev) => {
      const next = prev.map((f) => {
        if (f.id === id) {
          return {
            ...f,
            status: res.success ? ('completed' as const) : ('failed' as const),
            imageUrl: res.success ? res.imageUrl : undefined,
            error: res.error
          };
        }
        return f;
      });
      setDbItem('frames', next);
      setQueueState((q) => ({
        ...q,
        completed: next.filter((f) => f.status === 'completed').length,
        failed: next.filter((f) => f.status === 'failed').length
      }));
      return next;
    });
  };

  // PASSADA 3: Generate image-to-video motion prompts for all frames
  const handleGenerateVideoPrompts = async () => {
    const currentFrames = framesRef.current;
    if (currentFrames.length === 0 || isGeneratingVideoPrompts) return;

    setIsGeneratingVideoPrompts(true);
    try {
      const items = currentFrames.map((f) => ({
        id: f.id,
        visualPrompt: f.visualPrompt,
        subtitleText: f.subtitleText,
        durationSeconds: calculateDurationSeconds(f.timeStart, f.timeEnd)
      }));

      const batchSize = 20;
      const promptMap: Record<number, string> = {};
      for (let i = 0; i < items.length; i += batchSize) {
        const batchResult = await generateVideoPrompts(items.slice(i, i + batchSize), config.customApiKey);
        Object.assign(promptMap, batchResult);
      }

      setFrames((prev) => {
        const next = prev.map((f) => (promptMap[f.id] ? { ...f, videoPrompt: promptMap[f.id] } : f));
        setDbItem('frames', next);
        return next;
      });

      logSuccess(`Passada 3 concluída: ${Object.keys(promptMap).length} prompts de vídeo gerados.`);
    } catch (err: any) {
      console.error('Failed to generate video prompts:', err);
      logError(`Falha ao gerar prompts de vídeo: ${err?.message || err}`);
    } finally {
      setIsGeneratingVideoPrompts(false);
    }
  };

  const handleUpdateFramePrompt = (id: number, newPrompt: string) => {
    setFrames((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, visualPrompt: newPrompt } : f));
      setDbItem('frames', next);
      return next;
    });
  };

  const handleDownloadSingle = async (frame: GeneratedFrame) => {
    if (!frame.imageUrl) return;
    // Sequential position (1-based) among all frames sorted by id, matching the ZIP order
    const sortedIds = [...frames].sort((a, b) => a.id - b.id).map((f) => f.id);
    const seq = sortedIds.indexOf(frame.id) + 1;
    const padLength = Math.max(3, String(frames.length).length);
    try {
      const { blob, ext } = await urlToOptimizedBlob(frame.imageUrl);
      const filename = generateFilename(seq, frame.timeStart, frame.timeEnd, config.filenameTemplate, ext, padLength);
      downloadBlob(blob, filename);
    } catch (err) {
      console.warn('Failed to optimize single frame, fallback to direct download:', err);
      const a = document.createElement('a');
      a.href = frame.imageUrl;
      a.download = generateFilename(seq, frame.timeStart, frame.timeEnd, config.filenameTemplate, 'png', padLength);
      a.click();
    }
  };

  const handleClearData = async () => {
    if (confirm('Tem certeza que deseja limpar TODOS os dados e começar de novo?')) {
      // Clear IndexedDB items
      await clearDb();
      logWarn('Todos os dados do projeto foram limpos.');

      // Clear local state
      setRawSrtText('');
      setSrtBlocks([]);
      setEntityRegistry(null);
      setEntityReferenceSheets({});
      setFrames([]);
      setQueueState({
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: false,
        isPaused: false,
        concurrency: 4
      });
      isProcessingRef.current = false;
      isPausedRef.current = false;
      
      // Ensure stylecard resets
      setStylecard({
        textStyle: '',
        aspectRatio: '16:9'
      });
    }
  };

  const handleHardReset = async () => {
    if (confirm('Atenção: Isso forçará a limpeza de todo o banco de dados e recarregará a página. Continuar?')) {
      await clearDb();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-400 selection:text-slate-950">
      <Header
        totalFrames={queueState.total}
        completedFrames={queueState.completed}
        inProgress={queueState.inProgress}
        onOpenSettings={() => setActiveModal('settings')}
        onOpenExport={() => setActiveModal('export')}
        onOpenPromptMatrix={() => setActiveModal('promptMatrix')}
        onOpenEntities={() => setActiveModal('entityReview')}
        onClearData={handleClearData}
        onHardReset={handleHardReset}
        hasPrompts={frames.length > 0}
        hasEntities={!!entityRegistry && entityRegistry.entities.length > 0}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <SrtInputSection
            srtBlocks={srtBlocks}
            rawSrtText={rawSrtText}
            onUpdateSrt={(text, blocks) => {
              setRawSrtText(text);
              setSrtBlocks(blocks);
            }}
            onApplyPresetStyle={(styleText) => setStylecard((prev) => ({ ...prev, textStyle: styleText }))}
            onGeneratePrompts={handleGeneratePrompts}
            isGeneratingPrompts={isAnalyzingEntities || isGeneratingPrompts}
          />

          <StylecardSection
            stylecard={stylecard}
            onChangeStylecard={setStylecard}
          />
        </div>

        {queueState.total > 0 && (
          <QueueProgress
            queueState={queueState}
            onStartQueue={startQueueProcessing}
            onPauseQueue={handlePauseQueue}
            onResumeQueue={handleResumeQueue}
            onStopQueue={handleStopQueue}
            onRetryFailed={handleRetryFailed}
            onChangeConcurrency={(num) => setQueueState((prev) => ({ ...prev, concurrency: num }))}
          />
        )}

        {frames.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Film className="w-5 h-5 text-amber-400" />
                  Galeria do Diretor (Controle de Quadros)
                </h2>
                <p className="text-xs text-slate-400">
                  Visualize, edite e regenere frames individualmente conforme a história evolui.
                </p>
              </div>

              <button
                onClick={handleGenerateVideoPrompts}
                disabled={isGeneratingVideoPrompts}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                  isGeneratingVideoPrompts
                    ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-wait'
                    : 'bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border-violet-500/40 cursor-pointer'
                }`}
                title="Gera um prompt de movimento (image-to-video) para cada frame, com base na duração do bloco SRT"
              >
                🎬 {isGeneratingVideoPrompts ? 'Gerando Prompts de Vídeo...' : 'Gerar Prompts de Vídeo (Image-to-Video)'}
              </button>
            </div>

            <GalleryGrid
              frames={frames}
              onRegenerateFrame={handleRegenerateSingleFrame}
              onUpdateFramePrompt={handleUpdateFramePrompt}
              onDownloadSingle={handleDownloadSingle}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-800 bg-slate-900/60 py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 font-semibold text-slate-400">
            🍌 Nano Banana AI — Sistema de Automação de Visão em Massa
          </p>
          <p className="text-slate-500">
            Powered by Gemini 3.1 Pro &amp; Imagen 3 Visão
          </p>
        </div>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={() => setActiveModal(null)}
        config={config}
        onChangeConfig={setConfig}
      />

      <ExportModal
        isOpen={activeModal === 'export'}
        onClose={() => setActiveModal(null)}
        frames={frames}
        srtBlocks={srtBlocks}
        config={config}
        entityRegistry={entityRegistry}
        entityReferenceSheets={entityReferenceSheets}
      />

      <PromptMatrixModal
        isOpen={activeModal === 'promptMatrix'}
        onClose={() => setActiveModal(null)}
        frames={frames}
        onUpdateFramePrompt={handleUpdateFramePrompt}
        onStartQueue={startQueueProcessing}
      />

      {entityRegistry && (
        <EntityReviewModal
          isOpen={activeModal === 'entityReview'}
          onClose={() => setActiveModal(null)}
          registry={entityRegistry}
          onSaveAndContinue={handleSaveAndContinueEntities}
          isProcessingPrompts={isGeneratingPrompts}
        />
      )}

      {/* Painel flutuante de Log de Atividades */}
      <ActivityLog />
    </div>
  );
}
