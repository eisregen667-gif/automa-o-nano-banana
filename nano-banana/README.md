# 🍌 Nano Banana — Automação de Documentários por IA

Estúdio completo no navegador para produzir documentários no padrão Discovery/History:
narração TTS dirigida → SRT → imagens consistentes → cartelas, B-roll e inserts gráficos →
prompts de vídeo calibrados para Veo → trilha sonora gerada pelo Lyria 3 → SFX e lower thirds.

**Use direto no navegador:** https://eisregen667-gif.github.io/automa-o-nano-banana/

Cada usuário informa a própria chave da Gemini API em **Configurações** (fica só no navegador,
em localStorage — nunca vai para o repositório ou para terceiros).

## Fluxo (na ordem do menu)

1. **🎙 Narração** — cole o roteiro, saneie para TTS (com correção de escrita por IA),
   dirija a sessão (emoções, pausas reais) e baixe o `NARRACAO.wav`.
2. **📄 Roteiro (SRT)** — gere as legendas a partir do WAV (CapCut/legendador) e carregue o SRT.
3. **🎨 Estilo Visual** — escolha o stylecard do documentário.
4. **🎬 Produção** — gere os prompts (entidades canônicas com grounding no Google Search,
   um prompt por bloco SRT); rode a fila de imagens; refine com Auto-QC, cartelas,
   B-roll, inserts (mapas/linhas do tempo/diagramas), Diretor de Som e trilha (Lyria 3);
   gere os prompts de vídeo numerados 1:1.
5. **🖼 Galeria** — revise, regenere e exporte o pacote (imagens em ordem sequencial ≤1MB,
   `VIDEO_PROMPTS.txt`, `TRILHA_SONORA.txt`, `SFX_CUE_SHEET.txt`, `LOWER_THIRDS.txt`,
   `FONTES.txt`, `TIMELINE.csv`).

## Rodar localmente

```bash
cd nano-banana
npm install
npm run dev
```

## Deploy

Push na branch `main` publica automaticamente no GitHub Pages
(workflow em `.github/workflows/deploy-pages.yml`).

## Modelos usados

- Texto/diretores: `gemini-3.1-pro-preview` (com Google Search grounding na Passada 1)
- Imagens: `gemini-3.1-flash-lite-image` (padrão) / `gemini-3.1-flash-image` (cartelas e cenas com entidades)
- Narração: `gemini-2.5-flash-preview-tts` / `gemini-2.5-pro-preview-tts`
- Música: `lyria-3-pro-preview` (cues) / `lyria-3-clip-preview` (vinheta 30s)
