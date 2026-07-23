import { SrtBlock } from '../types';

/**
 * Parses raw SRT string into an array of SrtBlock objects
 */
export function parseSrt(srtContent: string): SrtBlock[] {
  if (!srtContent || !srtContent.trim()) return [];

  // Normalize newlines
  const normalized = srtContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split by double line breaks (SRT blocks)
  const blocksRaw = normalized.split(/\n\s*\n/);
  const result: SrtBlock[] = [];

  for (let i = 0; i < blocksRaw.length; i++) {
    const rawBlock = blocksRaw[i].trim();
    if (!rawBlock) continue;

    const lines = rawBlock.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    // Check if line 0 is a number index
    let timeIndex = 0;
    let blockId = i + 1;

    if (/^\d+$/.test(lines[0])) {
      blockId = parseInt(lines[0], 10);
      timeIndex = 1;
    }

    if (lines.length <= timeIndex) continue;

    const timeLine = lines[timeIndex];
    // Match 00:00:10,000 --> 00:00:15,000 or similar
    const timeMatch = timeLine.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);

    if (timeMatch) {
      const timeStart = timeMatch[1].replace('.', ',');
      const timeEnd = timeMatch[2].replace('.', ',');
      const textLines = lines.slice(timeIndex + 1);
      const text = textLines.join(' ');

      result.push({
        id: blockId,
        timeStart,
        timeEnd,
        text
      });
    }
  }

  return result;
}

/**
 * Format timestamp string to safe filename format (e.g. "00:01:23,450" -> "00-01-23")
 */
export function timeToSafeString(timeStr: string): string {
  if (!timeStr) return '00-00-00';
  const clean = timeStr.split(',')[0].replace(/:/g, '-');
  return clean;
}

/**
 * Clean filename generator based on index, start time and end time
 */
export function generateFilename(
  index: number,
  timeStart: string,
  timeEnd: string,
  template: string = '{index}_{start}_{end}'
): string {
  const padIndex = String(index).padStart(3, '0');
  const safeStart = timeToSafeString(timeStart);
  const safeEnd = timeToSafeString(timeEnd);

  let formatted = template
    .replace('{index}', padIndex)
    .replace('{start}', safeStart)
    .replace('{end}', safeEnd);

  // Guarantee that filename always starts with the zero-padded index for sequential sorting
  if (!formatted.startsWith(padIndex)) {
    formatted = `${padIndex}_${formatted}`;
  }

  return `${formatted}.png`;
}

/**
 * Converts SRT timecode "HH:MM:SS,mmm" or "HH:MM:SS.mmm" to total seconds (float)
 */
export function srtTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(/[,.]/);
  const timeParts = parts[0].split(':').map((p) => parseInt(p, 10) || 0);
  const millis = parts[1] ? parseInt(parts[1].padEnd(3, '0').slice(0, 3), 10) || 0 : 0;

  const hours = timeParts[0] || 0;
  const minutes = timeParts[1] || 0;
  const seconds = timeParts[2] || 0;

  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/**
 * Calculates duration in seconds between start and end timecode
 */
export function calculateDurationSeconds(timeStart: string, timeEnd: string): number {
  const startSec = srtTimeToSeconds(timeStart);
  const endSec = srtTimeToSeconds(timeEnd);
  const duration = endSec - startSec;
  return duration > 0 ? Number(duration.toFixed(3)) : 0;
}

/**
 * Converts array of SrtBlocks back to standard SRT string format
 */
export function stringifySrt(blocks: SrtBlock[]): string {
  return blocks.map((b, idx) => {
    return `${idx + 1}\n${b.timeStart} --> ${b.timeEnd}\n${b.text}\n`;
  }).join('\n');
}
