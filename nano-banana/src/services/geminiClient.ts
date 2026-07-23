// Serviço cliente: chama a API do Gemini diretamente do navegador usando a chave
// informada pelo usuário nas Configurações. Permite hospedar o app como site
// estático (GitHub Pages) sem depender do servidor Express.

import { GoogleGenAI, Type } from '@google/genai';
import { EntityRegistry, ScriptEntity, SrtBlock } from '../types';
import { PROMPT_ENTITY_REGISTRY, PROMPT_VISUAL_DIRECTOR } from './prompts';
import { createFallbackCanvasImage } from './fallbackImage';
import { logInfo, logSuccess, logWarn, logError } from '../utils/logger';

// Gemini 3.1 Pro: modelo de texto usado nas análises de roteiro (Passadas 1 e 2) e reescritas de prompt
const GEMINI_TEXT_MODEL = 'gemini-3.1-pro-preview';

function getClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 600000
    }
  });
}

// Helper to clean JSON string from Gemini (stripping markdown fences)
function cleanGeminiJson(rawText: string): string {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  return cleaned;
}

const EMPTY_REGISTRY: EntityRegistry = { detected_niche: 'General', entities: [] };

/**
 * PASSADA 1: análise do roteiro e extração do registro canônico de entidades
 */
export async function parseEntities(srtBlocks: SrtBlock[], apiKey?: string): Promise<EntityRegistry> {
  const key = apiKey?.trim();
  if (!key || srtBlocks.length === 0) {
    if (!key) logWarn('Sem chave API do Gemini: análise de entidades pulada (modo demonstração).');
    return EMPTY_REGISTRY;
  }

  try {
    logInfo(`Passada 1: analisando roteiro completo (${srtBlocks.length} blocos) com Gemini 3.1 Pro...`);
    const ai = getClient(key);
    const compactSrt = srtBlocks.map((b) => `[${b.id}] ${b.text}`).join('\n');

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [
        {
          text: `Abaixo está o roteiro SRT completo em formato compacto:\n\n${compactSrt}`
        }
      ],
      config: {
        systemInstruction: PROMPT_ENTITY_REGISTRY,
        responseMimeType: 'application/json'
      }
    });

    const cleanedJson = cleanGeminiJson(response.text || '{}');
    const parsed = JSON.parse(cleanedJson);

    let registry: EntityRegistry = EMPTY_REGISTRY;
    if (parsed && Array.isArray(parsed.entities)) {
      registry = parsed;
    } else if (parsed && parsed.entities && typeof parsed.entities === 'object') {
      registry = {
        detected_niche: parsed.detected_niche || 'General',
        detected_era: parsed.detected_era,
        entities: Object.values(parsed.entities) as ScriptEntity[]
      };
    }
    logSuccess(`Passada 1 concluída: ${registry.entities.length} entidades detectadas (nicho: ${registry.detected_niche}${registry.detected_era ? `, era: ${registry.detected_era}` : ''}).`);
    return registry;
  } catch (err: any) {
    console.warn('[Nano Banana] Falha na análise de entidades (Passada 1):', err);
    logError(`Passada 1 falhou: ${err?.message || err}. Prosseguindo sem registro de entidades.`);
    return EMPTY_REGISTRY;
  }
}

export interface ParsedPromptFrame {
  id: number;
  timeStart: string;
  timeEnd: string;
  subtitleText: string;
  visualPrompt: string;
  cameraShot?: string;
  mood?: string;
  sceneId?: string;
}

const PROMPT_FRAME_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.INTEGER, description: 'ID do bloco SRT' },
      timeStart: { type: Type.STRING, description: 'Tempo de início (00:00:10,000)' },
      timeEnd: { type: Type.STRING, description: 'Tempo de término (00:00:15,000)' },
      subtitleText: { type: Type.STRING, description: 'Legenda original' },
      visualPrompt: { type: Type.STRING, description: 'Prompt em inglês detalhado' },
      cameraShot: { type: Type.STRING, description: 'Tipo de enquadramento' },
      mood: { type: Type.STRING, description: 'Atmosfera' },
      sceneId: { type: Type.STRING, description: 'ID da cena contínua' }
    },
    required: ['id', 'timeStart', 'timeEnd', 'subtitleText', 'visualPrompt']
  }
};

