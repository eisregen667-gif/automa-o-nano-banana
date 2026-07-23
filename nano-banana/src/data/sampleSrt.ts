export interface SampleSrtPreset {
  id: string;
  title: string;
  language: 'pt' | 'en';
  description: string;
  defaultStyle: string;
  content: string;
}

export const SAMPLE_SRT_PRESETS: SampleSrtPreset[] = [
  {
    id: 'cyberpunk_pt',
    title: 'Cyberpunk Noir: O Detetive (PT-BR)',
    language: 'pt',
    description: 'História neo-noir em uma metrópole futurista chuvosa',
    defaultStyle: 'Estilo anime cyberpunk anos 90,iluminação neon rosa e azul, chovendo, atmosfera pesada de filme noir, detalhado 8k, traço de desenho japonês clássico',
    content: `1
00:00:00,000 --> 00:00:04,500
A chuva ácida caía sem trégua sobre os arranha-céus de Neo-Aparecida.

2
00:00:05,000 --> 00:00:09,800
O detetive Silas acendeu seu último cigarro holográfico enquanto observava o beco neon.

3
00:00:10,200 --> 00:00:15,000
Uma figura misteriosa com sobretudo prateado surgiu no final da rua estreita.

4
00:00:15,500 --> 00:00:20,000
"Você demorou," disse Silas, ajustando os óculos táticos que brilhavam no escuro.

5
00:00:20,500 --> 00:00:25,000
Ela entregou um chip de memória pulsando em luz roxa: "A verdade sobre a IA está aqui."`
  },
  {
    id: 'fantasy_pt',
    title: 'A Jornada do Mago (PT-BR)',
    language: 'pt',
    description: 'Aventura de alta fantasia estilo Studio Ghibli',
    defaultStyle: 'Estilo Studio Ghibli, pintura artesanal em aquarela, cores vívidas, floresta mística iluminada por vaga-lumes mágicos, atmosfera acolhedora e épica',
    content: `1
00:00:00,000 --> 00:00:05,000
Nas profundezas da Floresta dos Murmúrios, o jovem aprendiz de mago encontrou o livro sagrado.

2
00:00:05,500 --> 00:00:10,000
Ao abrir as páginas douradas, runas antigas flutuaram no ar iluminando as copas das árvores.

3
00:00:10,500 --> 00:00:16,000
Um pequeno dragão verde de olhos brilhantes pousou suavemente sobre seu cajado de madeira.

4
00:00:16,500 --> 00:00:22,000
"O reino precisa de nós," sussurrou o menino, olhando para o horizonte do castelo flutuante.`
  },
  {
    id: 'documentary_en',
    title: 'Deep Space Discovery (EN)',
    language: 'en',
    description: 'Cinematic Sci-Fi Documentary in Deep Space',
    defaultStyle: 'Cinematic IMAX 35mm photograph, deep space nebula background, realistic space station exterior, volumetric cosmic dust, sharp detail',
    content: `1
00:00:00,000 --> 00:00:05,000
In the outer rim of the Orion Nebula, Research Vessel Voyager-9 encountered a massive anomaly.

2
00:00:05,500 --> 00:00:11,000
A geometric monolith of unknown crystalline material hovered motionless near a dying star.

3
00:00:11,500 --> 00:00:17,000
Commander Sarah Vance initiated full sensor scans as energy pulses rippled across the hull.`
  }
];
