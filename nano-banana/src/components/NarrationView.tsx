import React, { useEffect, useRef, useState } from 'react';
import { SrtBlock } from '../types';
import { getDbItem, setDbItem, removeDbItem } from '../utils/db';
import { downloadBlob } from '../utils/imageExporter';
import { logInfo, logSuccess, logWarn, logError } from '../utils/logger';
import {
  TTS_VOICES,
  TtsModel,
  generateTtsChunk,
  pcmB64ToWavBlob,
  pcmB64ToRawBlob,
  mergePcmBlobsToWav,
  sanitizeScriptForTts,
  lintScriptForTts,
  buildTtsChunks,
  TtsLintIssue
} from '../services/geminiTts';
import { directNarration, refineScriptForTts } from '../services/geminiClient';
import { EntityRegistry } from '../types';
import { Mic, Square, Download, RefreshCw, Wand2, FileText, Loader2, Clapperboard } from 'lucide-react';

interface NarrationViewProps {
  apiKey?: string;
  srtBlocks: SrtBlock[];
  entityRegistry?: EntityRegistry | null;
}

interface TtsChunk {
  text: string;
  status: 'idle' | 'generating' | 'done' | 'error';
  error?: string;
  direction?: string;      // modulação emocional do trecho (Diretor de Narração)
  pauseBeforeMs?: number;  // silêncio real inserido antes do trecho no WAV final
}

interface TtsProjectMeta {
  script: string;
  voice: string;
  model: TtsModel;
  style: string;
  chunkSize: number;
  intervalSec: number;
  chunks: TtsChunk[];
}

