// Narração TTS com Gemini (portado do Gemini TTS Studio do usuário):
// 30 vozes pré-construídas, PCM 24kHz → WAV, chamadas diretas do navegador.

import { logInfo, logSuccess, logWarn, logError } from '../utils/logger';

export const TTS_VOICES: { name: string; desc: string }[] = [
  { name: 'Zephyr', desc: 'Brilhante' }, { name: 'Puck', desc: 'Animada' }, { name: 'Charon', desc: 'Informativa' },
  { name: 'Kore', desc: 'Firme' }, { name: 'Fenrir', desc: 'Excitável' }, { name: 'Leda', desc: 'Jovem' },
  { name: 'Orus', desc: 'Firme' }, { name: 'Aoede', desc: 'Leve' }, { name: 'Callirrhoe', desc: 'Descontraída' },
  { name: 'Autonoe', desc: 'Brilhante' }, { name: 'Enceladus', desc: 'Respirada' }, { name: 'Iapetus', desc: 'Clara' },
  { name: 'Umbriel', desc: 'Tranquila' }, { name: 'Algieba', desc: 'Suave' }, { name: 'Despina', desc: 'Fluida' },
  { name: 'Erinome', desc: 'Clara' }, { name: 'Algenib', desc: 'Áspera' }, { name: 'Rasalgethi', desc: 'Informativa' },
  { name: 'Laomedeia', desc: 'Animada' }, { name: 'Achernar', desc: 'Suave' }, { name: 'Alnilam', desc: 'Firme' },
  { name: 'Schedar', desc: 'Uniforme' }, { name: 'Gacrux', desc: 'Adulta' }, { name: 'Pulcherrima', desc: 'Avançada' },
  { name: 'Achird', desc: 'Amigável' }, { name: 'Zubenelgenubi', desc: 'Casual' }, { name: 'Vindemiatrix', desc: 'Gentil' },
  { name: 'Sadachbia', desc: 'Vivaz' }, { name: 'Sadaltager', desc: 'Conhecedora' }, { name: 'Sulafat', desc: 'Calorosa' }
];

export type TtsModel = 'gemini-2.5-flash-preview-tts' | 'gemini-2.5-pro-preview-tts';

/** Gera o áudio de um chunk. Retorna PCM 16-bit 24kHz em base64. */
export async function generateTtsChunk(
  text: string,
  voice: string,
  model: TtsModel,
  apiKey: string,
  styleInstruction?: string
): Promise<string> {
  const body = styleInstruction?.trim() ? `${styleInstruction.trim()}\n\n${text}` : text;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: body }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `TTS falhou (HTTP ${res.status})`);
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
  if (!part) {
    const reason = data?.candidates?.[0]?.finishReason || 'sem áudio na resposta';
    throw new Error(`O modelo não retornou áudio (${reason}).`);
  }
  return part.inlineData.data as string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function wavHeader(pcmLength: number, sampleRate = 24000): Uint8Array {
  const h = new ArrayBuffer(44);
  const v = new DataView(h);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); v.setUint32(4, 36 + pcmLength, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  writeStr(36, 'data'); v.setUint32(40, pcmLength, true);
  return new Uint8Array(h);
}

/** Converte PCM base64 (um chunk) em Blob WAV tocável */
export function pcmB64ToWavBlob(pcmB64: string): Blob {
  const pcm = b64ToBytes(pcmB64);
  const out = new Uint8Array(44 + pcm.length);
  out.set(wavHeader(pcm.length), 0);
  out.set(pcm, 44);
  return new Blob([out], { type: 'audio/wav' });
}

/** Junta vários Blobs de PCM cru em um único WAV (narração completa) */
export async function mergePcmBlobsToWav(pcmBlobs: Blob[]): Promise<Blob> {
  const buffers = await Promise.all(pcmBlobs.map((b) => b.arrayBuffer()));
  const totalLen = buffers.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(44 + totalLen);
  out.set(wavHeader(totalLen), 0);
  let offset = 44;
  for (const buf of buffers) {
    out.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return new Blob([out], { type: 'audio/wav' });
}

export function pcmB64ToRawBlob(pcmB64: string): Blob {
  return new Blob([b64ToBytes(pcmB64)], { type: 'application/octet-stream' });
}

/** Sanitiza o roteiro: remove marcações que o TTS leria em voz alta */
export function sanitizeScriptForTts(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/["“”]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface TtsLintIssue {
  message: string;
  severity: 'grave' | 'aviso';
}

/** Verificação de qualidade do texto para TTS (portada do TTS Studio) */
export function lintScriptForTts(text: string): TtsLintIssue[] {
  const issues: TtsLintIssue[] = [];
  if (/\d/.test(text)) issues.push({ message: 'Há algarismos no texto — o TTS sorteia a pronúncia; escreva os números por extenso.', severity: 'grave' });
  if (/[()]/.test(text)) issues.push({ message: 'Há parênteses — o TTS lê sem mudar o tom e a frase embola.', severity: 'grave' });
  if (/\[[^\]]{3,60}\]/.test(text)) issues.push({ message: 'Há colchetes de produção — o TTS vai ler em voz alta.', severity: 'grave' });

  const sentences = text.split(/[.!?…]+\s/).filter((s) => s.trim());
  let longCount = 0;
  let totalWords = 0;
  for (const s of sentences) {
    const w = s.trim().split(/\s+/).length;
    totalWords += w;
    if (w > 30) longCount++;
  }
  if (longCount > 0) issues.push({ message: `${longCount} frase(s) com mais de 30 palavras — fôlego único no TTS; quebre em duas.`, severity: 'grave' });
  const media = sentences.length ? totalWords / sentences.length : 0;
  if (media > 18) issues.push({ message: `Média de ${media.toFixed(1)} palavras por frase (ideal para TTS: 12 a 18).`, severity: 'aviso' });

  return issues;
}

/** Divide o roteiro em chunks respeitando parágrafos e frases */
export function buildTtsChunks(text: string, maxChars: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const p of paragraphs) {
    if ((current + '\n\n' + p).length <= maxChars) {
      current = current ? `${current}\n\n${p}` : p;
      continue;
    }
    pushCurrent();
    if (p.length <= maxChars) {
      current = p;
      continue;
    }
    // Parágrafo maior que o limite: quebra por frases
    const sentences = p.match(/[^.!?…]+[.!?…]+["”]?\s*/g) || [p];
    for (const s of sentences) {
      if ((current + ' ' + s).length > maxChars) pushCurrent();
      current = current ? `${current} ${s.trim()}` : s.trim();
    }
    pushCurrent();
  }
  pushCurrent();
  return chunks;
}

export const ttsLog = { logInfo, logSuccess, logWarn, logError };
