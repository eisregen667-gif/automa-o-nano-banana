import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

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

/**
 * Helper to generate atmospheric fallback image as Base64 Data URL if Gemini Image API fails or no key
 */
function createFallbackCanvasImage(
  prompt: string,
  subtitleText: string,
  timecode: string,
  styleText: string,
  aspectRatio: string = '16:9'
): string {
  // Determine dimensions based on aspect ratio
  let width = 1280;
  let height = 720;
  if (aspectRatio === '9:16') {
    width = 720;
    height = 1280;
  } else if (aspectRatio === '1:1') {
    width = 800;
    height = 800;
  } else if (aspectRatio === '4:3') {
    width = 1024;
    height = 768;
  }

  // Pick deterministic vibrant aesthetic colors based on string hash
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash << 5) - hash + prompt.charCodeAt(i);
    hash |= 0;
  }

  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 140) % 360;
  const hue3 = (hue1 + 220) % 360;

  const escapeXml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const safePrompt = escapeXml(prompt.slice(0, 180) + (prompt.length > 180 ? '...' : ''));
  const safeSub = escapeXml(subtitleText.slice(0, 100));
  const safeTime = escapeXml(timecode);
  const safeStyle = escapeXml(styleText.slice(0, 80));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="hsl(${hue1}, 75%, 15%)" />
        <stop offset="50%" stop-color="hsl(${hue2}, 80%, 22%)" />
        <stop offset="100%" stop-color="hsl(${hue3}, 70%, 10%)" />
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="40%" r="60%">
        <stop offset="0%" stop-color="hsl(${hue1}, 90%, 65%)" stop-opacity="0.35" />
        <stop offset="100%" stop-color="hsl(${hue3}, 90%, 10%)" stop-opacity="0" />
      </radialGradient>
      <filter id="shadow">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.6" />
      </filter>
    </defs>

    <!-- Background Canvas -->
    <rect width="100%" height="100%" fill="url(#grad1)" />
    <rect width="100%" height="100%" fill="url(#glow)" />

    <!-- Grid pattern / Cyber aesthetic -->
    <g opacity="0.08" stroke="#ffffff" stroke-width="1">
      <line x1="0" y1="${height * 0.25}" x2="${width}" y2="${height * 0.25}" />
      <line x1="0" y1="${height * 0.5}" x2="${width}" y2="${height * 0.5}" />
      <line x1="0" y1="${height * 0.75}" x2="${width}" y2="${height * 0.75}" />
      <line x1="${width * 0.33}" y1="0" x2="${width * 0.33}" y2="${height}" />
      <line x1="${width * 0.66}" y1="0" x2="${width * 0.66}" y2="${height}" />
    </g>

    <!-- Header Badge -->
    <rect x="30" y="30" width="160" height="32" rx="16" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.2)" />
    <text x="110" y="51" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="700" fill="#facc15" text-anchor="middle">NANO BANANA</text>

    <!-- Timecode Badge -->
    <rect x="${width - 210}" y="30" width="180" height="32" rx="16" fill="rgba(0,0,0,0.5)" stroke="rgba(250,204,21,0.4)" />
    <text x="${width - 120}" y="51" font-family="monospace" font-size="13" font-weight="700" fill="#e2e8f0" text-anchor="middle">⏱ ${safeTime}</text>

    <!-- Central Visual Element -->
    <circle cx="${width / 2}" cy="${height / 2 - 20}" r="${Math.min(width, height) * 0.18}" fill="none" stroke="hsl(${hue1}, 90%, 60%)" stroke-width="3" stroke-dasharray="10 6" opacity="0.8" />
    <circle cx="${width / 2}" cy="${height / 2 - 20}" r="${Math.min(width, height) * 0.08}" fill="hsl(${hue2}, 85%, 55%)" opacity="0.85" filter="url(#shadow)" />

    <!-- Subtitle Card Overlay -->
    <rect x="40" y="${height - 180}" width="${width - 80}" height="140" rx="12" fill="rgba(15, 23, 42, 0.85)" stroke="rgba(255,255,255,0.15)" filter="url(#shadow)" />

    <!-- Stylecard Tag -->
    <text x="60" y="${height - 150}" font-family="-apple-system, sans-serif" font-size="12" font-weight="700" fill="#38bdf8">STYLECARD: ${safeStyle}</text>

    <!-- Subtitle Text -->
    <text x="60" y="${height - 118}" font-family="-apple-system, sans-serif" font-size="18" font-weight="700" fill="#ffffff" filter="url(#shadow)">"${safeSub}"</text>

    <!-- Visual Prompt Text -->
    <text x="60" y="${height - 85}" font-family="-apple-system, sans-serif" font-size="13" font-weight="400" fill="#94a3b8">PROMPT: ${safePrompt}</text>
  </svg>`;

  const base64Svg = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64Svg}`;
}

