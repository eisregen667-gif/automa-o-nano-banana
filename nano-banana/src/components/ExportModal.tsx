import React, { useState } from 'react';
import JSZip from 'jszip';
import { EntityRegistry, GeneratedFrame, GeneratorConfig, SrtBlock } from '../types';
import { calculateDurationSeconds, generateFilename, stringifySrt } from '../utils/srtParser';
import { urlToPngBlob, urlToOptimizedBlob } from '../utils/imageExporter';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { Download, FileText, FileCode, Archive, X, CheckCircle2, Sparkles, Users, Table, Clapperboard } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  frames: GeneratedFrame[];
  srtBlocks: SrtBlock[];
  config: GeneratorConfig;
  entityRegistry?: EntityRegistry | null;
  entityReferenceSheets?: Record<string, string>;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  frames,
  srtBlocks,
  config,
  entityRegistry,
  entityReferenceSheets = {},
}) => {
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);

  if (!isOpen) return null;

  // Sort frames sequentially from first (id: 1) to last
  const sortedCompletedFrames = [...frames]
    .filter((f) => f.status === 'completed' && f.imageUrl)
    .sort((a, b) => a.id - b.id);

  // Cenas = 1:1 com os blocos do SRT (o que ferramentas de timeline exigem).
  // Cartelas e B-rolls não têm bloco SRT correspondente e vão para /extras.
  const sceneCompleted = sortedCompletedFrames.filter((f) => !f.isTitleCard && !f.isBroll);
  const extraCompleted = sortedCompletedFrames.filter((f) => f.isTitleCard || f.isBroll);

  const framesWithVideoPrompt = [...frames]
    .filter((f) => f.videoPrompt && !f.isTitleCard && !f.isBroll)
    .sort((a, b) => a.id - b.id);

  // Nome dos extras: aponta a posição de inserção manual (apos_023_CARTELA)
  const extraBaseName = (frame: GeneratedFrame, index: number): string => {
    const pad = Math.max(3, String(sceneCompleted.length).length);
    const anchorId = Math.floor(frame.id);
    const anchorIndex = sceneCompleted.findIndex((f) => f.id === anchorId);
    const seqLabel = anchorIndex >= 0 ? String(anchorIndex + 1).padStart(pad, '0') : '000';
    const type = frame.isTitleCard ? 'CARTELA' : 'BROLL';
    return `apos_${seqLabel}_${type}_${index + 1}`;
  };

  // VIDEO_PROMPTS.txt: ONE motion prompt per line, prefixed with the same
  // sequential number as the exported image (001, 002...) so the generated
  // videos are saved in matching order, separated by a blank line.
  const getVideoPromptsTxtContent = () => {
    const pad = Math.max(3, String(framesWithVideoPrompt.length).length);
    return framesWithVideoPrompt
      .map((f, i) => `${String(i + 1).padStart(pad, '0')} ${(f.videoPrompt || '').replace(/\s*\n\s*/g, ' ').trim()}`)
      .join('\n\n');
  };

  // Function to create and trigger ZIP download
  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      setZipProgress(0);
      logInfo(`Exportação iniciada: ${sceneCompleted.length} cenas (1:1 com o SRT) + ${extraCompleted.length} extras, otimizadas para no máximo 1MB cada...`);

      const zip = new JSZip();
      const imgFolder = zip.folder('nano_banana_images');
      const refFolder = zip.folder('references');

      // Add each SCENE image to zip in perfect sequential order (001, 002...),
      // 1:1 with the SRT blocks, compressed to at most 1MB each.
      // Each entry gets an incremental modification date (+1s per image) so
      // sorting by name OR by date both yield the correct sequence.
      const padLength = Math.max(3, String(sceneCompleted.length).length);
      const exportEntries: { frame: GeneratedFrame; filename: string }[] = [];
      const baseTime = Date.now() - (sceneCompleted.length + extraCompleted.length) * 1000;

      for (let i = 0; i < sceneCompleted.length; i++) {
        const frame = sceneCompleted[i];
        const seq = i + 1;
        const entryDate = new Date(baseTime + i * 1000);

        if (frame.imageUrl) {
          try {
            const { blob, ext } = await urlToOptimizedBlob(frame.imageUrl);
            const filename = generateFilename(seq, frame.timeStart, frame.timeEnd, config.filenameTemplate, ext, padLength);
            imgFolder?.file(filename, blob, { date: entryDate });
            exportEntries.push({ frame, filename });
          } catch (err) {
            console.warn(`Failed to optimize frame ${frame.id}, using raw fetch fallback:`, err);
            const res = await fetch(frame.imageUrl);
            const blob = await res.blob();
            const filename = generateFilename(seq, frame.timeStart, frame.timeEnd, config.filenameTemplate, 'png', padLength);
            imgFolder?.file(filename, blob, { date: entryDate });
            exportEntries.push({ frame, filename });
          }
        }

        setZipProgress(Math.round(((i + 1) / (sceneCompleted.length || 1)) * 55));
      }

      // Extras (cartelas e B-rolls) em pasta separada, nomeados pela posição de inserção
      if (extraCompleted.length > 0) {
        const extrasFolder = zip.folder('extras_cartelas_broll');
        for (let i = 0; i < extraCompleted.length; i++) {
          const frame = extraCompleted[i];
          const entryDate = new Date(baseTime + (sceneCompleted.length + i) * 1000);
          try {
            const { blob, ext } = await urlToOptimizedBlob(frame.imageUrl!);
            extrasFolder?.file(`${extraBaseName(frame, i)}.${ext}`, blob, { date: entryDate });
          } catch (err) {
            console.warn(`Failed to optimize extra frame ${frame.id}:`, err);
          }
        }
      }

      // Add Reference Sheets to /references/REF_{id}.png
      if (entityReferenceSheets) {
        const entityIds = Object.keys(entityReferenceSheets);
        for (const entityId of entityIds) {
          const imageUrl = entityReferenceSheets[entityId];
          if (imageUrl) {
            try {
              const { blob, ext } = await urlToOptimizedBlob(imageUrl);
              refFolder?.file(`REF_${entityId}.${ext}`, blob);
            } catch (refErr) {
              console.warn(`Failed to convert entity reference sheet ${entityId}:`, refErr);
            }
          }
        }
      }

      // Add ENTITIES.json
      if (entityRegistry) {
        zip.file('ENTITIES.json', JSON.stringify(entityRegistry, null, 2));
      } else {
        zip.file('ENTITIES.json', JSON.stringify({ detected_niche: 'General', entities: [] }, null, 2));
      }

      // Add TIMELINE.csv (arquivo,start,end,duracao_segundos)
      const csvHeader = 'arquivo,start,end,duracao_segundos\n';
      const csvRows = exportEntries.map(({ frame: f, filename }) => {
        const duration = calculateDurationSeconds(f.timeStart, f.timeEnd);
        return `"${filename}","${f.timeStart}","${f.timeEnd}",${duration}`;
      });
      const timelineCsvContent = csvHeader + csvRows.join('\n');
      zip.file('TIMELINE.csv', timelineCsvContent);

      // Add PROMPTS.txt (somente cenas, 1:1 com o SRT)
      const sceneFramesAll = frames.filter((f) => !f.isTitleCard && !f.isBroll);
      if (sceneFramesAll.length > 0) {
        const promptsTxtContent = sceneFramesAll.map((f) => `${f.id} ${f.visualPrompt}`).join('\n\n');
        zip.file('PROMPTS.txt', promptsTxtContent);
      }

      // Add VIDEO_PROMPTS.txt (somente cenas, ordem 1:1 com as imagens)
      if (framesWithVideoPrompt.length > 0) {
        zip.file('VIDEO_PROMPTS.txt', getVideoPromptsTxtContent());
      }

      // Add EXTRAS_CARTELAS_BROLL.txt (guia de inserção manual + prompts)
      const allExtras = frames.filter((f) => f.isTitleCard || f.isBroll).sort((a, b) => a.id - b.id);
      if (allExtras.length > 0) {
        const extrasTxt = allExtras
          .map((f, i) => {
            const name = extraBaseName(f, i);
            return `${name}\nInserir após a cena ${name.split('_')[1]} na timeline.\nPROMPT IMAGEM: ${f.visualPrompt}\nPROMPT VIDEO: ${f.videoPrompt || '-'}`;
          })
          .join('\n\n');
        zip.file('EXTRAS_CARTELAS_BROLL.txt', extrasTxt);
      }

      // Add manifest.json (with entity_registry_version)
      const manifest = {
        exportedAt: new Date().toISOString(),
        entity_registry_version: '1.0',
        totalFrames: sceneCompleted.length,
        totalExtras: extraCompleted.length,
        detected_niche: entityRegistry?.detected_niche || 'General',
        extras: extraCompleted.map((f, i) => ({
          filename: extraBaseName(f, i),
          type: f.isTitleCard ? 'cartela' : 'broll',
          label: f.subtitleText,
          visualPrompt: f.visualPrompt,
          videoPrompt: f.videoPrompt,
        })),
        frames: exportEntries.map(({ frame: f, filename }) => ({
          id: f.id,
          filename,
          timeStart: f.timeStart,
          timeEnd: f.timeEnd,
          durationSeconds: calculateDurationSeconds(f.timeStart, f.timeEnd),
          subtitleText: f.subtitleText,
          visualPrompt: f.visualPrompt,
          videoPrompt: f.videoPrompt,
        })),
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Add updated SRT
      if (srtBlocks.length > 0) {
        zip.file('subtitles_updated.srt', stringifySrt(srtBlocks));
      }

      setZipProgress(90);

      // Generate zip blob
      const content = await zip.generateAsync({ type: 'blob' });
      setZipProgress(100);

      // Download trigger
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nano_banana_export_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      logSuccess(`Pacote ZIP exportado com ${sortedCompletedFrames.length} imagens, SRT, PROMPTS.txt e manifesto.`);

    } catch (err: any) {
      console.error('Error generating zip:', err);
      logError(`Falha na exportação do ZIP: ${err?.message || err}`);
      alert('Ocorreu um erro ao gerar o arquivo ZIP de exportação.');
    } finally {
      setIsZipping(false);
    }
  };

  // Download PROMPTS.txt according to 01_SKILL_PRINCIPAL specification
  const handleDownloadPromptsTxt = () => {
    if (frames.length === 0) return;

    // Formats as "1 <prompt>\n\n2 <prompt>\n\n..."
    const content = frames.map((f) => `${f.id} ${f.visualPrompt}`).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'PROMPTS.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download VIDEO_PROMPTS.txt (image-to-video pairing)
  const handleDownloadVideoPromptsTxt = () => {
    if (framesWithVideoPrompt.length === 0) return;

    const blob = new Blob([getVideoPromptsTxtContent()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'VIDEO_PROMPTS.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download Manifest JSON
  const handleDownloadManifest = () => {
    const manifest = {
      project: 'Nano Banana AI Batch Engine',
      exportedAt: new Date().toISOString(),
      frames: frames.map((f) => ({
        id: f.id,
        filename: generateFilename(f.id, f.timeStart, f.timeEnd, config.filenameTemplate),
        timeStart: f.timeStart,
        timeEnd: f.timeEnd,
        subtitleText: f.subtitleText,
        visualPrompt: f.visualPrompt,
        hasImage: !!f.imageUrl,
      })),
    };

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nano_banana_manifest_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download Updated SRT
  const handleDownloadSrt = () => {
    const srtText = stringifySrt(srtBlocks);
    const blob = new Blob([srtText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subtitles_nano_banana_${Date.now()}.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Central de Exportação de Produção</h2>
              <p className="text-xs text-slate-400">Baixe o pacote completo com imagens organizadas e legendas</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Options */}
        <div className="p-6 space-y-4">
          {/* Option 1: ZIP Download (Main) */}
          <div className="bg-slate-950 border border-amber-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-400 text-slate-950">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Pacote Completo em ZIP</h3>
                  <p className="text-xs text-slate-400">
                    <strong className="text-amber-400">{sceneCompleted.length} cenas</strong> (1:1 com o SRT)
                    {extraCompleted.length > 0 && <> + <strong className="text-amber-400">{extraCompleted.length} extras</strong> em pasta separada</>}
                    {' '}+ SRT + prompts
                  </p>
                </div>
              </div>
            </div>

            {isZipping ? (
              <div className="space-y-1.5 pt-2">
                <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-400 h-full transition-all duration-200"
                    style={{ width: `${zipProgress}%` }}
                  />
                </div>
                <p className="text-[11px] text-amber-400 font-mono text-center">
                  Compactando arquivos... {zipProgress}%
                </p>
              </div>
            ) : (
              <button
                onClick={handleDownloadZip}
                disabled={sortedCompletedFrames.length === 0}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                  sortedCompletedFrames.length > 0
                    ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-amber-400/20 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Download className="w-4 h-4" /> Baixar Pacote ZIP ({sceneCompleted.length} cenas{extraCompleted.length > 0 ? ` + ${extraCompleted.length} extras` : ''})
              </button>
            )}
          </div>

          {/* Individual File Downloads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleDownloadPromptsTxt}
              disabled={frames.length === 0}
              className="bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 text-left flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <Sparkles className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">PROMPTS.txt</p>
                <p className="text-[10px] text-slate-400">Padrão Veo Flow Sincronizado</p>
              </div>
            </button>

            <button
              onClick={handleDownloadVideoPromptsTxt}
              disabled={framesWithVideoPrompt.length === 0}
              className={`bg-slate-950 border rounded-xl p-3 text-left flex items-center gap-2.5 transition-colors group ${
                framesWithVideoPrompt.length > 0
                  ? 'hover:bg-slate-800 border-violet-500/40 cursor-pointer'
                  : 'border-slate-800 opacity-50 cursor-not-allowed'
              }`}
              title={framesWithVideoPrompt.length === 0 ? 'Gere os Prompts de Vídeo na galeria primeiro' : 'Baixar prompts de movimento pareados com as imagens'}
            >
              <Clapperboard className="w-5 h-5 text-violet-400 group-hover:scale-110 transition-transform shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">VIDEO_PROMPTS.txt ({framesWithVideoPrompt.length})</p>
                <p className="text-[10px] text-slate-400">Image-to-Video: 1 prompt por linha, na ordem das imagens</p>
              </div>
            </button>

            <button
              onClick={handleDownloadManifest}
              className="bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 text-left flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <FileCode className="w-5 h-5 text-sky-400 group-hover:scale-110 transition-transform shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">Manifesto JSON</p>
                <p className="text-[10px] text-slate-400">Dados do lote e filenames</p>
              </div>
            </button>

            <button
              onClick={handleDownloadSrt}
              className="bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl p-3 text-left flex items-center gap-2.5 transition-colors cursor-pointer group"
            >
              <FileText className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">Legenda SRT</p>
                <p className="text-[10px] text-slate-400">Arquivo .srt sincronizado</p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