function fallbackFrame(block: SrtBlock, textStylecard?: string): ParsedPromptFrame {
  return {
    id: block.id,
    timeStart: block.timeStart,
    timeEnd: block.timeEnd,
    subtitleText: block.text,
    visualPrompt: `${block.text}, ${textStylecard || 'cinematic style, 8k'}`,
    cameraShot: 'Medium shot',
    mood: 'Dramatic'
  };
}

/**
 * PASSADA 2: converte blocos SRT em prompts visuais detalhados
 */
export async function parsePrompts(
  srtBlocks: SrtBlock[],
  entityRegistry: EntityRegistry | null,
  textStylecard?: string,
  referenceImageBase64?: string,
  apiKey?: string
): Promise<ParsedPromptFrame[]> {
  const key = apiKey?.trim();
  if (!key) {
    // Sem chave de API: prompts simples (legenda + stylecard)
    logWarn(`Sem chave API: gerando prompts simples para ${srtBlocks.length} blocos (legenda + stylecard).`);
    return srtBlocks.map((b) => fallbackFrame(b, textStylecard));
  }

  const firstId = srtBlocks[0]?.id;
  const lastId = srtBlocks[srtBlocks.length - 1]?.id;
  logInfo(`Passada 2: gerando prompts visuais dos blocos #${firstId} a #${lastId}...`);

  const ai = getClient(key);

  const entityRegistryText =
    entityRegistry && Array.isArray(entityRegistry.entities) && entityRegistry.entities.length > 0
      ? JSON.stringify(entityRegistry, null, 2)
      : '{"detected_niche": "General", "entities": []}';

  const userPrompt = `Abaixo está o arquivo de legendas SRT completo para gerar os prompts visuais:\n${JSON.stringify(srtBlocks, null, 2)}

CANONICAL ENTITY REGISTRY (JSON):
${entityRegistryText}

Estilo Visual Escolhido (Stylecard):
${textStylecard || 'Cinematic 35mm photograph, hyper-detailed 8k resolution'}`;

  const promptPayload: any[] = [];
  if (referenceImageBase64 && referenceImageBase64.startsWith('data:image')) {
    const parts = referenceImageBase64.split(';');
    const mimeType = parts[0].replace('data:', '');
    const base64Data = parts[1].replace('base64,', '');
    promptPayload.push({ inlineData: { mimeType, data: base64Data } });
    promptPayload.push({ text: userPrompt });
  } else {
    promptPayload.push(userPrompt);
  }

  let frames: ParsedPromptFrame[] = [];
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: promptPayload,
      config: {
        systemInstruction: PROMPT_VISUAL_DIRECTOR,
        responseMimeType: 'application/json',
        responseSchema: PROMPT_FRAME_SCHEMA
      }
    });

    frames = JSON.parse(cleanGeminiJson(response.text || '[]'));
    if (!Array.isArray(frames)) frames = [];
  } catch (err: any) {
    console.error('[Nano Banana] Falha ao gerar prompts visuais (Passada 2):', err);
    logError(`Passada 2: falha na geração dos blocos #${firstId}–#${lastId}: ${err?.message || err}`);
  }

  // Validation: retry any missing blocks with a targeted request
  if (frames.length !== srtBlocks.length) {
    const receivedIds = new Set(frames.map((f) => Number(f.id)));
    const missingBlocks = srtBlocks.filter((b) => !receivedIds.has(Number(b.id)));

    if (missingBlocks.length > 0) {
      logWarn(`Passada 2: ${missingBlocks.length} bloco(s) faltante(s) na resposta. Reprocessando...`);
      try {
        const targetedUserPrompt = `Alguns blocos do SRT ficaram faltantes na geração inicial. Gere os prompts visuais APENAS para os seguintes blocos SRT faltantes:\n${JSON.stringify(missingBlocks, null, 2)}\n\nCANONICAL ENTITY REGISTRY:\n${entityRegistryText}`;

        const retryRes = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: [{ text: targetedUserPrompt }],
          config: {
            systemInstruction: PROMPT_VISUAL_DIRECTOR,
            responseMimeType: 'application/json',
            responseSchema: PROMPT_FRAME_SCHEMA
          }
        });

        if (retryRes.text) {
          const missingFrames = JSON.parse(cleanGeminiJson(retryRes.text));
          if (Array.isArray(missingFrames)) {
            frames = [...frames, ...missingFrames];
          }
        }
      } catch (retryErr) {
        console.error('[Nano Banana] Retry direcionado para blocos faltantes falhou:', retryErr);
      }
    }

    // Final fallback for any still missing blocks
    const finalReceivedIds = new Set(frames.map((f) => Number(f.id)));
    for (const block of srtBlocks) {
      if (!finalReceivedIds.has(Number(block.id))) {
        frames.push(fallbackFrame(block, textStylecard));
      }
    }
  }

  frames.sort((a, b) => Number(a.id) - Number(b.id));
  return frames;
}

