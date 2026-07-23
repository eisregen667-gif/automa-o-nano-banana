// Busca de imagens reais no Google (Custom Search JSON API) para usar como
// referência visual das entidades canônicas. Requer uma chave de API e um
// Search Engine ID (CX) configurados pelo usuário nas Configurações.

import { logInfo, logSuccess, logWarn } from '../utils/logger';

export interface ImageSearchResult {
  imageUrl: string;
  thumbnailUrl: string;
  title: string;
  sourcePage: string;
}

export async function searchGoogleImages(
  query: string,
  apiKey: string,
  cx: string
): Promise<ImageSearchResult[]> {
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    searchType: 'image',
    num: '8',
    safe: 'active'
  });

  logInfo(`Google Imagens: buscando "${query}"...`);
  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Falha na busca (HTTP ${res.status})`);
  }

  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  logSuccess(`Google Imagens: ${items.length} resultados para "${query}".`);

  return items.map((it: any) => ({
    imageUrl: it.link,
    thumbnailUrl: it.image?.thumbnailLink || it.link,
    title: it.title || '',
    sourcePage: it.image?.contextLink || ''
  }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Baixa a imagem escolhida como Data URL. Tenta a imagem original primeiro;
 * se o site de origem bloquear (CORS), cai para a miniatura do Google.
 */
export async function fetchImageAsDataUrl(result: ImageSearchResult): Promise<string> {
  for (const url of [result.imageUrl, result.thumbnailUrl]) {
    if (!url) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith('image')) continue;
      if (url !== result.imageUrl) {
        logWarn('Imagem original bloqueada pelo site de origem; usando a miniatura do Google como referência.');
      }
      return await blobToDataUrl(blob);
    } catch {
      // tenta a próxima URL
    }
  }
  throw new Error('Não foi possível baixar esta imagem (bloqueio do site de origem). Tente outra do resultado.');
}
