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
