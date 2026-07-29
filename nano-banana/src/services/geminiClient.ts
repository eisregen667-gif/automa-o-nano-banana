// Serviço cliente: chama a API do Gemini diretamente do navegador usando a chave
// informada pelo usuário nas Configurações. Permite hospedar o app como site
// estático (GitHub Pages) sem depender do servidor Express.

import { GoogleGenAI, Type } from '@google/genai';
import { EntityRegistry, ScriptEntity, SrtBlock } from '../types';
import { calculateDurationSeconds } from '../utils/srtParser';
import { PROMPT_ENTITY_REGISTRY, PROMPT_VISUAL_DIRECTOR, PROMPT_VIDEO_DIRECTOR, PROMPT_TITLE_CARD_DIRECTOR, PROMPT_BROLL_DIRECTOR, PROMPT_IMAGE_QC, PROMPT_MUSIC_DIRECTOR, PROMPT_NARRATION_DIRECTOR, PROMPT_TTS_SCRIPT_DOCTOR } from './prompts';
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

// Extrai o objeto JSON de uma resposta que pode conter texto/citações em volta
// (comum quando o grounding com Google Search está ativo)
function extractJsonObject(raw: string): any | null {
  const cleaned = cleanGeminiJson(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeRegistry(parsed: any): EntityRegistry | null {
  if (parsed && Array.isArray(parsed.entities)) {
    return parsed;
  }
  if (parsed && parsed.entities && typeof parsed.entities === 'object') {
    return {
      detected_niche: parsed.detected_niche || 'General',
      detected_era: parsed.detected_era,
      entities: Object.values(parsed.entities) as ScriptEntity[]
    };
  }
  return null;
}

/**
 * PASSADA 1: análise do roteiro e extração do registro canônico de entidades
 */
export async function parseEntities(
  srtBlocks: SrtBlock[],
  apiKey?: string,
  referenceUrls: string[] = []
): Promise<EntityRegistry> {
  const key = apiKey?.trim();
  if (!key || srtBlocks.length === 0) {
    if (!key) logWarn('Sem chave API do Gemini: análise de entidades pulada (modo demonstração).');
    return EMPTY_REGISTRY;
  }

  try {
    logInfo(`Passada 1: analisando roteiro completo (${srtBlocks.length} blocos) com Gemini 3.1 Pro...`);
    const ai = getClient(key);
    const compactSrt = srtBlocks.map((b) => `[${b.id}] ${b.text}`).join('\n');

    // Attempt with Google Search grounding: the model researches real-world
    // facts (true materials, colors, sizes, period style) before writing
    // each canonical description. Falls back to the structured ungrounded
    // call if the grounded response fails or doesn't yield valid JSON.
    let registry: EntityRegistry | null = null;

    try {
      const validUrls = referenceUrls.filter((u) => /^https?:\/\//i.test(u.trim())).map((u) => u.trim()).slice(0, 10);
      logInfo(
        validUrls.length > 0
          ? `Passada 1: grounding ativado com Google Search + ${validUrls.length} fonte(s) de referência fornecida(s)...`
          : 'Passada 1: grounding com Google Search ativado — pesquisando fatos reais das entidades...'
      );

      const prioritySources = validUrls.length > 0
        ? `\n\nPRIORITY REFERENCE SOURCES (read these URLs directly and ground on them FIRST; use Google Search to fill remaining gaps):\n${validUrls.join('\n')}`
        : '';

      const tools: any[] = [{ googleSearch: {} }];
      if (validUrls.length > 0) tools.push({ urlContext: {} });

      const groundedResponse = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: [
          {
            text: `Abaixo está o roteiro SRT completo em formato compacto:\n\n${compactSrt}${prioritySources}\n\nIMPORTANT: use Google Search to verify real-world facts for every entity that corresponds to a real artifact, place, landscape or historical subject — true geography, architecture, materials, colors, dimensions, period-accurate state — and bake those verified facts into each canonical_description so real locations and objects are recreated faithfully and recognizably. Also compile the verified fact_sheet required by the schema. For real or historical PEOPLE, research their documented era, role and general appearance, but describe a RECREATION ACTOR: keep the role-defining traits while deliberately changing identifiable facial features (docudrama style), never the person's actual likeness. Respond with ONLY the JSON object of the required schema — no commentary, no markdown fences.`
          }
        ],
        config: {
          systemInstruction: PROMPT_ENTITY_REGISTRY,
          tools
        }
      });
      registry = normalizeRegistry(extractJsonObject(groundedResponse.text || ''));

      // Captura as fontes reais consultadas pelo grounding (para auditoria)
      if (registry) {
        try {
          const gm: any = (groundedResponse as any).candidates?.[0]?.groundingMetadata;
          const chunks: any[] = gm?.groundingChunks || [];
          const seen = new Set<string>();
          const sources = chunks
            .map((c: any) => ({ title: c?.web?.title || '', uri: c?.web?.uri || '' }))
            .filter((s: any) => s.uri && !seen.has(s.uri) && seen.add(s.uri));
          if (sources.length > 0) {
            registry.sources = sources;
            logInfo(`Grounding: ${sources.length} fonte(s) consultada(s) registradas (exportadas em FONTES.txt).`);
          }
        } catch { /* metadados de grounding são opcionais */ }
      }

      if (!registry) {
        logWarn('Passada 1: resposta do grounding não veio em JSON válido. Refazendo no modo estruturado...');
      }
    } catch (groundErr: any) {
      logWarn(`Grounding com Google Search indisponível (${groundErr?.message || groundErr}). Usando análise padrão...`);
    }

    if (!registry) {
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
      registry = normalizeRegistry(extractJsonObject(response.text || ''));
    }

    if (!registry) {
      logError('Passada 1: nenhuma das tentativas retornou um registro de entidades válido.');
      return EMPTY_REGISTRY;
    }

    logSuccess(`Passada 1 concluída: ${registry.entities.length} entidades, ${registry.fact_sheet?.length || 0} fatos verificados (nicho: ${registry.detected_niche}${registry.detected_era ? `, era: ${registry.detected_era}` : ''}).`);
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
      visual: {
        type: Type.OBJECT,
        description: 'Checklist estruturado do prompt visual (todos os campos obrigatórios)',
        properties: {
          subject: { type: Type.STRING, description: 'Sujeitos com descrições canônicas literais, nacionalidade/fenótipo e era' },
          action: { type: Type.STRING, description: 'O que acontece neste beat narrativo' },
          environment: { type: Type.STRING, description: 'Cenário, arquitetura, materiais, detalhes de época' },
          camera: { type: Type.STRING, description: 'Enquadramento, ângulo, altura, lente (mm), horizonte' },
          lighting: { type: Type.STRING, description: 'Fontes de luz, mood e paleta do ato (color script)' },
          depth: { type: Type.STRING, description: 'Foreground/midground/background + pista de profundidade + âncora de escala' },
          style: { type: Type.STRING, description: 'Diretrizes do Stylecard e meio de renderização' },
          negative: { type: Type.STRING, description: 'Negative Lock completo + exclusões da era' }
        },
        required: ['subject', 'action', 'environment', 'camera', 'lighting', 'depth', 'style', 'negative']
      },
      cameraShot: { type: Type.STRING, description: 'Tipo de enquadramento' },
      mood: { type: Type.STRING, description: 'Atmosfera' },
      sceneId: { type: Type.STRING, description: 'ID da cena contínua' }
    },
    required: ['id', 'timeStart', 'timeEnd', 'subtitleText', 'visual']
  }
};

