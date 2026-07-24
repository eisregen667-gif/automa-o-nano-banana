import React, { useRef } from 'react';
import { StyleCard } from '../types';
import { Palette, Image as ImageIcon, Sparkles, Upload, X, SlidersHorizontal, Monitor, Smartphone, Square, Layout } from 'lucide-react';

interface StylecardSectionProps {
  stylecard: StyleCard;
  onChangeStylecard: (updated: StyleCard) => void;
}

const STYLE_PRESETS = [
  {
    id: 'cinematic_documentary',
    name: 'Documentário Cinematográfico',
    icon: '📽️',
    text: 'Cinematic documentary still, shot on ARRI Alexa 65 with 35mm prime lens, natural available light, volumetric atmosphere, shallow depth of field, true-to-life color grading with soft filmic contrast, subtle organic film grain, photorealistic skin and material textures, 8k detail'
  },
  {
    id: 'photorealistic_35mm',
    name: 'Fotografia 35mm Analógica',
    icon: '📸',
    text: 'Cinematic 35mm analog film photograph, shot on Kodak Portra 400, natural lighting, shallow depth of field with creamy bokeh, authentic film grain and gentle halation, muted organic color palette, hyperrealistic detail, 8k resolution'
  },
  {
    id: 'period_film',
    name: 'Drama de Época (Película)',
    icon: '🎞️',
    text: 'Prestige period-drama cinema still, vintage 35mm film stock look, candlelight and soft window daylight, Rembrandt lighting with rich chiaroscuro, desaturated earth-tone palette, fine film grain, painterly realism, historically accurate textures, 8k'
  },
  {
    id: 'epic_anamorphic',
    name: 'Épico Anamórfico',
    icon: '🏛️',
    text: 'Epic cinematic frame with anamorphic lens character, gentle horizontal flares and oval bokeh, Roger Deakins-inspired natural lighting, monumental composition with volumetric god rays, dramatic sense of scale, rich filmic color grade, hyper-detailed, 8k'
  },
  {
    id: 'wildlife_nature',
    name: 'Natureza Selvagem (BBC Earth)',
    icon: '🦁',
    text: 'Wildlife documentary photograph, BBC Earth cinematography, 600mm telephoto compression, golden hour backlight, crisp subject separation with creamy background, true natural colors, ultra-sharp feather and fur detail, National Geographic quality, 8k'
  },
  {
    id: 'true_crime_noir',
    name: 'True Crime / Noir Realista',
    icon: '🕵️',
    text: 'Moody true-crime documentary still, low-key lighting with hard shadows, sodium-vapor and cold fluorescent accents, desaturated palette with amber highlights, cinematic 50mm lens, gritty grounded realism, subtle grain, 8k'
  },
  {
    id: 'scifi_realistic',
    name: 'Sci-Fi Realista (IMAX)',
    icon: '🚀',
    text: 'Realistic science-fiction cinema still, practical lighting from consoles and starlight, industrial spacecraft surfaces with authentic wear, Interstellar-inspired cinematography, IMAX 70mm clarity, volumetric light, physically plausible detail, 8k'
  },
  {
    id: 'vintage_archive',
    name: 'Arquivo Vintage',
    icon: '📼',
    text: 'Authentic archival footage still, aged film stock with light scratches, dust and vignetting, faded period-accurate colors or monochrome, historically accurate grain structure, documentary archive realism'
  },
  {
    id: 'cyberpunk_noir',
    name: 'Cyberpunk Neon Noir',
    icon: '🌆',
    text: '90s cyberpunk anime cinema still, Akira and Ghost in the Shell style, rain-soaked neon streets in pink and cyan, heavy futuristic noir atmosphere, volumetric light shafts, detailed classic Japanese animation linework, 8k'
  },
  {
    id: 'anime_ghibli',
    name: 'Anime / Studio Ghibli',
    icon: '🎨',
    text: 'Studio Ghibli style hand-painted watercolor animation still, vivid colors, magical soft lighting, lush painterly backgrounds, clean classic Japanese animation linework, warm cozy yet epic atmosphere, 8k'
  },
  {
    id: 'dark_fantasy',
    name: 'Fantasia Sombria (Oil Painting)',
    icon: '🏰',
    text: 'Dark fantasy oil painting, dramatic chiaroscuro lighting, intricate old-masters brushwork, moody atmosphere with golden highlights, epic composition, masterpiece quality'
  },
  {
    id: 'minimalist_vector',
    name: 'Ilustração Minimalista',
    icon: '✏️',
    text: 'Clean flat vector illustration, bold confident linework, harmonious modern color palette, elegant use of negative space, editorial graphic design aesthetic'
  }
];

