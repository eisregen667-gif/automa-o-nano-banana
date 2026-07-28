# Template de roteiro AV (duas colunas) + exemplo preenchido

Use exatamente esta estrutura de documento na entrega. As seções 1, 2 e 4 são tabelas/listas curtas; a seção 3 é o roteiro propriamente dito, cena a cena. Depois do template há um exemplo real de teaser preenchido — imite o nível de detalhe dele, não menos.

---

## Estrutura do documento de entrega

```markdown
# [TÍTULO DO EPISÓDIO]

## 1. Ficha do episódio
- **Logline (ABT):** [X era assim E..., MAS..., PORTANTO...]
- **Pergunta central:** [a pergunta que o episódio responde]
- **Emoção dominante:** [assombro | indignação | suspense | nostalgia | ...]
- **Duração-alvo:** [min] · **Palavras de narração:** [~N]
- **Estilo de referência:** [Ken Burns | Attenborough | Errol Morris | True crime | Globo Repórter | Ensaio YouTube]
- **Público e plataforma:** [ex.: YouTube, 25-45 anos, interessados em história]

## 2. Mapa de atos
| Ato | Duração | Pergunta que abre | Revelação | Gancho final |
|---|---|---|---|---|

## 3. Roteiro
### [TEASER / ATO N] — [nome do ato]
#### CENA [N.N] — [slug: LOCAL/MATERIAL – DIA/NOITE]
| VÍDEO | ÁUDIO |
|---|---|
| [imagem concreta: tipo de plano, o que aparece, movimento, época, luz, atmosfera] | **NARRADOR:** [texto integral falado] |
| [próxima imagem] | ♪ [trilha: entrada/mudança] / SFX: [efeito] |
| [talking head: NOME, cargo — enquadramento] | **NOME:** [fala esperada ou pergunta a fazer] |

## 4. Lista de produção
- **Entrevistados:** [nome — papel dramático — 3 a 5 perguntas cada]
- **Arquivo necessário:** [fotos, jornais, vídeos de época — item a item]
- **B-roll / locações:** [lista]
- **Trilha:** [referências de música por ato]
```

Convenções da coluna VÍDEO — cada célula deve ser autossuficiente como prompt de imagem (o pipeline Nano Banana usa essa coluna): inclua **tipo de plano** (aéreo, close, macro, travelling), **sujeito**, **época e local**, **luz/hora** e **atmosfera**. Escreva "ARQUIVO:", "RECONSTITUIÇÃO:", "GERADA:", "MAPA:" ou "TALKING HEAD:" como prefixo para o tipo de material.

Convenções da coluna ÁUDIO: narração em negrito com **NARRADOR:**; trilha com ♪; efeitos com SFX:; silêncio intencional marcado como *(silêncio — 2s)*. Numere as cenas por ato (1.1, 1.2...) para permitir reordenação sem renumerar tudo.

---

## Exemplo preenchido — teaser de "O Banco que Morreu em 9 Dias" (estilo true crime, 15 min)

### TEASER — A assinatura
#### CENA 0.1 — LONDRES, SEDE DO BARINGS – NOITE
| VÍDEO | ÁUDIO |
|---|---|
| GERADA: fachada vitoriana de banco em Londres, 1995, noite chuvosa, luz âmbar dos postes refletida no asfalto molhado, plano baixo contra-plongée, atmosfera opressiva | ♪ drone grave contínuo. **NARRADOR:** Fevereiro de 1995. Este banco existe há duzentos e trinta e três anos. |
| ARQUIVO: manchete de jornal de 1995 "Barings Collapses", close com highlight animado na palavra "collapses" | **NARRADOR:** Ele financiou as guerras napoleônicas. Sobreviveu a duas guerras mundiais. *(silêncio — 2s)* Em nove dias, deixou de existir. |
| RECONSTITUIÇÃO: mão masculina assinando um contrato, macro extremo na caneta, luz fria de escritório, sem rosto visível | SFX: risco da caneta no papel, amplificado. **NARRADOR:** E tudo começou... com uma assinatura. |
| GERADA: cartela de título sobre fundo preto, tipografia serifada branca surgindo do escuro: "O BANCO QUE MORREU EM 9 DIAS" | ♪ hit grave + corte seco para silêncio. |

Repare no que o exemplo faz — e reproduza: números concretos na narração (233 anos, 9 dias), contraste como motor da primeira frase, silêncio marcado antes da informação-bomba, imagem descrita com época/luz/plano/atmosfera, e o teaser fecha plantando o objeto (a assinatura) que será o payoff do clímax.

---

## Saída SRT opcional (pipeline Nano Banana)

Quando o usuário pedir SRT ou for usar o Nano Banana, converta APENAS as falas de **NARRADOR:** em arquivo `.srt`, na ordem do roteiro:

- Blocos de no máximo ~12 palavras (quebre frases longas em vírgulas/respiros).
- Duração de cada bloco = palavras ÷ 2,5, arredondada para 0,1s; some 0,3s de folga entre blocos; silêncios marcados no roteiro viram gaps reais.

```srt
1
00:00:00,000 --> 00:00:04,400
Fevereiro de 1995. Este banco existe há duzentos e trinta e três anos.

2
00:00:04,700 --> 00:00:08,300
Ele financiou as guerras napoleônicas. Sobreviveu a duas guerras mundiais.

3
00:00:10,300 --> 00:00:12,700
Em nove dias, deixou de existir.
```
