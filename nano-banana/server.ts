import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { PROMPT_ENTITY_REGISTRY, PROMPT_VISUAL_DIRECTOR } from './src/services/prompts';
import { createFallbackCanvasImage } from './src/services/fallbackImage';

dotenv.config();

const app = express();
const PORT = 3000;

// Gemini 3.1 Pro: modelo de texto usado nas análises de roteiro (Passadas 1 e 2) e reescritas de prompt
const GEMINI_TEXT_MODEL = 'gemini-3.1-pro-preview';

// Increase JSON payload limit for base64 image uploads
app.use(express.json({ limit: '25mb' }));

// Lazy initializer for GoogleGenAI to ensure User-Agent is sent
function getGenAIClient(customApiKey?: string) {
  const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Warning: GEMINI_API_KEY environment variable is not set.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || 'dummy-key-for-init',
    httpOptions: {
      timeout: 600000,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
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

// ================= API ROUTES =================

/**
 * PASS 1: Entity Analysis API Route (PROMPT_ENTITY_REGISTRY)
 */
app.post('/api/srt/parse-entities', async (req, res) => {
  try {
    const { srtBlocks, customApiKey } = req.body;

    if (!srtBlocks || !Array.isArray(srtBlocks) || srtBlocks.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de blocos SRT inválida.' });
    }

    const ai = getGenAIClient(customApiKey);

    // Format SRT into compact index format
    const compactSrt = srtBlocks.map((b: any) => `[${b.id}] ${b.text}`).join('\n');

    console.log('[Nano Banana] Pass 1: Extracting canonical entity registry with PROMPT_ENTITY_REGISTRY...');

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

    const responseText = response.text || '{}';
    const cleanedJson = cleanGeminiJson(responseText);

    let registryData = { detected_niche: 'General', entities: [] };
    try {
      const parsed = JSON.parse(cleanedJson);
      if (parsed && Array.isArray(parsed.entities)) {
        registryData = parsed;
      } else if (parsed && parsed.entities && typeof parsed.entities === 'object') {
        registryData = {
          detected_niche: parsed.detected_niche || 'General',
          entities: Object.values(parsed.entities) as any[]
        };
      }
    } catch (parseErr) {
      console.warn('[Nano Banana] Failed to parse entity registry JSON:', parseErr, responseText);
    }

    console.log(`[Nano Banana] Pass 1 complete. Detected niche: "${registryData.detected_niche}", Entities found: ${registryData.entities.length}`);

    return res.json({
      success: true,
      registry: registryData
    });

  } catch (error: any) {
    console.error('Error in /api/srt/parse-entities:', error);
    return res.json({
      success: true,
      registry: { detected_niche: 'General', entities: [] },
      warning: error?.message || 'Fallback sem camada de entidades'
    });
  }
});

/**
 * PASS 2: Visual Prompt Generation API Route (PROMPT_VISUAL_DIRECTOR)
 */
app.post('/api/srt/parse-prompts', async (req, res) => {
  try {
    const { srtBlocks, entityRegistry, textStylecard, referenceImageBase64, customApiKey } = req.body;

    if (!srtBlocks || !Array.isArray(srtBlocks) || srtBlocks.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de blocos SRT inválida ou vazia.' });
    }

    const ai = getGenAIClient(customApiKey);

    console.log('[Nano Banana] Pass 2: Generating visual prompts using PROMPT_VISUAL_DIRECTOR...');

    const entityRegistryText = entityRegistry && Array.isArray(entityRegistry.entities) && entityRegistry.entities.length > 0
      ? JSON.stringify(entityRegistry, null, 2)
      : '{"detected_niche": "General", "entities": []}';

    const userPrompt = `Abaixo está o arquivo de legendas SRT completo para gerar os prompts visuais:\n${JSON.stringify(srtBlocks, null, 2)}

CANONICAL ENTITY REGISTRY (JSON):
${entityRegistryText}

Estilo Visual Escolhido (Stylecard):
${textStylecard || 'Cinematic 35mm photograph, hyper-detailed 8k resolution'}`;

    const promptPayload: any[] = [];
    if (referenceImageBase64 && typeof referenceImageBase64 === 'string' && referenceImageBase64.startsWith('data:image')) {
      const parts = referenceImageBase64.split(';');
      const mimeType = parts[0].replace('data:', '');
      const base64Data = parts[1].replace('base64,', '');
      promptPayload.push({ inlineData: { mimeType, data: base64Data } });
      promptPayload.push({ text: userPrompt });
    } else {
      promptPayload.push(userPrompt);
    }

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: promptPayload,
      config: {
        systemInstruction: PROMPT_VISUAL_DIRECTOR,
        responseMimeType: 'application/json',
        responseSchema: {
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
        }
      }
    });

    const responseText = response.text || '[]';
    let frames: any[] = [];
    try {
      frames = JSON.parse(cleanGeminiJson(responseText));
    } catch (parseErr) {
      console.error('Failed to parse Gemini prompts JSON response:', parseErr, responseText);
    }

    // Validation: Check if returned count matches srtBlocks count
    if (frames.length !== srtBlocks.length) {
      console.warn(`[Nano Banana] Prompt count mismatch: expected ${srtBlocks.length}, got ${frames.length}. Reprocessing missing blocks...`);

      const receivedIds = new Set(frames.map((f: any) => Number(f.id)));
      const missingBlocks = srtBlocks.filter((b: any) => !receivedIds.has(Number(b.id)));

      if (missingBlocks.length > 0) {
        try {
          const targetedUserPrompt = `Alguns blocos do SRT ficaram faltantes na geração inicial. Gere os prompts visuais APENAS para os seguintes blocos SRT faltantes:\n${JSON.stringify(missingBlocks, null, 2)}\n\nCANONICAL ENTITY REGISTRY:\n${entityRegistryText}`;

          const retryRes = await ai.models.generateContent({
            model: GEMINI_TEXT_MODEL,
            contents: [{ text: targetedUserPrompt }],
            config: {
              systemInstruction: PROMPT_VISUAL_DIRECTOR,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.INTEGER },
                    timeStart: { type: Type.STRING },
                    timeEnd: { type: Type.STRING },
                    subtitleText: { type: Type.STRING },
                    visualPrompt: { type: Type.STRING },
                    cameraShot: { type: Type.STRING },
                    mood: { type: Type.STRING },
                    sceneId: { type: Type.STRING }
                  },
                  required: ['id', 'timeStart', 'timeEnd', 'subtitleText', 'visualPrompt']
                }
              }
            }
          });

          if (retryRes.text) {
            const missingFrames = JSON.parse(cleanGeminiJson(retryRes.text));
            if (Array.isArray(missingFrames)) {
              frames = [...frames, ...missingFrames];
            }
          }
        } catch (retryErr) {
          console.error('[Nano Banana] Targeted retry for missing blocks failed:', retryErr);
        }
      }

      // Final fallback for any still missing blocks
      const finalReceivedIds = new Set(frames.map((f: any) => Number(f.id)));
      for (const block of srtBlocks) {
        if (!finalReceivedIds.has(Number(block.id))) {
          frames.push({
            id: block.id,
            timeStart: block.timeStart,
            timeEnd: block.timeEnd,
            subtitleText: block.text,
            visualPrompt: `${block.text}, ${textStylecard || 'cinematic style, 8k'}`,
            cameraShot: 'Medium shot',
            mood: 'Dramatic'
          });
        }
      }
    }

    // Ensure frames are strictly sorted by block ID
    frames.sort((a, b) => Number(a.id) - Number(b.id));

    return res.json({
      success: true,
      frames,
      entityRegistry
    });

  } catch (error: any) {
    console.error('Error in /api/srt/parse-prompts:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Falha ao gerar prompts visuais com Gemini.'
    });
  }
});