// Monta o prompt final de geração a partir do checklist estruturado
function assembleVisualPrompt(visual: any): string {
  if (!visual || typeof visual !== 'object') return '';
  const clean = (s: any) => (typeof s === 'string' ? s.trim().replace(/\.+$/, '') : '');
  const parts = [
    clean(visual.subject),
    clean(visual.action),
    clean(visual.environment),
    clean(visual.camera),
    clean(visual.lighting),
    clean(visual.depth),
    clean(visual.style)
  ].filter(Boolean);
  let prompt = parts.join('. ');
  const negative = clean(visual.negative);
  if (negative) prompt += `. Negative prompt: ${negative}`;
  return prompt;
}

// Garante visualPrompt preenchido, montando a partir do checklist quando presente
function finalizePromptFrame(f: any): any {
  const assembled = assembleVisualPrompt(f?.visual);
  return {
    ...f,
    visualPrompt: assembled || (typeof f?.visualPrompt === 'string' ? f.visualPrompt : '')
  };
}

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
  apiKey?: string,
  contextBlocks: SrtBlock[] = []
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

  // Enriquecidos com a duração real de cada bloco (para composição e ritmo)
  const enrich = (blocks: SrtBlock[]) =>
    blocks.map((b) => ({ ...b, durationSeconds: calculateDurationSeconds(b.timeStart, b.timeEnd) }));

  const contextSection = contextBlocks.length > 0
    ? `CONTEXTO NARRATIVO (blocos anteriores, já processados — NÃO gere prompts para eles, use apenas para continuidade de cena/iluminação):\n${JSON.stringify(enrich(contextBlocks), null, 2)}\n\n`
    : '';

  const userPrompt = `${contextSection}Blocos SRT para gerar os prompts visuais (gere EXATAMENTE um por bloco abaixo):\n${JSON.stringify(enrich(srtBlocks), null, 2)}

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
    // Monta o prompt final do checklist; entradas sem prompt válido caem no retry
    frames = frames.map(finalizePromptFrame).filter((f: any) => f.visualPrompt);
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
            frames = [...frames, ...missingFrames.map(finalizePromptFrame).filter((f: any) => f.visualPrompt)];
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

export interface TitleCardPlan {
  targetFrameId: number;
  cardText: string;
  imagePrompt: string;
  videoPrompt: string;
  designStyle?: string;
}

/**
 * PASSADA DE CARTELAS: planeja os title cards do documentário
 * (frequência editorial profissional + design variado coerente com o stylecard)
 */
export async function generateTitleCards(
  frames: { id: number; timeStart: string; timeEnd: string; subtitleText: string }[],
  entityRegistry: EntityRegistry | null,
  textStylecard?: string,
  apiKey?: string
): Promise<TitleCardPlan[]> {
  const key = apiKey?.trim();
  if (!key || frames.length === 0) {
    if (!key) logWarn('Sem chave API do Gemini: geração de cartelas indisponível.');
    return [];
  }

  logInfo(`Passada de Cartelas: analisando o roteiro (${frames.length} frames) para planejar os title cards...`);

  try {
    const ai = getClient(key);
    const registryText = entityRegistry ? JSON.stringify(entityRegistry, null, 2) : '{"detected_niche":"General","entities":[]}';

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        text: `Subtitle timeline (frames):\n${JSON.stringify(frames, null, 2)}\n\nCANONICAL ENTITY REGISTRY:\n${registryText}\n\nProject Stylecard:\n${textStylecard || 'Cinematic 35mm photograph, hyper-detailed 8k resolution'}`
      }],
      config: {
        systemInstruction: PROMPT_TITLE_CARD_DIRECTOR,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetFrameId: { type: Type.INTEGER, description: 'ID do bloco SRT cujo visual vira esta cartela' },
              cardText: { type: Type.STRING, description: 'Texto exato da cartela (máx. 6 palavras, idioma do roteiro)' },
              imagePrompt: { type: Type.STRING, description: 'Prompt de geração da imagem da cartela em inglês' },
              videoPrompt: { type: Type.STRING, description: 'Prompt de animação ambiente com texto estático, em inglês' },
              designStyle: { type: Type.STRING, description: 'Rótulo curto do estilo de design escolhido' }
            },
            required: ['targetFrameId', 'cardText', 'imagePrompt', 'videoPrompt']
          }
        }
      }
    });

    const parsed = JSON.parse(cleanGeminiJson(response.text || '[]'));
    if (!Array.isArray(parsed)) return [];

    const plans: TitleCardPlan[] = parsed
      .filter((p: any) => p && typeof p.cardText === 'string' && p.cardText.trim() && typeof p.imagePrompt === 'string')
      .slice(0, 8)
      .map((p: any) => ({
        targetFrameId: Number(p.targetFrameId) || 0,
        cardText: p.cardText.trim(),
        imagePrompt: p.imagePrompt.trim(),
        videoPrompt: (p.videoPrompt || '').trim(),
        designStyle: p.designStyle
      }));

    logSuccess(`Passada de Cartelas concluída: ${plans.length} cartela(s) planejada(s): ${plans.map((p) => `"${p.cardText}"`).join(', ')}.`);
    return plans;
  } catch (err: any) {
    console.error('[Nano Banana] Falha na geração de cartelas:', err);
    logError(`Passada de Cartelas falhou: ${err?.message || err}`);
    return [];
  }
}

export interface BrollPlan {
  targetFrameId: number;
  label: string;
  imagePrompt: string;
  videoPrompt: string;
}

/**
 * PASSADA DE B-ROLL: planeja cutaways de detalhe (máx. 1 por cena)
 */
export async function generateBrollPlans(
  frames: { id: number; timeStart: string; timeEnd: string; subtitleText: string }[],
  entityRegistry: EntityRegistry | null,
  textStylecard?: string,
  apiKey?: string
): Promise<BrollPlan[]> {
  const key = apiKey?.trim();
  if (!key || frames.length === 0) {
    if (!key) logWarn('Sem chave API do Gemini: geração de B-roll indisponível.');
    return [];
  }

  logInfo(`Passada de B-Roll: analisando o roteiro (${frames.length} frames) para planejar cutaways...`);

  try {
    const ai = getClient(key);
    const registryText = entityRegistry ? JSON.stringify(entityRegistry, null, 2) : '{"detected_niche":"General","entities":[]}';

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        text: `Subtitle timeline (frames):\n${JSON.stringify(frames, null, 2)}\n\nCANONICAL ENTITY REGISTRY:\n${registryText}\n\nProject Stylecard:\n${textStylecard || 'Cinematic 35mm photograph, hyper-detailed 8k resolution'}`
      }],
      config: {
        systemInstruction: PROMPT_BROLL_DIRECTOR,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              targetFrameId: { type: Type.INTEGER, description: 'ID do bloco SRT cujo visual vira este b-roll' },
              label: { type: Type.STRING },
              imagePrompt: { type: Type.STRING },
              videoPrompt: { type: Type.STRING }
            },
            required: ['targetFrameId', 'label', 'imagePrompt', 'videoPrompt']
          }
        }
      }
    });

    const parsed = JSON.parse(cleanGeminiJson(response.text || '[]'));
    if (!Array.isArray(parsed)) return [];

    const plans: BrollPlan[] = parsed
      .filter((p: any) => p && typeof p.imagePrompt === 'string' && p.imagePrompt.trim())
      .map((p: any) => ({
        targetFrameId: Number(p.targetFrameId) || 0,
        label: (p.label || 'Detalhe').trim(),
        imagePrompt: p.imagePrompt.trim(),
        videoPrompt: (p.videoPrompt || '').trim()
      }));

    logSuccess(`Passada de B-Roll concluída: ${plans.length} cutaway(s) planejado(s).`);
    return plans;
  } catch (err: any) {
    console.error('[Nano Banana] Falha na geração de B-roll:', err);
    logError(`Passada de B-Roll falhou: ${err?.message || err}`);
    return [];
  }
}

/**
 * PASSADA DE TRILHA SONORA: planeja 2-5 faixas longas alinhadas aos atos,
 * com prompts prontos para Suno/Udio e timecodes de entrada. Retorna o
 * guia formatado em texto (TRILHA_SONORA.txt) ou null em caso de falha.
 */
export async function generateMusicBrief(
  frames: { id: number; timeStart: string; timeEnd: string; subtitleText: string }[],
  entityRegistry: EntityRegistry | null,
  textStylecard?: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey?.trim();
  if (!key || frames.length === 0) {
    if (!key) logWarn('Sem chave API do Gemini: geração da trilha sonora indisponível.');
    return null;
  }

  logInfo('Passada de Trilha Sonora: planejando as faixas do documentário...');

  try {
    const ai = getClient(key);
    const registryText = entityRegistry ? JSON.stringify(entityRegistry, null, 2) : '{"detected_niche":"General","entities":[]}';

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        text: `Subtitle timeline (frames):\n${JSON.stringify(frames.map((f) => ({ id: f.id, timeStart: f.timeStart, timeEnd: f.timeEnd, text: f.subtitleText })), null, 2)}\n\nCANONICAL ENTITY REGISTRY:\n${registryText}\n\nProject Stylecard:\n${textStylecard || 'Cinematic documentary'}`
      }],
      config: {
        systemInstruction: PROMPT_MUSIC_DIRECTOR,
        responseMimeType: 'application/json'
      }
    });

    const parsed = extractJsonObject(response.text || '');
    if (!parsed || !Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      logError('Passada de Trilha Sonora: resposta inválida do modelo.');
      return null;
    }

    const lines: string[] = [];
    lines.push('🎵 TRILHA SONORA — GUIA DE MONTAGEM');
    lines.push('Gere cada faixa no Suno/Udio com o prompt indicado e solte no timecode de entrada. Pronto.');
    lines.push('');

    if (parsed.intro_sting?.sunoPrompt) {
      lines.push('VINHETA DE ABERTURA (10-20s — sob o cold open / cartela de título)');
      lines.push(`PROMPT: ${parsed.intro_sting.sunoPrompt}`);
      if (parsed.intro_sting.note) lines.push(`NOTA: ${parsed.intro_sting.note}`);
      lines.push('');
    }

    parsed.segments.forEach((seg: any, i: number) => {
      lines.push(`FAIXA ${i + 1} — ${seg.act_label || `Ato ${i + 1}`}  [${seg.timeStart || '?'} → ${seg.timeEnd || '?'}]`);
      lines.push(`PROMPT: ${seg.sunoPrompt || '-'}`);
      if (seg.mixNote) lines.push(`MIX: ${seg.mixNote}`);
      lines.push('');
    });

    logSuccess(`Trilha Sonora planejada: vinheta de abertura + ${parsed.segments.length} faixa(s) alinhadas aos atos.`);
    return lines.join('\n');
  } catch (err: any) {
    console.error('[Nano Banana] Falha na trilha sonora:', err);
    logError(`Passada de Trilha Sonora falhou: ${err?.message || err}`);
    return null;
  }
}

export interface NarrationSegmentPlan {
  direction: string;
  performanceText: string;
  pauseBeforeMs: number;
}

/**
 * SCRIPT DOCTOR: reescreve o roteiro para TTS — quebra frases longas,
 * números por extenso, dissolve parênteses — preservando cada fato.
 */
export async function refineScriptForTts(
  script: string,
  lintReport: string,
  apiKey?: string
): Promise<string | null> {
  const key = apiKey?.trim();
  if (!key || !script.trim()) {
    if (!key) logWarn('Sem chave API do Gemini: a correção de escrita para TTS precisa dela (Configurações).');
    return null;
  }

  logInfo('Script Doctor: reescrevendo o roteiro para TTS (frases longas, números, marcações)...');

  try {
    const ai = getClient(key);
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        text: `LINT REPORT (problems detected automatically):\n${lintReport || 'none provided'}\n\nFULL NARRATION SCRIPT:\n${script}`
      }],
      config: { systemInstruction: PROMPT_TTS_SCRIPT_DOCTOR }
    });

    const text = (response.text || '').trim();
    if (!text) {
      logError('Script Doctor: resposta vazia do modelo.');
      return null;
    }
    // Proteção contra respostas truncadas ou resumidas demais
    if (text.length < script.trim().length * 0.7) {
      logError(`Script Doctor: resposta suspeita de corte (${text.length} vs ${script.trim().length} caracteres) — mantendo o original.`);
      return null;
    }
    logSuccess(`Script Doctor: roteiro reescrito para TTS (${text.length} caracteres). Revise no editor.`);
    return text;
  } catch (err: any) {
    console.error('[Nano Banana] Falha no Script Doctor:', err);
    logError(`Script Doctor falhou: ${err?.message || err}`);
    return null;
  }
}

/**
 * DIRETOR DE NARRAÇÃO: prepara a sessão de gravação — segmentos por
 * emoção, direção por trecho, pontuação de performance e pausas reais.
 */
export async function directNarration(
  script: string,
  entityRegistry: EntityRegistry | null,
  baseIdentity: string,
  maxChars: number,
  apiKey?: string
): Promise<NarrationSegmentPlan[] | null> {
  const key = apiKey?.trim();
  if (!key || !script.trim()) {
    if (!key) logWarn('Sem chave API do Gemini: direção de narração indisponível.');
    return null;
  }

  logInfo('Diretor de Narração: preparando a sessão de gravação (segmentos, direções e pausas)...');

  try {
    const ai = getClient(key);
    const colorScript = entityRegistry?.color_script?.length
      ? JSON.stringify(entityRegistry.color_script, null, 2)
      : 'não disponível — deduza o arco emocional do próprio texto';

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        text: `NARRATOR FIXED IDENTITY (never contradict):\n${baseIdentity || 'Documentary narrator, calm and authoritative'}\n\nCOLOR SCRIPT (emotional acts):\n${colorScript}\n\nSEGMENT CHARACTER LIMIT: ${maxChars}\n\nFULL NARRATION SCRIPT:\n${script}`
      }],
      config: {
        systemInstruction: PROMPT_NARRATION_DIRECTOR,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            segments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  direction: { type: Type.STRING, description: 'Modulação emocional deste trecho (idioma do roteiro)' },
                  performanceText: { type: Type.STRING, description: 'Texto com pontuação de performance (mesmas palavras)' },
                  pauseBeforeMs: { type: Type.INTEGER, description: 'Silêncio real antes do trecho, em ms' }
                },
                required: ['direction', 'performanceText', 'pauseBeforeMs']
              }
            }
          },
          required: ['segments']
        }
      }
    });

    const parsed = extractJsonObject(response.text || '');
    const segments: NarrationSegmentPlan[] = Array.isArray(parsed?.segments)
      ? parsed.segments
          .filter((s: any) => typeof s?.performanceText === 'string' && s.performanceText.trim())
          .map((s: any) => ({
            direction: (s.direction || '').trim(),
            performanceText: s.performanceText.trim(),
            pauseBeforeMs: Math.max(0, Math.min(3000, Number(s.pauseBeforeMs) || 0))
          }))
      : [];

    if (segments.length === 0) {
      logError('Diretor de Narração: resposta sem segmentos válidos.');
      return null;
    }

    const totalPause = segments.reduce((s, seg) => s + seg.pauseBeforeMs, 0);
    logSuccess(`Sessão dirigida: ${segments.length} segmentos, ${(totalPause / 1000).toFixed(1)}s de pausas dramáticas planejadas. Revise antes de gravar.`);
    return segments;
  } catch (err: any) {
    console.error('[Nano Banana] Falha no Diretor de Narração:', err);
    logError(`Diretor de Narração falhou: ${err?.message || err}`);
    return null;
  }
}

export interface QcResult {
  approved: boolean;
  issues: string[];
  fixInstruction: string;
}

/**
 * AUTO-QC: inspeciona uma imagem gerada com o Gemini (visão)
 */
export async function inspectImageQuality(params: {
  imageUrl: string;
  visualPrompt: string;
  era?: string;
  expectedEntities?: string[];
  expectedText?: string;
  apiKey?: string;
}): Promise<QcResult | null> {
  const key = params.apiKey?.trim();
  if (!key) return null;

  try {
    // Aceita object URLs (Blobs armazenados) convertendo para data URL
    let dataUrl = params.imageUrl;
    if (dataUrl.startsWith('blob:')) {
      const blob = await fetch(dataUrl).then((r) => r.blob());
      dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    }
    if (!dataUrl.startsWith('data:image')) return null;

    const ai = getClient(key);
    const headerParts = dataUrl.split(';');
    const mimeType = headerParts[0].replace('data:', '');
    const base64Data = headerParts[1].replace('base64,', '');

    const contextText = `Generation prompt: ${params.visualPrompt}\n` +
      `Detected era: ${params.era || 'unspecified'}\n` +
      `Expected entities in this shot:\n${(params.expectedEntities || []).map((d) => `- ${d}`).join('\n') || '- none registered'}\n` +
      (params.expectedText ? `THIS IS A TITLE CARD. Expected exact text: "${params.expectedText}"` : 'This is a regular scene frame (no text should appear).');

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: contextText }
        ]
      },
      config: {
        systemInstruction: PROMPT_IMAGE_QC,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            approved: { type: Type.BOOLEAN },
            issues: { type: Type.ARRAY, items: { type: Type.STRING } },
            fix_instruction: { type: Type.STRING }
          },
          required: ['approved', 'issues', 'fix_instruction']
        }
      }
    });

    const parsed = JSON.parse(cleanGeminiJson(response.text || '{}'));
    if (typeof parsed?.approved !== 'boolean') return null;
    return {
      approved: parsed.approved,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      fixInstruction: parsed.fix_instruction || ''
    };
  } catch (err: any) {
    console.warn('[Nano Banana] Auto-QC falhou para uma imagem:', err?.message || err);
    return null;
  }
}

export interface VideoPromptInput {
  id: number;
  visualPrompt: string;
  subtitleText: string;
  durationSeconds: number;
}

function fallbackVideoPrompt(item: VideoPromptInput): string {
  return `Slow cinematic push-in on the existing scene, subtle natural motion of the subject, gentle ambient atmosphere (drifting light and air movement), single continuous shot, preserve composition and style, ${item.durationSeconds || 5} seconds`;
}

/**
 * PASSADA 3: converte cada frame em um prompt de movimento (image-to-video)
 */
export async function generateVideoPrompts(
  items: VideoPromptInput[],
  apiKey?: string
): Promise<Record<number, string>> {
  const result: Record<number, string> = {};
  if (items.length === 0) return result;

  const key = apiKey?.trim();
  if (!key) {
    logWarn(`Sem chave API: gerando prompts de vídeo genéricos para ${items.length} frames.`);
    for (const item of items) result[item.id] = fallbackVideoPrompt(item);
    return result;
  }

  const firstId = items[0].id;
  const lastId = items[items.length - 1].id;
  logInfo(`Passada 3: gerando prompts de vídeo (image-to-video) dos frames #${firstId} a #${lastId}...`);

  try {
    const ai = getClient(key);
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: [{
        text: `Frames to animate (still image prompt + subtitle + clip duration in seconds):\n${JSON.stringify(items, null, 2)}`
      }],
      config: {
        systemInstruction: PROMPT_VIDEO_DIRECTOR,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER, description: 'ID do frame' },
              videoPrompt: { type: Type.STRING, description: 'Prompt de movimento em inglês para image-to-video' }
            },
            required: ['id', 'videoPrompt']
          }
        }
      }
    });

    const parsed = JSON.parse(cleanGeminiJson(response.text || '[]'));
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (entry && typeof entry.videoPrompt === 'string' && entry.videoPrompt.trim()) {
          result[Number(entry.id)] = entry.videoPrompt.trim();
        }
      }
    }
  } catch (err: any) {
    console.error('[Nano Banana] Falha na geração de prompts de vídeo (Passada 3):', err);
    logError(`Passada 3: falha nos frames #${firstId}–#${lastId}: ${err?.message || err}`);
  }

  // Fallback for any frame the model missed
  let missing = 0;
  for (const item of items) {
    if (!result[item.id]) {
      result[item.id] = fallbackVideoPrompt(item);
      missing++;
    }
  }
  if (missing > 0) {
    logWarn(`Passada 3: ${missing} frame(s) sem resposta do modelo receberam prompt de vídeo genérico.`);
  }

  return result;
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

    // Modelo forte: a ficha de referência define a identidade da entidade em
    // todos os frames — fidelidade aqui vale mais que custo
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image',
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
    const pushImage = (dataUrl: string) => {
      const partsHeader = dataUrl.split(';');
      parts.push({
        inlineData: {
          mimeType: partsHeader[0].replace('data:', ''),
          data: partsHeader[1].replace('base64,', '')
        }
      });
    };

    // Referências de IDENTIDADE (fichas de entidades): preservar o sujeito exato
    const entityRefs = (Array.isArray(referenceImages) ? referenceImages : [])
      .filter((img) => typeof img === 'string' && img.startsWith('data:image'));
    // Referência de ESTILO (stylecard): guia apenas paleta/traço, nunca o sujeito
    const styleRef = referenceImageBase64 && referenceImageBase64.startsWith('data:image') ? referenceImageBase64 : null;

    const preambles: string[] = [];
    entityRefs.forEach(pushImage);
    if (entityRefs.length > 0) {
      preambles.push(
        `The first ${entityRefs.length} reference image(s) define the EXACT identity of the subject(s): preserve faces, clothing, colors and design identically.`
      );
    }
    if (styleRef) {
      pushImage(styleRef);
      preambles.push(
        'The last reference image defines ONLY the artistic style, color palette and rendering technique — do NOT copy its subjects, objects or composition.'
      );
    }

    parts.push({
      text: preambles.length > 0 ? `${preambles.join(' ')} Now generate: ${currentPrompt}` : currentPrompt
    });

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
