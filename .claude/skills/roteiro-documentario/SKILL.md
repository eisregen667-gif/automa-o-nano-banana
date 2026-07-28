---
name: roteiro-documentario
description: Estrutura narrativas e roteiros completos no formato de documentário de televisão premium (Ken Burns, Attenborough, Errol Morris, true crime da Netflix, Globo Repórter). Use esta skill SEMPRE que o usuário pedir para criar, estruturar ou melhorar um roteiro, narrativa, documentário, série documental, vídeo narrado, storytelling em vídeo, episódio, "cold open", narração ou script para YouTube/TV — mesmo que ele não use a palavra "documentário". Também use quando o usuário quiser transformar uma pesquisa, história real, biografia ou tema em um vídeo com narração, ou quando precisar gerar o texto de narração que alimenta o pipeline do Nano Banana (SRT → imagens).
---

# Roteiro de Documentário (padrão TV premium)

Esta skill transforma um tema, pesquisa ou história em um roteiro documental completo, no nível dos grandes nomes da televisão. O produto final não é um esboço: é um documento de produção com premissa, estrutura de atos, cold open, texto de narração integral, sugestões visuais cena a cena e ganchos de retenção.

## Filosofia

Um bom documentário não é uma lista de fatos em ordem cronológica — é uma **tese dramatizada**. Os grandes documentaristas fazem três coisas que separam o trabalho profissional do amador:

1. **Têm uma pergunta central.** Ken Burns não fez "a história da Guerra Civil"; ele perguntou "o que essa guerra revela sobre quem os americanos são?". Antes de escrever qualquer cena, formule a pergunta que o filme responde.
2. **Estruturam por tensão, não por cronologia.** A informação é revelada na ordem que maximiza curiosidade: começa-se pelo momento mais intrigante, volta-se atrás para explicar, e cada bloco termina com uma pergunta aberta (o "cliffhanger de intervalo comercial" da TV).
3. **Escrevem para o ouvido e para o olho ao mesmo tempo.** Cada linha de narração precisa ser falável em voz alta E precisa de uma imagem correspondente. Narração que não sugere imagem é ensaio, não roteiro.

## Fluxo de trabalho

Siga estas etapas em ordem. Não pule a etapa 1 e 2 para ir direto à escrita — a estrutura é o que faz parecer "TV de verdade".

### Etapa 1 — Dossiê e tese

- Reúna os fatos: personagens, datas, locais, conflitos, reviravoltas, números marcantes. Se o usuário forneceu pesquisa/links, extraia daí; se não, pesquise ou peça o material.
- Escreva a **premissa em uma frase** usando o formato ABT (And, But, Therefore): "X era assim E parecia estável, MAS aconteceu Y, PORTANTO tudo mudou."
- Defina a **pergunta central** que o episódio responde e a **emoção dominante** (assombro, indignação, suspense, nostalgia...).
- Liste os 3–5 **momentos de virada** da história. Eles serão as fronteiras dos atos.

### Etapa 2 — Escolha de estilo e estrutura

- Escolha (ou pergunte, se houver ambiguidade real) o estilo documental que melhor serve à história. Leia `references/estilos.md` para o catálogo de estilos dos grandes nomes (Ken Burns, Attenborough, Errol Morris, true crime Netflix, Globo Repórter, ensaio de YouTube) com as convenções de narração, ritmo e imagem de cada um.
- Defina a duração-alvo e derive o número de atos. Leia `references/estrutura-atos.md` para as estruturas (teaser + 3 atos, 5 atos de TV com cliffhangers, estrutura de série). Regra prática: ~150 palavras de narração por minuto de vídeo.
- Monte o **mapa de atos**: uma linha por ato dizendo qual pergunta ele abre, qual informação revela e com qual gancho termina.

### Etapa 3 — Escrita do roteiro completo

Escreva o roteiro no formato AV de duas colunas (VÍDEO | ÁUDIO), cena a cena, usando o template em `references/template-roteiro.md`. Obrigatório:

- **Cold open / teaser** (30–90s): a cena mais intrigante da história, deslocada do meio ou do fim, terminando na pergunta central. Nunca comece por "Fulano nasceu em...".
- **Narração escrita por extenso** — o texto exato que o narrador fala, não um resumo do que ele falaria. Frases curtas, voz ativa, presente histórico quando o estilo pedir. Leia em voz alta mentalmente: se tropeça, reescreva.
- **Coluna de vídeo concreta**: para cada bloco de narração, descreva a imagem (arquivo, reconstituição, drone, close de objeto, talking head, mapa animado). "Imagens do período" é proibido — especifique.
- **Ganchos de fim de ato**: cada ato termina com revelação parcial + nova pergunta.
- **Entrevistas (quando o estilo usa)**: escreva as perguntas e o papel dramático de cada entrevistado (testemunha, especialista, antagonista, voz emocional).
- **Marcações de trilha e ritmo**: onde a música sobe, onde entra silêncio, onde o corte acelera.

### Etapa 4 — Revisão de retenção

Antes de entregar, faça uma passada de auditoria:

- O primeiro segundo tem imagem ou frase que segura? O teaser termina em pergunta?
- Existe algum trecho de mais de 45 segundos sem nova informação, virada ou mudança visual? Corte ou reordene.
- A pergunta central foi respondida no clímax — e existe um epílogo curto de ressonância (o "e daí?")?
- Conte as palavras de narração e confira contra a duração-alvo (~150 palavras/min).

## Formato de entrega

Entregue sempre o pacote completo em um único documento Markdown, nesta ordem:

1. **Ficha do episódio** — título, logline (ABT), pergunta central, emoção dominante, duração, estilo de referência, público.
2. **Mapa de atos** — tabela com ato, duração, pergunta que abre, revelação, gancho final.
3. **Roteiro AV completo** — cena a cena, duas colunas, com narração integral.
4. **Lista de produção** — entrevistados e perguntas, materiais de arquivo necessários, locações/B-roll, trilhas sugeridas.

### Integração com o Nano Banana (SRT → imagens)

Se o roteiro vai alimentar o pipeline do Nano Banana (ou se o usuário pedir SRT/legendas), gere adicionalmente o arquivo `.srt` da narração: cada bloco de narração vira uma entrada com timestamps calculados pela regra de ~150 palavras/min (2,5 palavras/segundo), blocos de no máximo ~12 palavras. A descrição visual da coluna VÍDEO de cada cena deve ser autossuficiente, pois vira o prompt de imagem — inclua época, local, iluminação, enquadramento e atmosfera.

## Referências desta skill

- `references/estilos.md` — catálogo dos estilos dos grandes documentaristas e como imitar cada um (narração, imagem, ritmo, trilha).
- `references/estrutura-atos.md` — estruturas de atos detalhadas (teaser+3 atos, 5 atos de TV, arco de série documental) com minutagens.
- `references/template-roteiro.md` — template AV de duas colunas preenchido com exemplo, pronto para copiar.