export const StylecardSection: React.FC<StylecardSectionProps> = ({
  stylecard,
  onChangeStylecard,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida (PNG, JPG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      onChangeStylecard({
        ...stylecard,
        referenceImageBase64: base64,
        referenceImageMimeType: file.type
      });
    };
    reader.readAsDataURL(file);
  };

  const removeReferenceImage = () => {
    onChangeStylecard({
      ...stylecard,
      referenceImageBase64: undefined,
      referenceImageMimeType: undefined
    });
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20">
            <Palette className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              Stylecard de Referência
              <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-500/20">
                Texto + Imagem
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Define o estilo visual unificado que o Gemini aplicará a todos os quadros do SRT.
            </p>
          </div>
        </div>
      </div>

      {/* Preset Quick Buttons */}
      <div>
        <label className="block text-xs font-semibold text-slate-300 mb-2">
          Presets de Estilo Rápido:
        </label>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {STYLE_PRESETS.map((preset) => {
            const isSelected = stylecard.presetName === preset.name || stylecard.textStyle === preset.text;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  onChangeStylecard({
                    ...stylecard,
                    textStyle: preset.text,
                    presetName: preset.name
                  });
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                  isSelected
                    ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-md shadow-amber-400/20'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700/80'
                }`}
              >
                <span>{preset.icon}</span>
                <span>{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid: Textual Stylecard & Visual Image Stylecard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Textual Stylecard */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>Diretriz Textual (Prompt Mestre)</span>
            <span className="text-[10px] text-slate-400">Concatenado em cada frame</span>
          </label>
          <textarea
            value={stylecard.textStyle}
            onChange={(e) => onChangeStylecard({ ...stylecard, textStyle: e.target.value, presetName: undefined })}
            rows={4}
            placeholder="Ex: Estilo anime anos 90, Studio Ghibli, paleta suave, iluminação cinematográfica, 35mm..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-none"
          />
        </div>

        {/* Visual Reference Image Stylecard */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-200 flex items-center justify-between">
            <span>Imagem de Referência Visual (Style Reference)</span>
            <span className="text-[10px] text-amber-400 font-medium">Força paleta &amp; traço</span>
          </label>

          {stylecard.referenceImageBase64 ? (
            <div className="relative group border border-slate-700 rounded-xl overflow-hidden bg-slate-950 p-2 flex items-center gap-3">
              <img
                src={stylecard.referenceImageBase64}
                alt="Stylecard Reference"
                className="w-20 h-20 object-cover rounded-lg border border-slate-800"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Imagem Stylecard Ativa
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  Esta imagem guia a paleta e traços do modelo de IA.
                </p>
                <button
                  type="button"
                  onClick={removeReferenceImage}
                  className="mt-2 text-xs text-rose-400 hover:text-rose-300 font-medium flex items-center gap-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Remover Referência
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-amber-400/60 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer bg-slate-950/50 hover:bg-slate-950 transition-all h-[106px]"
            >
              <Upload className="w-5 h-5 text-amber-400 mb-1" />
              <p className="text-xs font-semibold text-slate-200">
                Upload de Imagem de Estilo (Stylecard)
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Arraste ou clique para carregar a arte de referência
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          )}
        </div>
      </div>

      {/* Aspect Ratio Selector */}
      <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
          Proporção das Imagens (Aspect Ratio):
        </span>

        <div className="flex items-center gap-2">
          {[
            { id: '16:9', label: '16:9 (Vídeo Widescreen)', icon: Monitor },
            { id: '9:16', label: '9:16 (Shorts/Reels)', icon: Smartphone },
            { id: '1:1', label: '1:1 (Quadrado)', icon: Square },
            { id: '4:3', label: '4:3 (TV Clássica)', icon: Layout },
          ].map((aspect) => {
            const Icon = aspect.icon;
            const active = stylecard.aspectRatio === aspect.id;
            return (
              <button
                key={aspect.id}
                type="button"
                onClick={() => onChangeStylecard({ ...stylecard, aspectRatio: aspect.id as any })}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                  active
                    ? 'bg-amber-400 text-slate-950 border-amber-400 shadow-sm'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{aspect.id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
