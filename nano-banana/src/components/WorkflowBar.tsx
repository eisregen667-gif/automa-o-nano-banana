import React from 'react';
import { Check, Loader2 } from 'lucide-react';

type StepState = 'done' | 'ready' | 'locked' | 'busy';

interface WorkflowBarProps {
  hasScript: boolean;
  totalBlocks: number;
  hasPrompts: boolean;
  isAnalyzing: boolean;
  onGeneratePrompts: () => void;
  totalFrames: number;
  completedFrames: number;
  queueInProgress: boolean;
  onStartQueue: () => void;
  qcRunning: boolean;
  qcDone: number;
  qcTotal: number;
  onAutoQC: () => void;
  cardsBusy: boolean;
  onTitleCards: () => void;
  brollBusy: boolean;
  onBroll: () => void;
  videoBusy: boolean;
  hasVideoPrompts: boolean;
  onVideoPrompts: () => void;
  onPreview: () => void;
  onExport: () => void;
}

const NUM_STYLES: Record<StepState, string> = {
  done: 'bg-emerald-500 text-slate-950',
  busy: 'bg-amber-400 text-slate-950 animate-pulse',
  ready: 'bg-amber-400 text-slate-950',
  locked: 'bg-slate-800 text-slate-500 border border-slate-700'
};

const StepCard: React.FC<{
  num: number;
  state: StepState;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}> = ({ num, state, title, subtitle, children }) => (
  <div
    className={`flex-1 min-w-[150px] rounded-xl border p-3 space-y-2 transition-colors ${
      state === 'locked'
        ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
        : 'bg-slate-950/70 border-slate-800'
    }`}
  >
    <div className="flex items-center gap-2">
      <span className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center shrink-0 ${NUM_STYLES[state]}`}>
        {state === 'done' ? <Check className="w-3.5 h-3.5" /> : state === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : num}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-white leading-tight truncate">{title}</p>
        <p className="text-[10px] text-slate-400 leading-tight truncate">{subtitle}</p>
      </div>
    </div>
    {children && <div className="flex flex-wrap gap-1.5">{children}</div>}
  </div>
);

const ActionBtn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  color: 'amber' | 'violet' | 'teal' | 'emerald' | 'slate';
  children: React.ReactNode;
  title?: string;
}> = ({ onClick, disabled, busy, color, children, title }) => {
  const colors: Record<string, string> = {
    amber: 'bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border-amber-500/40',
    violet: 'bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 border-violet-500/40',
    teal: 'bg-teal-500/10 hover:bg-teal-500/25 text-teal-300 border-teal-500/40',
    emerald: 'bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40',
    slate: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 ${
        disabled && !busy ? 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed' : `${colors[color]} cursor-pointer`
      } ${busy ? 'opacity-70 cursor-wait' : ''}`}
    >
      {busy && <Loader2 className="w-3 h-3 animate-spin" />}
      {children}
    </button>
  );
};

/**
 * Barra do Fluxo de Produção: as 6 etapas do documentário em ordem,
 * com status ao vivo e todas as ações no lugar certo.
 */
export const WorkflowBar: React.FC<WorkflowBarProps> = (p) => {
  const allImagesDone = p.totalFrames > 0 && p.completedFrames >= p.totalFrames;

  const step1: StepState = p.hasScript ? 'done' : 'ready';
  const step2: StepState = p.isAnalyzing ? 'busy' : p.hasPrompts ? 'done' : p.hasScript ? 'ready' : 'locked';
  const step3: StepState = p.queueInProgress ? 'busy' : allImagesDone ? 'done' : p.hasPrompts ? 'ready' : 'locked';
  const step4: StepState = p.qcRunning || p.cardsBusy || p.brollBusy ? 'busy' : p.completedFrames > 0 ? 'ready' : 'locked';
  const step5: StepState = p.videoBusy ? 'busy' : p.hasVideoPrompts ? 'done' : p.hasPrompts ? 'ready' : 'locked';
  const step6: StepState = p.completedFrames > 0 ? 'ready' : 'locked';

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
        🎬 Fluxo de Produção do Documentário
      </p>
      <div className="flex flex-col lg:flex-row gap-2.5">
        <StepCard num={1} state={step1} title="Roteiro & Estilo" subtitle={p.hasScript ? `${p.totalBlocks} blocos carregados` : 'Carregue o SRT acima'} />

        <StepCard num={2} state={step2} title="Prompts Visuais" subtitle={p.hasPrompts ? 'Entidades + prompts prontos' : 'Análise com Gemini 3.1 Pro'}>
          <ActionBtn onClick={p.onGeneratePrompts} disabled={!p.hasScript} busy={p.isAnalyzing} color="amber">
            ✨ {p.hasPrompts ? 'Regerar' : 'Gerar'} Prompts
          </ActionBtn>
        </StepCard>

        <StepCard
          num={3}
          state={step3}
          title="Gerar Imagens"
          subtitle={p.totalFrames > 0 ? `${p.completedFrames}/${p.totalFrames} concluídas` : 'Fila de geração em massa'}
        >
          <ActionBtn onClick={p.onStartQueue} disabled={!p.hasPrompts || p.queueInProgress} busy={p.queueInProgress} color="amber">
            ▶ {p.queueInProgress ? 'Gerando...' : 'Iniciar Fila'}
          </ActionBtn>
        </StepCard>

        <StepCard num={4} state={step4} title="Refinar (opcional)" subtitle="Qualidade, cartelas e cutaways">
          <ActionBtn onClick={p.onAutoQC} disabled={p.completedFrames === 0} busy={p.qcRunning} color="emerald" title="Inspeção visual automática com correção de defeitos">
            🔍 {p.qcRunning ? `QC ${p.qcDone}/${p.qcTotal}` : 'Auto-QC'}
          </ActionBtn>
          <ActionBtn onClick={p.onTitleCards} disabled={!p.hasPrompts} busy={p.cardsBusy} color="amber" title="Title cards profissionais nos momentos certos">
            📋 Cartelas
          </ActionBtn>
          <ActionBtn onClick={p.onBroll} disabled={!p.hasPrompts} busy={p.brollBusy} color="teal" title="Cutaways de detalhe (máx. 1 por cena)">
            🎞 B-Roll
          </ActionBtn>
        </StepCard>

        <StepCard num={5} state={step5} title="Prompts de Vídeo" subtitle={p.hasVideoPrompts ? 'Prontos para image-to-video' : 'Movimento por frame (SRT timing)'}>
          <ActionBtn onClick={p.onVideoPrompts} disabled={!p.hasPrompts} busy={p.videoBusy} color="violet">
            🎬 {p.hasVideoPrompts ? 'Regerar' : 'Gerar'}
          </ActionBtn>
        </StepCard>

        <StepCard num={6} state={step6} title="Revisar & Exportar" subtitle="Animatic e pacote final">
          <ActionBtn onClick={p.onPreview} disabled={p.completedFrames === 0} color="slate" title="Assistir os frames com a duração real do SRT">
            ▶ Preview
          </ActionBtn>
          <ActionBtn onClick={p.onExport} disabled={p.completedFrames === 0} color="amber" title="ZIP com imagens, prompts, cartelas e timeline">
            ⬇ Exportar
          </ActionBtn>
        </StepCard>
      </div>
    </div>
  );
};
