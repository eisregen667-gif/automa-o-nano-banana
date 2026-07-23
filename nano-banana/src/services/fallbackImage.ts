// Gerador de imagem SVG de fallback, compartilhado entre servidor (Node) e cliente (browser)

/** UTF-8 safe base64 encoding that works both in Node and in the browser */
function toBase64Utf8(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str).toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Helper to generate atmospheric fallback image as Base64 Data URL if Gemini Image API fails or no key
 */
export function createFallbackCanvasImage(
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

  return `data:image/svg+xml;base64,${toBase64Utf8(svg)}`;
}
