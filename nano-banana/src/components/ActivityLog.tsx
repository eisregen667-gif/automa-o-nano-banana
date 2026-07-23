import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { subscribeLog, getLogEntries, clearLog, LogEntry, LogLevel } from '../utils/logger';
import { Terminal, Trash2, ChevronDown, ChevronUp, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

const LEVEL_STYLES: Record<LogLevel, { text: string; icon: React.ReactNode }> = {
  info: { text: 'text-slate-300', icon: <Info className="w-3 h-3 text-sky-400 shrink-0" /> },
  success: { text: 'text-emerald-300', icon: <CircleCheck className="w-3 h-3 text-emerald-400 shrink-0" /> },
  warn: { text: 'text-amber-300', icon: <TriangleAlert className="w-3 h-3 text-amber-400 shrink-0" /> },
  error: { text: 'text-rose-300', icon: <CircleAlert className="w-3 h-3 text-rose-400 shrink-0" /> }
};

export const ActivityLog: React.FC = () => {
  const entries = useSyncExternalStore(subscribeLog, getLogEntries);
  const [isOpen, setIsOpen] = useState(false);
  const [lastSeenId, setLastSeenId] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest entry while the panel is open
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      if (entries.length > 0) {
        setLastSeenId(entries[entries.length - 1].id);
      }
    }
  }, [entries, isOpen]);

  const unseenCount = entries.filter((e) => e.id > lastSeenId).length;
  const hasError = entries.some((e) => e.id > lastSeenId && e.level === 'error');

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-md">
      {isOpen && (
        <div className="mb-2 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
          {/* Panel header */}
          <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-amber-400" />
              Log de Atividades
              <span className="text-[10px] font-mono text-slate-500">({entries.length} eventos)</span>
            </span>
            <button
              onClick={clearLog}
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition-colors"
              title="Limpar log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Entries list */}
          <div ref={listRef} className="max-h-72 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px] leading-relaxed scrollbar-thin">
            {entries.length === 0 ? (
              <p className="text-slate-600 text-center py-4">
                Nenhuma atividade registrada ainda. As ações do app aparecerão aqui em tempo real.
              </p>
            ) : (
              entries.map((entry: LogEntry) => (
                <div key={entry.id} className="flex items-start gap-2">
                  <span className="text-slate-600 shrink-0">{entry.time}</span>
                  <span className="mt-0.5">{LEVEL_STYLES[entry.level].icon}</span>
                  <span className={LEVEL_STYLES[entry.level].text}>{entry.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border shadow-xl text-xs font-bold transition-all ${
          hasError && !isOpen
            ? 'bg-rose-950 border-rose-800 text-rose-300 hover:bg-rose-900'
            : 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Terminal className="w-4 h-4 text-amber-400" />
        Log de Atividades
        {unseenCount > 0 && !isOpen && (
          <span className={`min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${
            hasError ? 'bg-rose-500 text-white' : 'bg-amber-400 text-slate-950'
          }`}>
            {unseenCount > 99 ? '99+' : unseenCount}
          </span>
        )}
        {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