/**
 * API Route: Generate Entity Reference Sheet Image
 */
app.post('/api/entity/generate-reference', async (req, res) => {
  try {
    const { entity, textStylecard, customApiKey } = req.body;

    if (!entity || !entity.canonical_description) {
      return res.status(400).json({ success: false, error: 'Dados da entidade inválidos.' });
    }

    const effectiveKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;
    if (!effectiveKey || effectiveKey === 'MY_GEMINI_API_KEY') {
      const fallbackUrl = createFallbackCanvasImage(
        entity.canonical_description,
        entity.id,
        'REFERENCE',
        textStylecard || '',
        '1:1'
      );
      return res.json({ success: true, imageUrl: fallbackUrl, isFallback: true });
    }

    const ai = getGenAIClient(effectiveKey);
    const referencePrompt = `${entity.canonical_description}, full body, neutral gray studio background, soft even lighting, front view, no scene, no text, no watermark`;

    let imageUrl = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: {
          parts: [{ text: referencePrompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: '1:1' as any
          }
        }
      });

      const candidates = response.candidates;
      if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            imageUrl = `data:${mime};base64,${part.inlineData.data}`;
            break;
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Nano Banana] Reference sheet generation failed for entity ${entity.id}:`, err?.message || err);
    }

    if (!imageUrl) {
      imageUrl = createFallbackCanvasImage(
        entity.canonical_description,
        entity.id,
        'REF SHEET',
        textStylecard || '',
        '1:1'
      );
    }

    return res.json({ success: true, imageUrl });

  } catch (err: any) {
    console.error('Error in /api/entity/generate-reference:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Falha ao gerar ficha de referência.' });
  }
});

/**
 * API Route: Generate Single Image (Gemini Multimodal / Smart Retry / Fallback Canvas)
 */
app.post('/api/image/generate', async (req, res) => {
  try {
    const {
      prompt,
      subtitleText,
      timecode,
      styleText,
      aspectRatio = '16:9',
      referenceImages = [],
      referenceImageBase64,
      model = 'gemini-3.1-flash-lite-image',
      forceFallback = false,
      customApiKey
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ success: false, error: 'Prompt é obrigatório.' });
    }

    const effectiveKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;

    if (forceFallback || !effectiveKey || effectiveKey === 'MY_GEMINI_API_KEY') {
      const fallbackUrl = createFallbackCanvasImage(prompt, subtitleText || '', timecode || '00:00:00', styleText || '', aspectRatio);
      return res.json({
        success: true,
        imageUrl: fallbackUrl,
        isFallback: true
      });
    }

    const ai = getGenAIClient(effectiveKey);

    // Prepare content parts for Gemini Imagen / Multimodal
    const buildParts = (currentPrompt: string) => {
      const parts: any[] = [];

      // Collect all entity reference images + style reference image
      const allRefImages: string[] = [];
      if (Array.isArray(referenceImages)) {
        allRefImages.push(...referenceImages.filter(img => typeof img === 'string' && img.startsWith('data:image')));
      }
      if (referenceImageBase64 && typeof referenceImageBase64 === 'string' && referenceImageBase64.startsWith('data:image')) {
        allRefImages.push(referenceImageBase64);
      }

      if (allRefImages.length > 0) {
        for (const refImg of allRefImages) {
          const partsHeader = refImg.split(';');
          const mimeType = partsHeader[0].replace('data:', '');
          const base64Data = partsHeader[1].replace('base64,', '');
          parts.push({
            inlineData: { mimeType, data: base64Data }
          });
        }
        parts.push({
          text: `Generate a new scene featuring the EXACT same subject(s) shown in the reference image(s), preserving faces, clothing, colors and design identically, now: ${currentPrompt}`
        });
      } else {
        parts.push({ text: currentPrompt });
      }

      return parts;
    };

    let activePrompt = prompt;
    let generatedImageUrl = '';
    let generationErrorMsg = '';

    const primaryModel = model === 'gemini-3.1-flash-image' ? 'gemini-3.1-flash-image' : 'gemini-3.1-flash-lite-image';

    // Helper function for generation with retry backoff for rate limits (429)
    const executeGenerationAttempt = async (targetModel: string, targetPrompt: string): Promise<string> => {
      const backoffDelays = [2000, 4000, 8000];
      let lastErr = null;

      for (let attempt = 0; attempt <= backoffDelays.length; attempt++) {
        try {
          console.log(`[Nano Banana] Attempting image generation (model: ${targetModel}, attempt: ${attempt + 1})...`);
          const parts = buildParts(targetPrompt);
          const response = await ai.models.generateContent({
            model: targetModel,
            contents: { parts },
            config: {
              imageConfig: {
                aspectRatio: (['1:1', '3:4', '4:3', '9:16', '16:9'].includes(aspectRatio) ? aspectRatio : '16:9') as any
              }
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
            console.warn(`[Nano Banana] Rate limit (429) detected. Waiting ${backoffDelays[attempt]}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, backoffDelays[attempt]));
            continue;
          }

          throw err;
        }
      }
      if (lastErr) throw lastErr;
      return '';
    };

    // Attempt 1: Primary Model (with rate limit backoff)
    try {
      generatedImageUrl = await executeGenerationAttempt(primaryModel, activePrompt);
    } catch (err1: any) {
      const errMsg = err1?.message || String(err1);
      console.warn(`[Nano Banana] Primary model ${primaryModel} failed:`, errMsg);
      generationErrorMsg = errMsg;

      // Smart Retry for Safety Policy Block: Rewrite prompt neutrally via Gemini text
      const isSafetyError = errMsg.toLowerCase().includes('safety') || errMsg.toLowerCase().includes('policy') || errMsg.toLowerCase().includes('blocked');
      if (isSafetyError) {
        console.log('[Nano Banana] Safety policy block detected. Requesting neutral prompt rewrite from Gemini...');
        try {
          const rewriteResponse = await ai.models.generateContent({
            model: GEMINI_TEXT_MODEL,
            contents: [{
              text: `rewrite this image prompt to be fully policy-safe, keeping the same scene meaning:\n"${activePrompt}"`
            }]
          });

          if (rewriteResponse.text) {
            activePrompt = rewriteResponse.text.trim();
            console.log(`[Nano Banana] Retrying generation with safety-rewritten prompt: "${activePrompt.slice(0, 100)}..."`);
            generatedImageUrl = await executeGenerationAttempt(primaryModel, activePrompt);
          }
        } catch (rewriteErr) {
          console.warn('[Nano Banana] Safety rewrite attempt failed:', rewriteErr);
        }
      }
    }

    // Attempt 2: Backup Imagen 3 model (imagen-3.0-generate-002)
    if (!generatedImageUrl) {
      try {
        console.log('[Nano Banana] Attempting backup Imagen 3 model: imagen-3.0-generate-002');
        const imgRes = await ai.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: activePrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: (['1:1', '3:4', '4:3', '9:16', '16:9'].includes(aspectRatio) ? aspectRatio : '16:9') as any
          }
        });

        if (imgRes.generatedImages && imgRes.generatedImages.length > 0) {
          const imgBytes = imgRes.generatedImages[0].image?.imageBytes;
          if (imgBytes) {
            generatedImageUrl = `data:image/png;base64,${imgBytes}`;
          }
        }
      } catch (err2: any) {
        console.warn('[Nano Banana] Backup Imagen 3 model failed:', err2?.message || err2);
      }
    }

    if (generatedImageUrl) {
      return res.json({
        success: true,
        imageUrl: generatedImageUrl
      });
    }

    // Fallback Canvas SVG
    console.warn("[Nano Banana] AI image generation fallback triggered. Reason:", generationErrorMsg || 'No inline image returned');
    const fallbackUrl = createFallbackCanvasImage(prompt, subtitleText || '', timecode || '00:00:00', styleText || '', aspectRatio);
    return res.json({
      success: true,
      imageUrl: fallbackUrl,
      isFallback: true,
      warning: generationErrorMsg ? `Aviso de API: ${generationErrorMsg}` : undefined
    });

  } catch (error: any) {
    console.error('Error generating image via Gemini:', error);
    const { prompt, subtitleText, timecode, styleText, aspectRatio } = req.body;
    const fallbackUrl = createFallbackCanvasImage(
      prompt || 'Scene',
      subtitleText || '',
      timecode || '00:00:00',
      styleText || '',
      aspectRatio || '16:9'
    );

    return res.json({
      success: true,
      imageUrl: fallbackUrl,
      warning: `Gemini API fallback ativa: ${error?.message || 'Geração local por prévia visual'}`
    });
  }
});

// ================= VITE DEV / PRODUCTION MIDDLEWARE =================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`⚡ Nano Banana Server listening at http://localhost:${PORT}`);
  });
}

startServer();
