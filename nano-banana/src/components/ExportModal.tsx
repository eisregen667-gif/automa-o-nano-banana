import React, { useState } from 'react';
import JSZip from 'jszip';
import { EntityRegistry, GeneratedFrame, GeneratorConfig, SrtBlock } from '../types';
import { calculateDurationSeconds, generateFilename, stringifySrt } from '../utils/srtParser';
import { urlToPngBlob } from '../utils/imageExporter';
import { logInfo, logSuccess, logError } from '../utils/logger';
import { Download, FileText, FileCode, Archive, X, CheckCircle2, Sparkles, Users, Table } from 'lucide-react';

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

  // Function to create and trigger ZIP download
  const handleDownloadZip = async () => {
    try {
      setIsZipping(true);
      setZipProgress(0);
      logInfo(`Exportação iniciada: compactando ${sortedCompletedFrames.length} imagens em ZIP...`);

      const zip = new JSZip();
      const imgFolder = zip.folder('nano_banana_images');
      const refFolder = zip.folder('references');

      // Add each image to zip as a TRUE PNG Blob
      for (let i = 0; i < sortedCompletedFrames.length; i++) {
        const frame = sortedCompletedFrames[i];
        const filename = generateFilename(frame.id, frame.timeStart, frame.timeEnd, config.filenameTemplate);

        if (frame.imageUrl) {
          try {
            const pngBlob = await urlToPngBlob(frame.imageUrl);
            imgFolder?.file(filename, pngBlob);
          } catch (err) {
            console.warn(`Failed to convert frame ${frame.id} to PNG blob, using raw fetch fallback:`, err);
            const res = await fetch(frame.imageUrl);
            const blob = await res.blob();
            imgFolder?.file(filename, blob);
          }
        }

        setZipProgress(Math.round(((i + 1) / (sortedCompletedFrames.length || 1)) * 60));
      }

      // Add Reference Sheets to /references/REF_{id}.png
      if (entityReferenceSheets) {
        const entityIds = Object.keys(entityReferenceSheets);
        for (const entityId of entityIds) {
          const imageUrl = entityReferenceSheets[entityId];
          if (imageUrl) {
            try {
              const pngBlob = await urlToPngBlob(imageUrl);
              refFolder?.file(`REF_${entityId}.png`, pngBlob);
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
      const csvRows = sortedCompletedFrames.map((f) => {
        const filename = generateFilename(f.id, f.timeStart, f.timeEnd, config.filenameTemplate);
        const duration = calculateDurationSeconds(f.timeStart, f.timeEnd);
        return `"${filename}","${f.timeStart}","${f.timeEnd}",${duration}`;
      });
      const timelineCsvContent = csvHeader + csvRows.join('\n');
      zip.file('TIMELINE.csv', timelineCsvContent);

      // Add PROMPTS.txt (01_SKILL_PRINCIPAL format)
      if (frames.length > 0) {
        const promptsTxtContent = frames.map((f) => `${f.id} ${f.visualPrompt}`).join('\n\n');
        zip.file('PROMPTS.txt', promptsTxtContent);
      }

      // Add manifest.json (with entity_registry_version)
      const manifest = {
        exportedAt: new Date().toISOString(),
        entity_registry_version: '1.0',
        totalFrames: sortedCompletedFrames.length,
        detected_niche: entityRegistry?.detected_niche || 'General',
        frames: sortedCompletedFrames.map((f) => ({
          id: f.id,
          filename: generateFilename(f.id, f.timeStart, f.timeEnd, config.filenameTemplate),
          timeStart: f.timeStart,
          timeEnd: f.timeEnd,
          durationSeconds: calculateDurationSeconds(f.timeStart, f.timeEnd),
          subtitleText: f.subtitleText,
          visualPrompt: f.visualPrompt,
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
                    Inclui <strong className="text-amber-400">{sortedCompletedFrames.length} imagens PNG</strong> nomeadas por tempo + SRT + PROMPTS.txt
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
                <Download className="w-4 h-4" /> Baixar Pacote ZIP ({sortedCompletedFrames.length} Imagens)
              </button>
            )}
          </div>

          {/* Option 2, 3 & 4: Individual File Downloads */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
