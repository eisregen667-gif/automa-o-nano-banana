// Geração de trilha sonora com Lyria 3 (Gemini API) — mesma chave do resto
// da ferramenta. Pro: faixas de até ~3 min; Clip: vinhetas fixas de 30s.

export type LyriaModel = 'lyria-3-pro-preview' | 'lyria-3-clip-preview';

export interface LyriaTrack {
  blob: Blob;
  ext: string;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function extFromMime(mime: string): string {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  return 'mp3'; // audio/mp3 e audio/mpeg
}

/** Gera uma faixa instrumental com o Lyria 3 e retorna o áudio como Blob. */
export async function generateLyriaTrack(
  prompt: string,
  model: LyriaModel,
  apiKey: string
): Promise<LyriaTrack> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['AUDIO'] }
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Lyria falhou (HTTP ${res.status})`);
  }

  const data = await res.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((p) => p?.inlineData?.data && String(p.inlineData.mimeType || '').startsWith('audio'));
  if (!audioPart) {
    const reason = data?.candidates?.[0]?.finishReason || 'sem áudio na resposta';
    throw new Error(`O Lyria não retornou áudio (${reason}).`);
  }

  const mime = String(audioPart.inlineData.mimeType || 'audio/mp3');
  const bytes = b64ToBytes(audioPart.inlineData.data);
  return { blob: new Blob([bytes], { type: mime }), ext: extFromMime(mime) };
}