export const NarrationView: React.FC<NarrationViewProps> = ({ apiKey, srtBlocks, entityRegistry }) => {
  const [script, setScript] = useState('');
  const [voice, setVoice] = useState('Charon');
  const [model, setModel] = useState<TtsModel>('gemini-2.5-flash-preview-tts');
  const [style, setStyle] = useState('Narre em tom de documentário: voz grave, ritmo calmo e pausado, autoridade serena, português brasileiro.');
  const [chunkSize, setChunkSize] = useState(4000);
  const [intervalSec, setIntervalSec] = useState(4);
  const [chunks, setChunks] = useState<TtsChunk[]>([]);
  const [audioUrls, setAudioUrls] = useState<Record<number, string>>({});
  const [lint, setLint] = useState<TtsLintIssue[]>([]);
  const [running, setRunning] = useState(false);
  const [directing, setDirecting] = useState(false);
  const [doctoring, setDoctoring] = useState(false);
  const stopRef = useRef(false);
  const chunksRef = useRef(chunks);
  chunksRef.current = chunks;

  // Restaura projeto de narração salvo
  useEffect(() => {
    (async () => {
      const meta = await getDbItem<TtsProjectMeta>('ttsProject');
      if (!meta) return;
      setScript(meta.script || '');
      setVoice(meta.voice || 'Charon');
      setModel(meta.model || 'gemini-2.5-flash-preview-tts');
      setStyle(meta.style ?? '');
      setChunkSize(meta.chunkSize || 4000);
      setIntervalSec(meta.intervalSec ?? 4);
      const restored = (meta.chunks || []).map((c) => (c.status === 'generating' ? { ...c, status: 'idle' as const } : c));
      setChunks(restored);

      const urls: Record<number, string> = {};
      for (let i = 0; i < restored.length; i++) {
        if (restored[i].status === 'done') {
          const pcm = await getDbItem<Blob>(`tts:${i}`);
          if (pcm instanceof Blob) {
            const buf = new Uint8Array(await pcm.arrayBuffer());
            let bin = '';
            for (let j = 0; j < buf.length; j++) bin += String.fromCharCode(buf[j]);
            urls[i] = URL.createObjectURL(pcmB64ToWavBlob(btoa(bin)));
          } else {
            restored[i].status = 'idle';
          }
        }
      }
      setAudioUrls(urls);
      if (restored.length > 0) logInfo(`Narração restaurada: ${restored.length} chunks, ${Object.keys(urls).length} com áudio.`);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistMeta = (next?: Partial<TtsProjectMeta>) => {
    const meta: TtsProjectMeta = {
      script, voice, model, style, chunkSize, intervalSec,
      chunks: chunksRef.current,
      ...next
    };
    setDbItem('ttsProject', meta).catch(() => {});
  };

  const handleImportSrt = () => {
    const text = srtBlocks.map((b) => b.text).join('\n\n');
    setScript(text);
    setLint(lintScriptForTts(text));
    persistMeta({ script: text });
    logInfo(`Narração: roteiro importado do SRT (${srtBlocks.length} blocos, ${text.length} caracteres).`);
  };

  const handleSanitize = () => {
    const clean = sanitizeScriptForTts(script);
    setScript(clean);
    const issues = lintScriptForTts(clean);
    setLint(issues);
    persistMeta({ script: clean });
    logInfo('Narração: roteiro saneado para TTS (marcações removidas).');
    if (issues.some((i) => i.severity === 'grave')) {
      logWarn('Ainda há problemas de escrita (frases longas/números). Use "Corrigir escrita com IA" para resolver.');
    }
  };

  // Script Doctor: reescreve frases longas e números por extenso preservando os fatos
  const handleDoctor = async () => {
    if (!script.trim() || doctoring) return;
    setDoctoring(true);
    try {
      const report = lint.map((i) => `- [${i.severity}] ${i.message}`).join('\n');
      const fixed = await refineScriptForTts(sanitizeScriptForTts(script), report, apiKey);
      if (fixed) {
        setScript(fixed);
        setLint(lintScriptForTts(fixed));
        persistMeta({ script: fixed });
      }
    } finally {
      setDoctoring(false);
    }
  };

  const handleBuildChunks = () => {
    const built = buildTtsChunks(script, chunkSize).map((text) => ({ text, status: 'idle' as const }));
    setChunks(built);
    chunksRef.current = built;
    setAudioUrls((prev) => {
      Object.values(prev).forEach((u) => URL.revokeObjectURL(String(u)));
      return {};
    });
    built.forEach((_, i) => removeDbItem(`tts:${i}`).catch(() => {}));
    setLint(lintScriptForTts(script));
    persistMeta({ chunks: built });
    logInfo(`Narração: roteiro dividido em ${built.length} chunk(s) de até ${chunkSize} caracteres.`);
  };

  // Diretor de Narração: segmentos por emoção + direção + pausas reais (revisáveis)
  const handleDirect = async () => {
    if (!script.trim() || directing) return;
    setDirecting(true);
    try {
      const plan = await directNarration(script, entityRegistry || null, style, chunkSize, apiKey);
      if (plan) {
        const built: TtsChunk[] = plan.map((p) => ({
          text: p.performanceText,
          direction: p.direction,
          pauseBeforeMs: p.pauseBeforeMs,
          status: 'idle' as const
        }));
        setChunks(built);
        chunksRef.current = built;
        setAudioUrls((prev) => {
          Object.values(prev).forEach((u) => URL.revokeObjectURL(String(u)));
          return {};
        });
        built.forEach((_, i) => removeDbItem(`tts:${i}`).catch(() => {}));
        setLint(lintScriptForTts(script));
        persistMeta({ chunks: built });
      }
    } finally {
      setDirecting(false);
    }
  };

  const updateChunk = (index: number, patch: Partial<TtsChunk>) => {
    setChunks((prev) => {
      const next = prev.map((c, i) => (i === index ? { ...c, ...patch } : c));
      chunksRef.current = next;
      return next;
    });
    persistMeta();
  };

  const generateOne = async (index: number): Promise<boolean> => {
    const chunk = chunksRef.current[index];
    if (!chunk || !apiKey?.trim()) return false;

    const update = (patch: Partial<TtsChunk>) => {
      setChunks((prev) => {
        const next = prev.map((c, i) => (i === index ? { ...c, ...patch } : c));
        chunksRef.current = next;
        return next;
      });
    };

    update({ status: 'generating', error: undefined });
    try {
      const fullDirection = chunk.direction
        ? `${style}\n\nDireção deste trecho: ${chunk.direction}`
        : style;
      const pcmB64 = await generateTtsChunk(chunk.text, voice, model, apiKey.trim(), fullDirection);
      await setDbItem(`tts:${index}`, pcmB64ToRawBlob(pcmB64));
      const url = URL.createObjectURL(pcmB64ToWavBlob(pcmB64));
      setAudioUrls((prev) => {
        if (prev[index]) URL.revokeObjectURL(prev[index]);
        return { ...prev, [index]: url };
      });
      update({ status: 'done' });
      logSuccess(`Narração: chunk ${index + 1}/${chunksRef.current.length} gerado (voz ${voice}).`);
      persistMeta();
      return true;
    } catch (err: any) {
      update({ status: 'error', error: err?.message || 'Falha no TTS' });
      logError(`Narração: chunk ${index + 1} falhou — ${err?.message || err}`);
      persistMeta();
      return false;
    }
  };

  const handleGenerateAll = async () => {
    if (!apiKey?.trim()) {
      logWarn('Narração requer a chave API do Gemini (Configurações).');
      return;
    }
    if (chunksRef.current.length === 0) {
      logWarn('Divida o roteiro em chunks antes de gerar.');
      return;
    }
    setRunning(true);
    stopRef.current = false;
    logInfo(`Narração iniciada: ${chunksRef.current.length} chunks, voz ${voice}, modelo ${model.includes('pro') ? 'Pro' : 'Flash'} TTS.`);

    for (let i = 0; i < chunksRef.current.length; i++) {
      if (stopRef.current) {
        logWarn('Narração interrompida pelo usuário.');
        break;
      }
      if (chunksRef.current[i].status === 'done') continue;
      await generateOne(i);
      if (i < chunksRef.current.length - 1 && !stopRef.current) {
        await new Promise((r) => setTimeout(r, intervalSec * 1000));
      }
    }

    const done = chunksRef.current.filter((c) => c.status === 'done').length;
    logSuccess(`Narração finalizada: ${done}/${chunksRef.current.length} chunks prontos.`);
    setRunning(false);
  };

  const handleMergeDownload = async () => {
    const doneCount = chunksRef.current.filter((c) => c.status === 'done').length;
    if (doneCount === 0) return;
    logInfo('Narração: montando o WAV completo...');
    const items: { pcm: Blob; pauseBeforeMs?: number }[] = [];
    for (let i = 0; i < chunksRef.current.length; i++) {
      if (chunksRef.current[i].status !== 'done') continue;
      const pcm = await getDbItem<Blob>(`tts:${i}`);
      if (pcm instanceof Blob) items.push({ pcm, pauseBeforeMs: chunksRef.current[i].pauseBeforeMs });
    }
    const wav = await mergePcmBlobsToWav(items);
    downloadBlob(wav, 'NARRACAO.wav');
    logSuccess(`Narração completa baixada (${(wav.size / 1048576).toFixed(1)} MB).`);
  };

  const doneCount = chunks.filter((c) => c.status === 'done').length;

  return (
    <div className="space-y-5">
      {/* Roteiro */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" /> 1. Texto da Narração
            <span className="text-[10px] text-slate-500 font-normal">{script.length} caracteres</span>
          </label>
          <div className="flex items-center gap-2">
            <button onClick={handleImportSrt} disabled={srtBlocks.length === 0}
              className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold transition-colors disabled:opacity-40">
              ⇪ Importar do Roteiro (SRT)
            </button>
            <button onClick={handleSanitize} disabled={!script}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors disabled:opacity-40">
              <Wand2 className="w-3.5 h-3.5 inline mr-1" />Sanear para TTS
            </button>
          </div>
        </div>
        <textarea
          value={script}
          onChange={(e) => { setScript(e.target.value); setLint(lintScriptForTts(e.target.value)); persistMeta({ script: e.target.value }); }}
          rows={8}
          placeholder="Cole o texto da narração ou importe do SRT..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 leading-relaxed"
        />
        {lint.length > 0 && (
          <div className="space-y-1">
            {lint.map((issue, i) => (
              <p key={i} className={`text-[11px] px-3 py-1.5 rounded-lg border ${
                issue.severity === 'grave'
                  ? 'text-rose-300 bg-rose-950/40 border-rose-800/60'
                  : 'text-amber-300 bg-amber-950/30 border-amber-800/50'
              }`}>
                {issue.severity === 'grave' ? '⚠' : 'ℹ'} {issue.message}
              </p>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={handleDoctor} disabled={doctoring || running || !apiKey?.trim()}
                className="px-3.5 py-2 rounded-lg bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 border border-violet-500/40 text-xs font-bold transition-colors disabled:opacity-40 flex items-center gap-1.5"
                title="O Gemini reescreve o roteiro para o TTS: quebra frases longas, escreve números por extenso e dissolve parênteses — sem mudar nenhum fato. O resultado aparece aqui para você revisar.">
                {doctoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                {doctoring ? 'Reescrevendo...' : 'Corrigir escrita com IA'}
              </button>
              <span className="text-[10px] text-slate-500">
                {apiKey?.trim()
                  ? 'Quebra frases longas e escreve números por extenso, preservando todos os fatos.'
                  : 'Configure a chave API para habilitar a correção com IA.'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Configurações de voz */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
        <p className="text-xs font-bold text-slate-200">🎛 2. Voz &amp; Sessão de Estúdio</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">Modelo TTS</label>
            <select value={model} onChange={(e) => { setModel(e.target.value as TtsModel); persistMeta({ model: e.target.value as TtsModel }); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none">
              <option value="gemini-2.5-flash-preview-tts">Flash TTS — rápido</option>
              <option value="gemini-2.5-pro-preview-tts">Pro TTS — máxima qualidade</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">Chunk máximo</label>
            <select value={chunkSize} onChange={(e) => { setChunkSize(Number(e.target.value)); persistMeta({ chunkSize: Number(e.target.value) }); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none">
              {[2000, 3000, 4000, 6000, 8000].map((n) => <option key={n} value={n}>{n.toLocaleString('pt-BR')} caracteres</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-300 block mb-1.5">Intervalo entre chunks</label>
            <select value={intervalSec} onChange={(e) => { setIntervalSec(Number(e.target.value)); persistMeta({ intervalSec: Number(e.target.value) }); }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none">
              {[2, 4, 6, 10].map((n) => <option key={n} value={n}>{n}s</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-300 block mb-1.5">Identidade do narrador (fixa — vale para toda a narração; a emoção por trecho vem do Diretor)</label>
          <input value={style} onChange={(e) => { setStyle(e.target.value); persistMeta({ style: e.target.value }); }}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none" />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-300 block mb-2">Voz ({voice})</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 max-h-44 overflow-y-auto pr-1">
            {TTS_VOICES.map((v) => (
              <button key={v.name} onClick={() => { setVoice(v.name); persistMeta({ voice: v.name }); }}
                className={`text-left px-2.5 py-1.5 rounded-lg border transition-all ${
                  voice === v.name ? 'bg-amber-400/10 border-amber-400/50 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                }`}>
                <span className="text-[11px] font-bold block">{v.name}</span>
                <span className="text-[10px] text-slate-500">{v.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-800">
          <button onClick={handleDirect} disabled={!script || running || directing}
            className="px-4 py-2 rounded-xl bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 border border-violet-500/40 text-xs font-bold transition-colors disabled:opacity-40 flex items-center gap-1.5"
            title="O Gemini divide o roteiro por emoção, escreve a direção de cada trecho, marca a pontuação de performance e planeja as pausas reais — tudo revisável antes de gravar">
            {directing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Clapperboard className="w-3.5 h-3.5" />}
            {directing ? 'Dirigindo sessão...' : 'Dirigir Narração (recomendado)'}
          </button>
          <button onClick={handleBuildChunks} disabled={!script || running}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition-colors disabled:opacity-40"
            title="Divisão simples por tamanho, sem direção emocional">
            ✂ Divisão simples
          </button>
          {!running ? (
            <button onClick={handleGenerateAll} disabled={chunks.length === 0}
              className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-colors disabled:opacity-40 flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Gerar Narração ({chunks.length} chunks)
            </button>
          ) : (
            <button onClick={() => { stopRef.current = true; }}
              className="px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800 text-xs font-bold transition-colors flex items-center gap-1.5">
              <Square className="w-3.5 h-3.5 fill-current" /> Parar
            </button>
          )}
          {doneCount > 0 && (
            <button onClick={handleMergeDownload}
              className="px-4 py-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-colors flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> Baixar NARRACAO.wav ({doneCount}/{chunks.length})
            </button>
          )}
        </div>
      </div>

      {/* Banner de revisão da sessão dirigida */}
      {chunks.length > 0 && chunks.some((c) => c.direction !== undefined) && doneCount === 0 && !running && (
        <div className="bg-violet-950/30 border border-violet-500/30 rounded-xl px-4 py-3 text-xs text-violet-200">
          🎬 <strong>Sessão dirigida — revise antes de gravar:</strong> ajuste a direção emocional, as pausas (ms) e o texto de
          performance de cada trecho abaixo. Quando estiver satisfeito, clique em <strong>Gerar Narração</strong>.
        </div>
      )}

      {/* Chunks */}
      {chunks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-200 pt-1">🎚 3. Trechos da Gravação ({chunks.length})</p>
          {chunks.map((chunk, i) => (
            <div key={i} className={`bg-slate-900/80 border rounded-xl p-3.5 space-y-2 ${
              chunk.status === 'done' ? 'border-emerald-800/60' : chunk.status === 'error' ? 'border-rose-800/60' : chunk.status === 'generating' ? 'border-amber-400/50' : 'border-slate-800'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Chunk {i + 1}</span>
                  <span className="text-[10px] text-slate-500">{chunk.text.length} caracteres</span>
                  {chunk.status === 'generating' && <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />}
                  {chunk.status === 'done' && <span className="text-[10px] font-bold text-emerald-400">✓ pronto</span>}
                  {chunk.status === 'error' && <span className="text-[10px] font-bold text-rose-400">falhou</span>}
                </div>
                <button onClick={() => generateOne(i)} disabled={running || chunk.status === 'generating' || !apiKey?.trim()}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-40" title="Regenerar este chunk">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {chunk.direction !== undefined && (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                  <input
                    value={chunk.direction}
                    onChange={(e) => updateChunk(i, { direction: e.target.value })}
                    placeholder="Direção emocional deste trecho"
                    className="w-full bg-slate-950 border border-violet-500/30 focus:border-violet-400 rounded-lg px-2.5 py-1.5 text-[11px] text-violet-200 focus:outline-none"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={3000}
                      step={100}
                      value={chunk.pauseBeforeMs ?? 0}
                      onChange={(e) => updateChunk(i, { pauseBeforeMs: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:outline-none"
                      title="Silêncio real antes deste trecho (ms)"
                    />
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">ms antes</span>
                  </div>
                </div>
              )}
              <textarea
                value={chunk.text}
                onChange={(e) => updateChunk(i, { text: e.target.value })}
                rows={3}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-400/50 rounded-lg p-2 text-[11px] text-slate-300 leading-relaxed focus:outline-none resize-y"
              />
              {chunk.error && <p className="text-[11px] text-rose-400 bg-rose-950/40 border border-rose-800/60 rounded-lg px-2.5 py-1.5">{chunk.error}</p>}
              {audioUrls[i] && <audio controls src={audioUrls[i]} className="w-full h-8" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
