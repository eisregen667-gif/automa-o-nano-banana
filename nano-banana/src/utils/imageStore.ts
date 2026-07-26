// Armazenamento eficiente de imagens: Blobs binários no IndexedDB (uma chave
// por frame) + object URLs leves na memória. Evita o estouro de memória que
// strings base64 gigantes causavam em projetos grandes.

import { setDbItem, getDbItem, removeDbItem } from './db';
import { GeneratedFrame } from '../types';

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Salva a imagem (data URL vinda da API) como Blob e retorna um object URL leve */
export async function persistFrameImage(frameId: number, imageUrl: string): Promise<string> {
  try {
    if (imageUrl.startsWith('data:')) {
      const blob = dataUrlToBlob(imageUrl);
      await setDbItem(`img:${frameId}`, blob);
      return URL.createObjectURL(blob);
    }
  } catch (err) {
    console.warn(`Falha ao persistir imagem do frame ${frameId}:`, err);
  }
  return imageUrl;
}

/** Recarrega a imagem persistida de um frame como object URL (ou null) */
export async function loadFrameImage(frameId: number): Promise<string | null> {
  try {
    const blob = await getDbItem<Blob>(`img:${frameId}`);
    return blob instanceof Blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

export async function deleteFrameImage(frameId: number): Promise<void> {
  await removeDbItem(`img:${frameId}`);
}

/** Libera um object URL antigo (evita vazamento de memória ao substituir) */
export function releaseImageUrl(url?: string): void {
  if (url && url.startsWith('blob:')) {
    try { URL.revokeObjectURL(url); } catch { /* já liberado */ }
  }
}

/** Remove as imagens dos metadados antes de persistir o projeto (fica leve) */
export function stripImagesForPersist(frames: GeneratedFrame[]): GeneratedFrame[] {
  return frames.map(({ imageUrl, ...rest }) => rest as GeneratedFrame);
}
