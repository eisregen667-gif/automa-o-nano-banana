/**
 * Converts any image URL (Base64 PNG, Base64 SVG, or SVG string) into a genuine PNG Blob
 * to ensure 100% compatibility with Windows Photo Viewer, macOS Preview, and video editors.
 */
export async function urlToPngBlob(imageUrl: string, targetWidth = 1280, targetHeight = 720): Promise<Blob> {
  // Case 1: Standard Base64 PNG or JPEG
  if (imageUrl.startsWith('data:image/png;base64,') || imageUrl.startsWith('data:image/jpeg;base64,')) {
    const parts = imageUrl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const base64Data = parts[1];
    
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  // Case 2: SVG Data URL or remote image - rasterize using Offscreen / HTML Canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || targetWidth;
        canvas.height = img.naturalHeight || targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D context unavailable'));
        }

        // Draw image onto canvas
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Convert canvas drawing to true PNG Blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to generate PNG blob from canvas'));
          }
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => {
      reject(new Error('Failed to load image for PNG rasterization: ' + err));
    };

    img.src = imageUrl;
  });
}

function loadImage(imageUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Failed to load image: ' + err));
    img.src = imageUrl;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate blob from canvas'));
    }, type, quality);
  });
}

export interface OptimizedImage {
  blob: Blob;
  ext: 'png' | 'jpg';
}

/**
 * Converts any image URL into a blob of at most `maxBytes` (default 1MB).
 * Strategy: keep PNG when it fits; otherwise convert to JPEG lowering the
 * quality, and as a last resort progressively downscale until it fits.
 */
export async function urlToOptimizedBlob(imageUrl: string, maxBytes = 1048576): Promise<OptimizedImage> {
  // Fast path: raw base64 PNG/JPEG already within the limit
  if (imageUrl.startsWith('data:image/png;base64,') || imageUrl.startsWith('data:image/jpeg;base64,')) {
    const raw = await urlToPngBlob(imageUrl);
    if (raw.size <= maxBytes) {
      return { blob: raw, ext: imageUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png' };
    }
  }

  const img = await loadImage(imageUrl);
  let width = img.naturalWidth || 1280;
  let height = img.naturalHeight || 720;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, width, height);

  const png = await canvasToBlob(canvas, 'image/png');
  if (png.size <= maxBytes) return { blob: png, ext: 'png' };

  // JPEG quality ladder at full resolution
  for (const quality of [0.92, 0.85, 0.75, 0.65, 0.55]) {
    const jpg = await canvasToBlob(canvas, 'image/jpeg', quality);
    if (jpg.size <= maxBytes) return { blob: jpg, ext: 'jpg' };
  }

  // Last resort: progressively downscale
  let lastBlob: Blob | null = null;
  for (let i = 0; i < 6; i++) {
    width = Math.round(width * 0.85);
    height = Math.round(height * 0.85);
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const sctx = scaled.getContext('2d');
    if (!sctx) break;
    sctx.drawImage(img, 0, 0, width, height);
    const jpg = await canvasToBlob(scaled, 'image/jpeg', 0.8);
    lastBlob = jpg;
    if (jpg.size <= maxBytes) return { blob: jpg, ext: 'jpg' };
  }

  return { blob: lastBlob || png, ext: lastBlob ? 'jpg' : 'png' };
}

/**
 * Triggers a direct download of a file with a specified filename
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
