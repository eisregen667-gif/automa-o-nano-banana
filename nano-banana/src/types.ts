export interface ScriptEntity {
  id: string; // e.g. CHAR_01, OBJ_01, LOC_01, CREAT_01, TECH_01
  type: 'person' | 'group' | 'creature' | 'object' | 'structure' | 'location' | 'technology';
  aliases: string[];
  canonical_description: string;
  appears_in_blocks: number[];
  implicit_blocks?: number[];
  is_primary?: boolean;
  reference_image_recommended?: boolean;
}

export interface ColorScriptAct {
  act_label: string;
  block_start: number;
  block_end: number;
  palette: string;
  lighting_mood: string;
}

export interface VerifiedFact {
  fact: string;
  visual_rule: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface EntityRegistry {
  detected_niche: string;
  detected_era?: string;
  entities: ScriptEntity[];
  color_script?: ColorScriptAct[];
  fact_sheet?: VerifiedFact[];
  sources?: GroundingSource[];
}

export interface SrtBlock {
  id: number;
  timeStart: string; // e.g. "00:00:10,000"
  timeEnd: string;   // e.g. "00:00:15,000"
  text: string;      // Original subtitle text
}

export interface StyleCard {
  textStyle: string;         // e.g. "90s anime style, Studio Ghibli, pastel tones, 35mm film grain"
  presetName?: string;       // Name of preset if selected
  referenceImageBase64?: string; // Data URL or base64 string
  referenceImageMimeType?: string; // e.g. "image/jpeg"
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  negativePrompt?: string;   // Optional things to avoid
  strength?: number;         // 0 to 1 style strength
}

export interface GeneratedFrame {
  id: number;
  timeStart: string;
  timeEnd: string;
  subtitleText: string;
  visualPrompt: string;
  originalPrompt: string;
  videoPrompt?: string;     // Image-to-video motion prompt (Pass 3)
  isTitleCard?: boolean;    // Cartela de documentário (texto na imagem, inserida na sequência)
  cardText?: string;        // Texto exato exibido na cartela (para QC e regeneração)
  isBroll?: boolean;        // Cutaway de B-roll inserido na sequência
  isInsert?: boolean;       // Insert gráfico (mapa/linha do tempo/diagrama/card de dado)
  insertType?: string;      // map | timeline | diagram | statcard
  qcStatus?: 'approved' | 'fixed' | 'flagged'; // Resultado do Auto-QC visual
  qcIssues?: string;        // Problemas apontados pelo Auto-QC
  cameraShot?: string;      // e.g. "Close-up", "Wide shot", "Drone shot"
  mood?: string;            // e.g. "Dramatic", "Melancholic"
  sceneId?: string;         // e.g. "SCENE_01"
  status: 'pending' | 'generating' | 'completed' | 'failed';
  imageUrl?: string;
  error?: string;
  updatedAt?: number;
}

export interface QueueProgressState {
  total: number;
  completed: number;
  failed: number;
  inProgress: boolean;
  isPaused: boolean;
  currentFrameId?: number;
  concurrency: number; // 1, 2, or 4
}

export interface GeneratorConfig {
  model: 'gemini-3.1-flash-lite-image' | 'gemini-3.1-flash-image' | 'artistic-canvas-fallback';
  customApiKey?: string;
  filenameTemplate: '{index}_{start}_{end}' | '{index}_{start}' | 'frame_{index}';
}