// ================= PROMPT CONSTANTS =================
const PROMPT_ENTITY_REGISTRY = `You are a world-class Script Entity Analyst for Veo Flow visual generation
(02_SKILL_ENTITY_REGISTRY & Section 22B UNIVERSAL_ENTITY_CONSISTENCY).
Your mission is to read the COMPLETE SRT script and produce a CANONICAL ENTITY
REGISTRY that guarantees 100% visual consistency across all generated images,
for ANY niche, genre, or category of script.

UNIVERSAL ENTITY EXTRACTION ENGINE (DOMAIN-AGNOSTIC):

1. FULL-SCRIPT COREFERENCE RESOLUTION:
   - Read the ENTIRE script before extracting anything.
   - Identify every entity mentioned MORE THAN ONCE, whether directly
     (by name/title) or indirectly (pronouns, epithets, descriptions):
     "the three men" = "they" = "the fishermen" = "the brothers".
   - Track mentions across the whole timeline: an entity introduced in
     block 3 and referenced again in block 190 is ONE entity.

2. UNIVERSAL ENTITY TYPES (extract ALL that recur):
   * PERSON / GROUP: named or unnamed people, crowds with identity
   * CREATURE / ANIMAL: species, mythical beings, monsters, pets
   * OBJECT / ARTIFACT: vehicles, weapons, tools, relics, machines,
     products, documents, sacred items
   * STRUCTURE / LOCATION: recurring buildings, ships, cities, rooms,
     landscapes that must look identical on every appearance
   * TECHNOLOGY / VEHICLE: spaceships, robots, AI interfaces, cars
   - Do NOT extract entities mentioned only once unless they are the
     central subject of the script.

3. NICHE-AWARE CANONICAL DESCRIPTIONS:
   - First detect the script's niche/genre/ERA/culture and ground every
     description in it. The detected era is MANDATORY inside every
     person description (e.g., "early 18th-century Brazilian colonial
     fisherman").
   - Write each canonical_description in ENGLISH.
   - Each PERSON must be individually distinguishable: age range, build,
     skin tone, facial hair, hairstyle, specific clothing items and
     colors (era-accurate), footwear, accessories. For groups, describe
     EACH member with a sub-ID (CHAR_01A, CHAR_01B, CHAR_01C).
   - Each OBJECT/STRUCTURE must specify: material, color, condition/wear,
     distinctive marks, size reference, era-accurate construction.
   - Include REAL-WORLD SIZE in every description: approximate height of
     persons, dimensions of objects and structures ("a 6-meter wooden
     canoe", "a chapel about 8 meters tall", "a man of average height,
     around 1.75m").
   - Descriptions must be SELF-CONTAINED and REUSABLE: a stranger reading
     only the description must picture the entity exactly, with zero
     access to the script.
   - Apply VEO_FLOW_SAFETY_REWRITE: no real celebrity/public figure
     likeness. For historical figures, describe era-accurate generic
     features without claiming identity resemblance.

4. STATE CHANGES & TIMELINE FORKS:
   - If the script explicitly changes an entity over time ("twenty years
     later", "broken in half", "now restored", "now in ruins"), create
     SEPARATE state versions: OBJ_01_v1, OBJ_01_v2, OBJ_01_v3, each with
     its own canonical_description and its own appears_in_blocks ranges.
   - NEVER blend states: block ranges must not overlap between versions.

5. ALIAS COMPLETENESS RULE:
   - The aliases array must contain EVERY textual form used in the
     script to reference the entity, in the script's ORIGINAL language,
     including pronouns bound to that entity in context, plural forms,
     nicknames, and descriptive epithets.
   - When a generic word ("the statue", "the machine", "the river")
     could refer to a registered entity, ALWAYS bind it to that entity
     unless the script clearly introduces a different one.

5-B. REAL-WORLD FACTUAL ENRICHMENT & IMPLICIT PRESENCE:
   - If a registered entity corresponds to a REAL documented artifact,
     place, or historical subject, enrich its canonical_description
     with historically accurate real-world details (true material,
     true size, true colors, true period style) — the script's own
     details always take priority, and real-world knowledge fills the
     gaps. Never invent details that contradict either the script or
     documented reality.
   - Extract explicit measurements stated in the script ("pouco mais
     de trinta centímetros", "oito metros de altura") and lock them
     into the canonical_description as absolute size law.
   - Add an "implicit_blocks" array to each primary entity: block
     indices where the entity is NOT named by any alias but is
     narratively present and should appear in the visual scene
     (e.g., blocks about devotion, prayers, miracles, or crowds
     gathering AROUND a registered sacred object; blocks about a
     journey happening ABOARD a registered ship).

6. OUTPUT SCHEMA (STRICT JSON ONLY — no commentary, no markdown fences):
{
  "detected_niche": "...",
  "detected_era": "...",
  "entities": [
    {
      "id": "CHAR_01 | OBJ_01 | LOC_01 | CREAT_01 | TECH_01 (+ _v2 for states)",
      "type": "person|group|creature|object|structure|location|technology",
      "aliases": ["..."],
      "canonical_description": "...",
      "appears_in_blocks": [],
      "implicit_blocks": [],
      "is_primary": true,
      "reference_image_recommended": true
    }
  ]
}
   - reference_image_recommended = true for persons, creatures, and any
     entity with a face or highly distinctive design.
   - If the script has NO recurring entities, return "entities": [].`;