/**
 * Gera a ficha de referência visual (1:1) de uma entidade canônica
 */
export async function generateEntityReference(
  entity: ScriptEntity,
  textStylecard?: string,
  apiKey?: string
): Promise<string> {
  const key = apiKey?.trim();
  const fallback = () =>
    createFallbackCanvasImage(entity.canonical_description, entity.id, 'REF SHEET', textStylecard || '', '1:1');

  if (!key || !entity.canonical_description) {
    logWarn(`Ficha de referência de ${entity.id}: usando imagem de demonstração (sem chave API).`);
    return fallback();
  }

  try {
    logInfo(`Gerando ficha de referência visual da entidade ${entity.id}...`);
    const ai = getClient(key);
    const referencePrompt = `${entity.canonical_description}, full body, neutral gray studio background, soft even lighting, front view, no scene, no text, no watermark`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite-image',
      contents: { parts: [{ text: referencePrompt }] },
      config: {
        imageConfig: { aspectRatio: '1:1' as any }
      }
    });

    const candidates = response.candidates;
    if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          const mime = part.inlineData.mimeType || 'image/png';
          logSuccess(`Ficha de referência de ${entity.id} gerada com sucesso.`);
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Nano Banana] Falha ao gerar ficha de referência da entidade ${entity.id}:`, err?.message || err);
    logError(`Ficha de referência de ${entity.id} falhou: ${err?.message || err}`);
  }

  logWarn(`Ficha de referência de ${entity.id}: usando imagem SVG de fallback.`);
  return fallback();
}

export interface GenerateImageParams {
  prompt: string;
  subtitleText?: string;
  timecode?: string;
  styleText?: string;
  aspectRatio?: string;
  referenceImages?: string[];
  referenceImageBase64?: string;
  model?: string;
  apiKey?: string;
}

export interface GenerateImageResult {
  success: boolean;
  imageUrl?: string;
  isFallback?: boolean;
  error?: string;
}

const VALID_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];

/**
 * Gera uma única imagem (multimodal Gemini / retry inteligente / fallback SVG)
 */
export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const {
    prompt,
    subtitleText = '',
    timecode = '00:00:00',
    styleText = '',
    aspectRatio = '16:9',
    referenceImages = [],
    referenceImageBase64,
    model = 'gemini-3.1-flash-lite-image',
    apiKey
  } = params;

  if (!prompt) {
    return { success: false, error: 'Prompt é obrigatório.' };
  }

  const key = apiKey?.trim();
  const makeFallback = (): GenerateImageResult => ({
    success: true,
    imageUrl: createFallbackCanvasImage(prompt, subtitleText, timecode, styleText, aspectRatio),
    isFallback: true
  });

  if (!key) return makeFallback();

  const ai = getClient(key);
  const safeAspect = (VALID_ASPECT_RATIOS.includes(aspectRatio) ? aspectRatio : '16:9') as any;

  const buildParts = (currentPrompt: string) => {
    const parts: any[] = [];

    const allRefImages: string[] = [];
    if (Array.isArray(referenceImages)) {
      allRefImages.push(...referenceImages.filter((img) => typeof img === 'string' && img.startsWith('data:image')));
    }
    if (referenceImageBase64 && referenceImageBase64.startsWith('data:image')) {
      allRefImages.push(referenceImageBase64);
    }

    if (allRefImages.length > 0) {
      for (const refImg of allRefImages) {
        const partsHeader = refImg.split(';');
        const mimeType = partsHeader[0].replace('data:', '');
        const base64Data = partsHeader[1].replace('base64,', '');
        parts.push({ inlineData: { mimeType, data: base64Data } });
      }
      parts.push({
        text: `Generate a new scene featuring the EXACT same subject(s) shown in the reference image(s), preserving faces, clothing, colors and design identically, now: ${currentPrompt}`
      });
    } else {
      parts.push({ text: currentPrompt });
    }

    return parts;
  };

  const primaryModel = model === 'gemini-3.1-flash-image' ? 'gemini-3.1-flash-image' : 'gemini-3.1-flash-lite-image';

  // Generation attempt with retry backoff for rate limits (429)
  const executeGenerationAttempt = async (targetModel: string, targetPrompt: string): Promise<string> => {
    const backoffDelays = [2000, 4000, 8000];
    let lastErr = null;

    for (let attempt = 0; attempt <= backoffDelays.length; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: targetModel,
          contents: { parts: buildParts(targetPrompt) },
          config: {
            imageConfig: { aspectRatio: safeAspect }
          }
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              return `data:${mime};base64,${part.inlineData.data}`;
            }
          }
        }
        return '';
      } catch (err: any) {
        lastErr = err;
        const errMsg = err?.message || String(err);
        const isRateLimit = errMsg.includes('429') || errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('rate limit');

        if (isRateLimit && attempt < backoffDelays.length) {
          console.warn(`[Nano Banana] Rate limit (429) detectado. Aguardando ${backoffDelays[attempt]}ms antes do retry...`);
          logWarn(`Limite de requisições da API (429): aguardando ${backoffDelays[attempt] / 1000}s antes de tentar novamente...`);
          await new Promise((resolve) => setTimeout(resolve, backoffDelays[attempt]));
          continue;
        }

        throw err;
      }
    }
    if (lastErr) throw lastErr;
    return '';
  };

  let activePrompt = prompt;
  let generatedImageUrl = '';
  let generationErrorMsg = '';

  // Attempt 1: Primary Model (with rate limit backoff)
  try {
    generatedImageUrl = await executeGenerationAttempt(primaryModel, activePrompt);
  } catch (err1: any) {
    const errMsg = err1?.message || String(err1);
    console.warn(`[Nano Banana] Modelo primário ${primaryModel} falhou:`, errMsg);
    generationErrorMsg = errMsg;

    // Smart Retry for Safety Policy Block: rewrite prompt neutrally via Gemini text
    const isSafetyError = errMsg.toLowerCase().includes('safety') || errMsg.toLowerCase().includes('policy') || errMsg.toLowerCase().includes('blocked');
    if (isSafetyError) {
      logWarn('Bloqueio de política de segurança detectado: reescrevendo o prompt de forma neutra...');
      try {
        const rewriteResponse = await ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: [{
            text: `rewrite this image prompt to be fully policy-safe, keeping the same scene meaning:\n"${activePrompt}"`
          }]
        });

        if (rewriteResponse.text) {
          activePrompt = rewriteResponse.text.trim();
          generatedImageUrl = await executeGenerationAttempt(primaryModel, activePrompt);
        }
      } catch (rewriteErr) {
        console.warn('[Nano Banana] Tentativa de reescrita de segurança falhou:', rewriteErr);
      }
    }
  }

  // Attempt 2: Backup Imagen 3 model
  if (!generatedImageUrl) {
    try {
      logInfo('Tentando modelo de backup Imagen 3...');
      const imgRes = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: activePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: safeAspect
        }
      });

      if (imgRes.generatedImages && imgRes.generatedImages.length > 0) {
        const imgBytes = imgRes.generatedImages[0].image?.imageBytes;
        if (imgBytes) {
          generatedImageUrl = `data:image/png;base64,${imgBytes}`;
        }
      }
    } catch (err2: any) {
      console.warn('[Nano Banana] Modelo backup Imagen 3 falhou:', err2?.message || err2);
    }
  }

  if (generatedImageUrl) {
    return { success: true, imageUrl: generatedImageUrl };
  }

  console.warn('[Nano Banana] Fallback SVG acionado. Motivo:', generationErrorMsg || 'Nenhuma imagem inline retornada');
  logWarn(`Geração por IA indisponível (${generationErrorMsg || 'sem imagem retornada'}): usando imagem SVG de demonstração.`);
  return { ...makeFallback(), error: generationErrorMsg || undefined };
}
