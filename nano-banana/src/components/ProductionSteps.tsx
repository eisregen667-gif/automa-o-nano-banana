import React from 'react';
import { Check, Loader2 } from 'lucide-react';

type StepState = 'done' | 'ready' | 'locked' | 'busy';

interface ProductionStepsProps {
  hasScript: boolean;
  hasPrompts: boolean;
  hasEntities: boolean;
  isAnalyzing: boolean;
  onGeneratePrompts: () => void;
  onOpenEntities: () => void;
  onOpenMatrix: () => void;
  totalFrames: number;
  completedFrames: number;
  queueInProgress: boolean;
  onStartQueue: () => void;
  qcRunning: boolean;
  qcPaused: boolean;
  qcDone: number;
  qcTotal: number;
  onAutoQC: () => void;
  onPauseQC: () => void;
  onResumeQC: () => void;
  onStopQC: () => void;
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
  busy: 'bg-amber-400 text-slate-950',
  ready: 'bg-amber-400 text-slate-950',
  locked: 'bg-slate-800 text-slate-500 border border-slate-700'
};

const Btn: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, disabled, busy, variant = 'secondary', title, children }) => {
  const styles: Record<string, string> = {
    primary: 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md shadow-amber-400/20',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    ghost: 'bg-transparent hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800',
    danger: 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800'
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
        disabled && !busy
          ? 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
          : `${styles[variant]} cursor-pointer`
      } ${busy ? 'opacity-70 cursor-wait' : ''}`}
    >
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
};

const StepRow: React.FC<{
  num: number;
  state: StepState;
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ num, state, title, description, children }) => (
  <div
    className={`rounded-2xl border p-5 transition-all ${
      state === 'locked'
        ? 'bg-slate-950/30 border-slate-800/50 opacity-55'
        : state === 'busy'
        ? 'bg-slate-900 border-amber-400/40 ring-1 ring-amber-400/20'
        : state === 'done'
        ? 'bg-slate-900/70 border-emerald-500/25'
        : 'bg-slate-900/70 border-slate-800'
    }`}
  >
    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-3.5 flex-1 min-w-0">
        <span className={`w-9 h-9 rounded-xl text-sm font-black flex items-center justify-center shrink-0 ${NUM_STYLES[state]}`}>
          {state === 'done' ? <Check className="w-4.5 h-4.5" /> : state === 'busy' ? <Loader2 className="w-4 h-4 animate-spin" /> : num}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs text-slate-400 leading-snug">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">{children}</div>
    </div>
  </div>
);

export const ProductionSteps: React.FC<ProductionStepsProps> = (p) => {
  const allImagesDone = p.totalFrames > 0 && p.completedFrames >= p.totalFrames;

  const s1: StepState = p.isAnalyzing ? 'busy' : p.hasPrompts ? 'done' : p.hasScript ? 'ready' : 'locked';
  const s2: StepState = p.queueInProgress ? 'busy' : allImagesDone ? 'done' : p.hasPrompts ? 'ready' : 'locked';
  const s3: StepState = p.qcRunning || p.cardsBusy || p.brollBusy ? 'busy' : p.completedFrames > 0 ? 'ready' : 'locked';
  const s4: StepState = p.videoBusy ? 'busy' : p.hasVideoPrompts ? 'done' : p.hasPrompts ? 'ready' : 'locked';
  const s5: StepState = p.completedFrames > 0 ? 'ready' : 'locked';

  return (
    <div className="space-y-3">
      <StepRow
        num={1}
        state={s1}
        title="Prompts Visuais"
        description={
          p.hasPrompts
            ? 'Entidades canônicas e prompts prontos. Revise ou regenere quando quiser.'
            : p.hasScript
            ? 'O Gemini 3.1 Pro lê o roteiro, pesquisa fatos reais e cria um prompt por bloco.'
            : 'Carregue um roteiro SRT na aba Roteiro para começar.'
        }
      >
        {p.hasEntities && (
          <Btn onClick={p.onOpenEntities} variant="ghost" title="Revisar as entidades canônicas detectadas">
            👥 Entidades
          </Btn>
        )}
        {p.hasPrompts && (
          <Btn onClick={p.onOpenMatrix} variant="ghost" title="Ver e editar todos os prompts gerados">
            📝 Matriz
          </Btn>
        )}
        <Btn onClick={p.onGeneratePrompts} disabled={!p.hasScript} busy={p.isAnalyzing} variant="primary">
          ✨ {p.hasPrompts ? 'Regerar Prompts' : 'Gerar Prompts'}
        </Btn>
      </StepRow>

      <StepRow
        num={2}
        state={s2}
        title="Geração de Imagens"
        description={
          p.totalFrames > 0
            ? `${p.completedFrames} de ${p.totalFrames} imagens concluídas. A fila abre na Galeria para você acompanhar.`
            : 'Renderiza todas as cenas em massa com controle de lote e retentativas.'
        }
      >
        <Btn onClick={p.onStartQueue} disabled={!p.hasPrompts || p.queueInProgress} busy={p.queueInProgress} variant="primary">
          ▶ {p.queueInProgress ? 'Gerando...' : allImagesDone ? 'Regerar Pendentes' : 'Iniciar Fila'}
        </Btn>
      </StepRow>

      <StepRow
        num={3}
        state={s3}
        title="Refinamento (opcional)"
        description="Inspeção visual automática com correções, cartelas profissionais e cutaways de B-roll."
      >
        {p.qcRunning ? (
          <>
            <span className="text-xs font-bold text-emerald-300 px-2">
              🔍 {p.qcPaused ? 'Pausado' : 'Inspecionando'} {p.qcDone}/{p.qcTotal}
            </span>
            <Btn onClick={p.qcPaused ? p.onResumeQC : p.onPauseQC} variant="secondary">
              {p.qcPaused ? '▶ Retomar' : '⏸ Pausar'}
            </Btn>
            <Btn onClick={p.onStopQC} variant="danger">⏹ Parar</Btn>
          </>
        ) : (
          <Btn onClick={p.onAutoQC} disabled={p.completedFrames === 0} variant="secondary" title="Inspeciona cada imagem com visão do Gemini e corrige defeitos automaticamente">
            🔍 Auto-QC
          </Btn>
        )}
        <Btn onClick={p.onTitleCards} disabled={!p.hasPrompts} busy={p.cardsBusy} variant="secondary" title="Title cards nos momentos editorialmente certos">
          📋 Cartelas
        </Btn>
        <Btn onClick={p.onBroll} disabled={!p.hasPrompts} busy={p.brollBusy} variant="secondary" title="Cutaways de detalhe (máx. 1 por cena)">
          🎞 B-Roll
        </Btn>
      </StepRow>

      <StepRow
        num={4}
        state={s4}
        title="Prompts de Vídeo"
        description={
          p.hasVideoPrompts
            ? 'Prompts de movimento prontos, numerados na ordem das imagens para o image-to-video.'
            : 'Converte cada frame em prompt de movimento, calibrado pela duração real do bloco SRT.'
        }
      >
        <Btn onClick={p.onVideoPrompts} disabled={!p.hasPrompts} busy={p.videoBusy} variant="primary">
          🎬 {p.hasVideoPrompts ? 'Regerar' : 'Gerar Prompts de Vídeo'}
        </Btn>
      </StepRow>

      <StepRow
        num={5}
        state={s5}
        title="Revisar & Exportar"
        description="Assista o animatic com o timing real do SRT e baixe o pacote completo de produção."
      >
        <Btn onClick={p.onPreview} disabled={p.completedFrames === 0} variant="secondary">
          ▶ Preview Animatic
        </Btn>
        <Btn onClick={p.onExport} disabled={p.completedFrames === 0} variant="primary">
          ⬇ Exportar Pacote
        </Btn>
      </StepRow>
    </div>
  );
};