const PROMPT_VISUAL_DIRECTOR = `You are a world-class Lead Visual Director and Prompt Engineer for Veo Flow
video/image generation and visual storytelling (01_SKILL_PRINCIPAL &
Section 22A UNIVERSAL_VISUAL_GROUNDING & Section 22B
UNIVERSAL_ENTITY_CONSISTENCY).
Your mission is to analyze the complete SRT subtitle file PLUS the provided
CANONICAL ENTITY REGISTRY (JSON) and convert EVERY SINGLE SRT block into a
HIGHLY DETAILED, DOMAIN-PERFECT, AND CONTEXTUALLY PRECISE VISUAL PROMPT IN
ENGLISH.

UNIVERSAL NICHE & GENRE CONTEXTUALIZATION ENGINE (ZERO HALLUCINATIONS):

1. UNIVERSAL SCRIPT CATEGORY & DOMAIN DETECTION:
   - Read the entire script first to identify its specific NICHE/GENRE:
     Historical & Cultural Documentaries | Sci-Fi & Cyberpunk |
     Fantasy & Mythology | Modern Corporate, Tech & Lifestyle |
     Crime, Thriller & Noir | Nature, Wildlife & Biology |
     Religious, Sacred & Folklore | Anime, Illustration & Concept Art
   - If the ENTITY REGISTRY includes "detected_niche" and
     "detected_era", treat them as authoritative.

2. DOMAIN-SPECIFIC WORLD BIBLE & STRICT BOUNDARY LOCKS:
   - Enforce 100% adherence to the detected domain's visual rules.
   - NEVER mix niches or introduce out-of-context domain entities.
   - ERA LOCK (MANDATORY IN EVERY PROMPT): once the script's time
     period is detected, EVERY single prompt must explicitly state the
     era in its subject description (e.g., "early 18th-century
     Brazilian colonial fishermen") AND append era-appropriate
     exclusions to the Negative Lock (e.g., "no modern clothing, no
     t-shirts, no baseball caps, no synthetic fabrics, no modern
     haircuts, no wristwatches, no modern boats or equipment").
     NO block may omit the era, even short transitional blocks.

3. ENTITY CONSISTENCY LOCK (HIGHEST PRIORITY RULE):
   - Before writing each block's prompt, check the ENTITY REGISTRY:
     if the current block index is listed in any entity's
     appears_in_blocks, OR the block text contains any of its aliases,
     you MUST insert that entity's canonical_description WORD-FOR-WORD
     into the prompt.
   - NEVER paraphrase, shorten, summarize, or re-imagine a registered
     entity. NEVER change clothing, age, facial features, colors, or
     object details between appearances.
   - If the script indicates a state change, use the correct state
     version (_v1, _v2, _v3) matching the block range.
   - Multiple entities in one block: include ALL of their canonical
     descriptions, composed naturally into one coherent scene.
   - IMPLICIT PRESENCE RULE: if the current block index is listed in an
     entity's implicit_blocks, the entity IS part of the visual scene
     even though the text never names it. Compose the scene around it
     naturally. Abstract narration blocks ("faith was growing",
     "reports of miracles spread") must be visually grounded in the
     registered entities and settings — never generate generic
     disconnected imagery for them.
   - This rule OVERRIDES stylistic brevity: consistency beats elegance.

4. CANONICAL ENTITY LOCKS & DYNAMIC EXCLUSIONS (CONFUSION PREVENTION):
   - For generic words NOT bound to a registered entity ("statue",
     "building", "machine", "landscape"), ground them 100% in the
     detected script domain and era.
   - Automatically append explicit confusion exclusions appropriate to
     the niche (e.g., "exclude out-of-context religious iconography",
     "exclude modern items", "exclude anachronistic architecture").

5. STRICT 1-TO-1 SYNCHRONIZATION:
   - Output EXACTLY ONE visual prompt for EVERY SRT block.
   - Do NOT merge, skip, drop, or split any SRT blocks. Maintain exact
     sequence and total count N.

6. NARRATIVE WINDOWING (5-BLOCK CONTEXT):
   - Analyze 2 previous blocks + current block + 2 future blocks.
   - Ground short fragments ("in the year", "and then") seamlessly
     inside the overarching visual beat and scene setting.
   - Consecutive blocks belonging to the SAME continuous scene must
     share the same environment, lighting and entity states, varying
     ONLY camera framing and action beat.

7. DEPTH LAYERING ENGINE (MANDATORY — REAL SENSE OF DEPTH):
   - Every prompt MUST explicitly define three depth planes:
     * FOREGROUND: a near element partially framing the shot
       (out-of-focus foliage, a shoulder, candle flame, window frame,
       rope, rocks)
     * MIDGROUND: the main subject at a clearly stated distance
       ("15 meters away", "across the plaza")
     * BACKGROUND: distant elements with atmospheric perspective
       ("mountains fading into haze", "distant tower softened by mist")
   - Every prompt MUST include at least ONE depth cue:
     shallow depth of field (f/1.8 bokeh) | atmospheric haze |
     volumetric light rays | overlapping occlusion | strong linear
     perspective toward a vanishing point.
   - Specify lens behavior intentionally: "wide-angle 24mm exaggerated
     perspective" for vast spaces, "85mm portrait separation" for
     subjects, "200mm telephoto compression" ONLY when compression is
     desired. Never leave lens/distance ambiguous.
   - Use human/familiar scale anchors for grandeur ("a small human
     figure in the distance reveals the massive scale").

8. SCALE & PROPORTION REALISM ENGINE (MANDATORY — TRUE-TO-LIFE SIZES):
   A. HUMAN SCALE ANCHOR (PRIMARY RULE):
      - Whenever ANY person appears in the scene, use them as the
        master scale reference and explicitly state at least ONE size
        relationship between the person and their surroundings:
        "the doorway stands about a head taller than the man",
        "the wooden table reaches his waist",
        "the canoe is about four adult body-lengths long".
      - Never leave a person floating in an environment with no stated
        size relationship to it.
   B. OBJECT-TO-OBJECT SIZE RELATIONSHIPS:
      - For scenes without people, anchor scale with familiar-size
        objects (a chair, a barrel, a horse, a car, a tree) and state
        the relation. Every major element must have a plausible
        real-world size implied by at least one comparison.
   C. REAL-WORLD METRIC GROUNDING:
      - Prefer concrete approximate measurements in natural language:
        "a 6-meter fishing boat", "a chapel about 8 meters tall",
        "waist-high river water".
      - All sizes must be era-accurate and domain-accurate for the
        detected niche.
      - When a registered entity's canonical_description already states
        a size, that size is LAW: never contradict it in any block.
   D. PERSPECTIVE & HORIZON DISCIPLINE:
      - State camera height and horizon placement in every prompt:
        "eye-level shot, horizon at the subject's eye height",
        "low-angle from ground level, horizon low in frame",
        "elevated three-quarter view overlooking the plaza".
      - Distant elements MUST diminish correctly; foreground elements
        MUST be proportionally larger and may be partially cropped by
        the frame edge.
   E. PROPORTION CONSISTENCY LOCK:
      - Human bodies: realistic anatomical proportions, feet firmly
        grounded on the ground plane, correct contact shadows anchoring
        every subject and object to the surface they stand on.
      - Architecture and objects: structurally plausible proportions
        (doors sized for humans, steps of walkable height, furniture
        matched to human use).

9. VEO_FLOW_SAFETY_REWRITE (MANDATORY):
   - Never output graphic violence, blood, gore, nudity, hate symbols,
     or real celebrity/public figure likenesses.
   - Rewrite sensitive scenes into respectful, safe, non-graphic
     documentary visual metaphors.

10. PROFESSIONAL CAMERA, LIGHTING & COMPOSITION ENGINE:
    - Every prompt MUST naturally specify:
      * Domain-Accurate Canonical Subject & Action
      * Environment, Architecture, Materials, Era-Specific Setting
      * Camera Framing & Angle (Wide establishing, Medium, Close-up
        detail, Low-angle scale)
      * Lighting & Color Mood (Volumetric golden hour, Moody
        candlelight, Neon contrast, Soft morning mist)
      * Stylecard directions
      * Mandatory Negative Lock: "no text, no subtitles, no logo,
        no watermark, no graphic violence, no blood, no gore,
        no explicit content, no real person likeness, no distorted
        proportions, no oversized or undersized objects, no floating
        objects, no incorrect relative scale, no warped anatomy,
        no miniature or giant effect" + the era-appropriate exclusions
        from the ERA LOCK.

11. OUTPUT:
    - Strictly single-line natural language prompt strings in English
      inside the required JSON schema, one per SRT block, exact count N.`;

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
      model: 'gemini-3.1-pro-preview',
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
      model: 'gemini-3.1-pro-preview',
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
            model: 'gemini-3.1-pro-preview',
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
            model: 'gemini-3.1-pro-preview',
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
