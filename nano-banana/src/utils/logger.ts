// Registro central de atividades do Nano Banana: cada evento relevante
// (análises, geração de imagens, fila, erros, fallbacks) é registrado aqui
// e exibido em tempo real no painel de Log de Atividades.

export type LogLevel = 'info' | 'success' | 'warn' | 'error';

export interface LogEntry {
  id: number;
  time: string; // HH:MM:SS
  level: LogLevel;
  message: string;
}

const MAX_ENTRIES = 500;

let entries: LogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function log(level: LogLevel, message: string): void {
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour12: false });
  entries = [...entries, { id: nextId++, time, level, message }];
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  notify();
}

export const logInfo = (message: string) => log('info', message);
export const logSuccess = (message: string) => log('success', message);
export const logWarn = (message: string) => log('warn', message);
export const logError = (message: string) => log('error', message);

export function getLogEntries(): LogEntry[] {
  return entries;
}

export function clearLog(): void {
  entries = [];
  notify();
}

export function subscribeLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
