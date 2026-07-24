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
  generateVideoPrompts,
  generateTitleCards,
  generateBrollPlans,
  inspectImageQuality
} from './services/geminiClient';
import { AnimaticPlayer } from './components/AnimaticPlayer';
import { logInfo, logSuccess, logWarn, logError } from './utils/logger';
import { ActivityLog } from './components/ActivityLog';
import { SAMPLE_SRT_PRESETS } from './data/sampleSrt';
import { Sidebar, AppView } from './components/Sidebar';
import { ProductionSteps } from './components/ProductionSteps';
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
  const [isGeneratingTitleCards, setIsGeneratingTitleCards] = useState<boolean>(false);
  const [isGeneratingBroll, setIsGeneratingBroll] = useState<boolean>(false);
  const [qcState, setQcState] = useState<{ running: boolean; paused: boolean; done: number; total: number }>({ running: false, paused: false, done: 0, total: 0 });
  const qcControlRef = useRef<{ paused: boolean; stopped: boolean }>({ paused: false, stopped: false });
  const [showAnimatic, setShowAnimatic] = useState<boolean>(false);
  const [view, setView] = useState<AppView>('roteiro');

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

  // PASSADA DE CARTELAS: plan and insert documentary title cards into the sequence
  const handleGenerateTitleCards = async () => {
    const sceneFrames = framesRef.current.filter((f) => Number.isInteger(f.id));
    if (sceneFrames.length === 0 || isGeneratingTitleCards) return;

    setIsGeneratingTitleCards(true);
    try {
      const plans = await generateTitleCards(
        sceneFrames.map((f) => ({
          id: f.id,
          timeStart: f.timeStart,
          timeEnd: f.timeEnd,
          subtitleText: f.subtitleText
        })),
        entityRegistry,
        stylecard.textStyle,
        config.customApiKey
      );

      if (plans.length === 0) {
        logWarn('Nenhuma cartela foi planejada para este roteiro.');
        return;
      }

      // Replacement model: cada cartela ocupa o visual do bloco SRT escolhido
      const planByTarget = new Map(plans.map((p) => [p.targetFrameId, p]));

      setFrames((prev) => {
        const next = prev.map((f) => {
          // Reverte cartelas anteriores para o prompt original da Passada 2
          const reverted = f.isTitleCard
            ? { ...f, isTitleCard: false, visualPrompt: f.originalPrompt, videoPrompt: undefined, cameraShot: undefined, status: 'pending' as const, imageUrl: undefined }
            : f;

          const plan = planByTarget.get(reverted.id);
          if (!plan) return reverted;

          return {
            ...reverted,
            isTitleCard: true,
            visualPrompt: plan.imagePrompt,
            videoPrompt: plan.videoPrompt,
            cameraShot: 'Title Card',
            mood: plan.designStyle || 'Cinematic',
            status: 'pending' as const,
            imageUrl: undefined,
            error: undefined
          };
        });
        setDbItem('frames', next);
        setQueueState((q) => ({
          ...q,
          total: next.length,
          completed: next.filter((fr) => fr.status === 'completed').length,
          failed: next.filter((fr) => fr.status === 'failed').length
        }));
        return next;
      });

      logSuccess(`${plans.length} cartela(s) aplicada(s) aos blocos ${plans.map((p) => `#${p.targetFrameId}`).join(', ')}. Rode a fila para renderizá-las.`);
    } catch (err: any) {
      console.error('Failed to generate title cards:', err);
      logError(`Falha ao gerar cartelas: ${err?.message || err}`);
    } finally {
      setIsGeneratingTitleCards(false);
    }
  };

  // PASSADA DE B-ROLL: plan and insert detail cutaways into the sequence
  const handleGenerateBroll = async () => {
    const sceneFrames = framesRef.current.filter((f) => Number.isInteger(f.id));
    if (sceneFrames.length === 0 || isGeneratingBroll) return;

    setIsGeneratingBroll(true);
    try {
      const plans = await generateBrollPlans(
        sceneFrames.map((f) => ({
          id: f.id,
          timeStart: f.timeStart,
          timeEnd: f.timeEnd,
          subtitleText: f.subtitleText
        })),
        entityRegistry,
        stylecard.textStyle,
        config.customApiKey
      );

      if (plans.length === 0) {
        logWarn('Nenhum B-roll foi planejado para este roteiro.');
        return;
      }

      // Replacement model: cada B-roll ocupa o visual do bloco SRT escolhido
      const planByTarget = new Map(plans.map((p) => [p.targetFrameId, p]));

      setFrames((prev) => {
        const next = prev.map((f) => {
          // Reverte B-rolls anteriores para o prompt original da Passada 2
          const reverted = f.isBroll
            ? { ...f, isBroll: false, visualPrompt: f.originalPrompt, videoPrompt: undefined, cameraShot: undefined, status: 'pending' as const, imageUrl: undefined }
            : f;

          const plan = planByTarget.get(reverted.id);
          // Não sobrescreve blocos que já são cartela
          if (!plan || reverted.isTitleCard) return reverted;

          return {
            ...reverted,
            isBroll: true,
            visualPrompt: plan.imagePrompt,
            videoPrompt: plan.videoPrompt,
            cameraShot: 'B-Roll Detail',
            mood: `Cutaway: ${plan.label}`,
            status: 'pending' as const,
            imageUrl: undefined,
            error: undefined
          };
        });
        setDbItem('frames', next);
        setQueueState((q) => ({
          ...q,
          total: next.length,
          completed: next.filter((fr) => fr.status === 'completed').length,
          failed: next.filter((fr) => fr.status === 'failed').length
        }));
        return next;
      });

      logSuccess(`${plans.length} B-roll(s) aplicado(s) aos blocos ${plans.map((p) => `#${p.targetFrameId}`).join(', ')}. Rode a fila para renderizá-los.`);
    } catch (err: any) {
      console.error('Failed to generate B-roll:', err);
      logError(`Falha ao gerar B-roll: ${err?.message || err}`);
    } finally {
      setIsGeneratingBroll(false);
    }
  };

  // AUTO-QC: inspect every completed image with Gemini vision and auto-fix defects
  const handleAutoQC = async () => {
    const targets = framesRef.current.filter((f) => f.status === 'completed' && f.imageUrl?.startsWith('data:image'));
    if (targets.length === 0 || qcState.running) return;
    if (!config.customApiKey?.trim()) {
      logWarn('Auto-QC requer a chave API do Gemini (Configurações).');
      return;
    }

    qcControlRef.current = { paused: false, stopped: false };
    setQcState({ running: true, paused: false, done: 0, total: targets.length });
    logInfo(`Auto-QC iniciado: inspecionando ${targets.length} imagens com visão do Gemini...`);

    let approvedCount = 0;
    let fixedCount = 0;
    let flaggedCount = 0;

    const applyQc = (id: number, qcStatus: GeneratedFrame['qcStatus'], qcIssues?: string, newImageUrl?: string) => {
      setFrames((prev) => {
        const next = prev.map((f) =>
          f.id === id ? { ...f, qcStatus, qcIssues, ...(newImageUrl ? { imageUrl: newImageUrl } : {}) } : f
        );
        setDbItem('frames', next).catch(() => {});
        return next;
      });
    };

    for (const frame of targets) {
      while (qcControlRef.current.paused && !qcControlRef.current.stopped) {
        await new Promise((r) => setTimeout(r, 500));
      }
      if (qcControlRef.current.stopped) {
        logWarn('Auto-QC interrompido pelo usuário.');
        break;
      }
      try {
        const blockId = Number(frame.id);
        const expectedEntities = (entityRegistry?.entities || [])
          .filter((e) => e.appears_in_blocks?.includes(blockId) || e.implicit_blocks?.includes(blockId))
          .map((e) => e.canonical_description);
        const expectedText = frame.isTitleCard ? frame.subtitleText.replace(/^CARTELA:\s*/, '') : undefined;

        const qc = await inspectImageQuality({
          imageUrl: frame.imageUrl!,
          visualPrompt: frame.visualPrompt,
          era: entityRegistry?.detected_era,
          expectedEntities,
          expectedText,
          apiKey: config.customApiKey
        });

        if (!qc) {
          // inspeção indisponível para este frame; segue adiante
        } else if (qc.approved) {
          approvedCount++;
          applyQc(frame.id, 'approved');
        } else {
          const issuesText = qc.issues.join('; ');
          logWarn(`Auto-QC frame #${frame.id}: ${issuesText}. Regenerando com correção...`);

          const relevantRefImages: string[] = [];
          for (const entity of entityRegistry?.entities || []) {
            if (entity.appears_in_blocks?.includes(blockId) || entity.implicit_blocks?.includes(blockId)) {
              const refImg = entityReferenceSheets[entity.id];
              if (refImg) relevantRefImages.push(refImg);
            }
          }

          const res = await generateImage({
            prompt: `${frame.visualPrompt}. MANDATORY CORRECTION: ${qc.fixInstruction}`,
            subtitleText: frame.subtitleText,
            timecode: frame.timeStart,
            styleText: stylecard.textStyle,
            aspectRatio: stylecard.aspectRatio,
            referenceImageBase64: stylecard.referenceImageBase64,
            referenceImages: relevantRefImages,
            model: relevantRefImages.length > 0 ? 'gemini-3.1-flash-image' : config.model,
            apiKey: config.customApiKey
          });

          if (res.success && res.imageUrl && !res.isFallback) {
            fixedCount++;
            applyQc(frame.id, 'fixed', issuesText, res.imageUrl);
            logSuccess(`Auto-QC frame #${frame.id}: imagem corrigida e substituída.`);
          } else {
            flaggedCount++;
            applyQc(frame.id, 'flagged', issuesText);
            logError(`Auto-QC frame #${frame.id}: não foi possível corrigir automaticamente — revise manualmente.`);
          }
        }
      } catch (err: any) {
        console.warn(`Auto-QC error on frame ${frame.id}:`, err);
      }
      setQcState((s) => ({ ...s, done: s.done + 1 }));
    }

    logSuccess(`Auto-QC ${qcControlRef.current.stopped ? 'interrompido' : 'concluído'}: ${approvedCount} aprovadas, ${fixedCount} corrigidas automaticamente, ${flaggedCount} sinalizadas para revisão.`);
    setQcState((s) => ({ ...s, running: false, paused: false }));
  };

  const handlePauseQC = () => {
    qcControlRef.current.paused = true;
    setQcState((s) => ({ ...s, paused: true }));
    logWarn('Auto-QC pausado.');
  };

  const handleResumeQC = () => {
    qcControlRef.current.paused = false;
    setQcState((s) => ({ ...s, paused: false }));
    logInfo('Auto-QC retomado.');
  };

  const handleStopQC = () => {
    qcControlRef.current.stopped = true;
    qcControlRef.current.paused = false;
  };

  // PASSADA 3: Generate image-to-video motion prompts for all frames
  const handleGenerateVideoPrompts = async () => {
    const currentFrames = framesRef.current;
    if (currentFrames.length === 0 || isGeneratingVideoPrompts) return;

    setIsGeneratingVideoPrompts(true);
    try {
      // Cartelas e B-rolls keep their own video prompts from their planning passes
      const items = currentFrames.filter((f) => !f.isTitleCard && !f.isBroll).map((f) => ({
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
    // Sequential position (1-based) among SRT-synced frames (id inteiro)
    const sceneIds = [...frames]
      .filter((f) => Number.isInteger(f.id))
      .sort((a, b) => a.id - b.id)
      .map((f) => f.id);
    const seq = Number.isInteger(frame.id)
      ? sceneIds.indexOf(frame.id) + 1
      : Math.max(1, sceneIds.filter((id) => id < frame.id).length);
    const padLength = Math.max(3, String(sceneIds.length).length);
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

  const handleHardReset = async () => {
    if (confirm('Atenção: Isso limpará TODOS os dados do projeto e recarregará a página. Continuar?')) {
      await clearDb();
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-amber-400 selection:text-slate-950 flex flex-col lg:flex-row">
      <Sidebar
        view={view}
        onNavigate={setView}
        blocks={srtBlocks.length}
        completed={queueState.completed}
        total={queueState.total}
        inProgress={queueState.inProgress}
        onOpenSettings={() => setActiveModal('settings')}
        onOpenExport={() => setActiveModal('export')}
        onHardReset={handleHardReset}
      />

      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl w-full mx-auto px-4 lg:px-8 py-6 space-y-6">
            {view === 'roteiro' && (
              <>
                <div>
                  <h2 className="text-xl font-extrabold text-white">Roteiro</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Carregue ou cole o arquivo SRT do seu documentário — cada bloco de legenda vira uma cena.
                  </p>
                </div>
                <SrtInputSection
                  srtBlocks={srtBlocks}
                  rawSrtText={rawSrtText}
                  onUpdateSrt={(text, blocks) => {
                    setRawSrtText(text);
                    setSrtBlocks(blocks);
                  }}
                  onApplyPresetStyle={(styleText) => setStylecard((prev) => ({ ...prev, textStyle: styleText }))}
                />
                {srtBlocks.length > 0 && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => setView('estilo')}
                      className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Continuar → Estilo Visual
                    </button>
                  </div>
                )}
              </>
            )}

            {view === 'estilo' && (
              <>
                <div>
                  <h2 className="text-xl font-extrabold text-white">Estilo Visual</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Defina o Stylecard: a identidade visual aplicada a todas as imagens do documentário.
                  </p>
                </div>
                <StylecardSection stylecard={stylecard} onChangeStylecard={setStylecard} />
                <div className="flex justify-end">
                  <button
                    onClick={() => setView('producao')}
                    className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                  >
                    Continuar → Produção
                  </button>
                </div>
              </>
            )}

            {view === 'producao' && (
              <>
                <div>
                  <h2 className="text-xl font-extrabold text-white">Produção</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Siga as etapas na ordem — cada uma libera a próxima. O Log de Atividades acompanha tudo em tempo real.
                  </p>
                </div>
                <ProductionSteps
                  hasScript={srtBlocks.length > 0}
                  hasPrompts={frames.length > 0}
                  hasEntities={!!entityRegistry && entityRegistry.entities.length > 0}
                  isAnalyzing={isAnalyzingEntities || isGeneratingPrompts}
                  onGeneratePrompts={handleGeneratePrompts}
                  onOpenEntities={() => setActiveModal('entityReview')}
                  onOpenMatrix={() => setActiveModal('promptMatrix')}
                  totalFrames={queueState.total}
                  completedFrames={queueState.completed}
                  queueInProgress={queueState.inProgress}
                  onStartQueue={() => {
                    setView('galeria');
                    startQueueProcessing();
                  }}
                  qcRunning={qcState.running}
                  qcPaused={qcState.paused}
                  qcDone={qcState.done}
                  qcTotal={qcState.total}
                  onAutoQC={handleAutoQC}
                  onPauseQC={handlePauseQC}
                  onResumeQC={handleResumeQC}
                  onStopQC={handleStopQC}
                  cardsBusy={isGeneratingTitleCards}
                  onTitleCards={handleGenerateTitleCards}
                  brollBusy={isGeneratingBroll}
                  onBroll={handleGenerateBroll}
                  videoBusy={isGeneratingVideoPrompts}
                  hasVideoPrompts={frames.some((f) => !!f.videoPrompt)}
                  onVideoPrompts={handleGenerateVideoPrompts}
                  onPreview={() => setShowAnimatic(true)}
                  onExport={() => setActiveModal('export')}
                />
              </>
            )}

            {view === 'galeria' && (
              <>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                      <Film className="w-5 h-5 text-amber-400" />
                      Galeria do Diretor
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Visualize, edite e regenere cada quadro. Cartelas e B-rolls aparecem na posição da sequência.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {qcState.running && (
                      <span className="text-xs font-bold text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 rounded-xl px-3 py-2">
                        🔍 Auto-QC {qcState.paused ? 'pausado' : 'ativo'}: {qcState.done}/{qcState.total}
                      </span>
                    )}
                    <button
                      onClick={() => setShowAnimatic(true)}
                      disabled={queueState.completed === 0}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                        queueState.completed > 0
                          ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer'
                          : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      ▶ Preview
                    </button>
                  </div>
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

                <GalleryGrid
                  frames={frames}
                  onRegenerateFrame={handleRegenerateSingleFrame}
                  onUpdateFramePrompt={handleUpdateFramePrompt}
                  onDownloadSingle={handleDownloadSingle}
                />
              </>
            )}
          </div>
        </main>

        <footer className="border-t border-slate-800 bg-slate-900/60 py-3 px-4 text-center text-[11px] text-slate-500">
          🍌 Nano Banana AI — Automação de Documentários por IA · Powered by Gemini 3.1 Pro &amp; Imagen 3
        </footer>
      </div>

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
        onStartQueue={() => {
          setView('galeria');
          startQueueProcessing();
        }}
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

      {/* Preview Animatic */}
      <AnimaticPlayer
        isOpen={showAnimatic}
        onClose={() => setShowAnimatic(false)}
        frames={frames}
      />

      {/* Painel flutuante de Log de Atividades */}
      <ActivityLog />
    </div>
  );
}
