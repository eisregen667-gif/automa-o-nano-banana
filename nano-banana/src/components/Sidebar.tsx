import React from 'react';
import { FileText, Palette, Clapperboard, Images, Settings, Download, Power } from 'lucide-react';

export type AppView = 'roteiro' | 'estilo' | 'producao' | 'galeria';

interface SidebarProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  blocks: number;
  completed: number;
  total: number;
  inProgress: boolean;
  onOpenSettings: () => void;
  onOpenExport: () => void;
  onHardReset: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  view,
  onNavigate,
  blocks,
  completed,
  total,
  inProgress,
  onOpenSettings,
  onOpenExport,
  onHardReset,
}) => {
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  const navItems: { id: AppView; icon: React.ReactNode; label: string; badge?: string }[] = [
    { id: 'roteiro', icon: <FileText className="w-4 h-4" />, label: 'Roteiro', badge: blocks > 0 ? `${blocks}` : undefined },
    { id: 'estilo', icon: <Palette className="w-4 h-4" />, label: 'Estilo Visual' },
    { id: 'producao', icon: <Clapperboard className="w-4 h-4" />, label: 'Produção' },
    { id: 'galeria', icon: <Images className="w-4 h-4" />, label: 'Galeria', badge: total > 0 ? `${completed}/${total}` : undefined },
  ];

  return (
    <aside className="w-full lg:w-60 shrink-0 bg-slate-900/90 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-row lg:flex-col lg:h-screen lg:sticky lg:top-0">
      {/* Brand */}
      <div className="hidden lg:flex items-center gap-2.5 px-4 py-5 border-b border-slate-800">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 text-lg shadow-lg shadow-amber-500/20">
          🍌
        </div>
        <div className="min-w-0">
          <h1 className="text-sm font-extrabold tracking-tight text-white leading-tight">NANO BANANA</h1>
          <p className="text-[10px] text-slate-400 leading-tight">Documentários por IA</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-row lg:flex-col gap-1 p-2 lg:p-3 overflow-x-auto lg:overflow-x-visible items-center lg:items-stretch">
        <span className="lg:hidden text-lg pl-1 pr-2">🍌</span>
        {navItems.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                active
                  ? 'bg-amber-400/10 text-amber-300 border border-amber-400/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge && (
                <span className={`ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  active ? 'bg-amber-400/20 text-amber-300' : 'bg-slate-800 text-slate-400'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Progress summary (desktop) */}
      {total > 0 && (
        <div className="hidden lg:block px-4 py-3 border-t border-slate-800">
          <div className="flex items-center justify-between text-[10px] font-semibold mb-1.5">
            <span className="text-slate-400">Imagens do projeto</span>
            <span className={inProgress ? 'text-amber-400 animate-pulse' : 'text-slate-300'}>{progressPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex flex-row lg:flex-col gap-1 p-2 lg:p-3 lg:border-t border-slate-800 items-center lg:items-stretch">
        <button
          onClick={onOpenExport}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Exportar</span>
        </button>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <Settings className="w-4 h-4" />
          <span className="hidden sm:inline">Configurações</span>
        </button>
        <button
          onClick={onHardReset}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors whitespace-nowrap"
          title="Limpar todos os dados do projeto e recomeçar"
        >
          <Power className="w-4 h-4" />
          <span className="hidden sm:inline">Resetar Projeto</span>
        </button>
      </div>
    </aside>
  );
};
