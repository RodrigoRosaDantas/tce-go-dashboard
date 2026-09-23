# TCE-GO — UX/Product V3

## Objetivo

Transformar o dashboard em ambiente principal de execução do Projeto D001–D100 sem alterar a precedência canônica:

Notion → snapshot GitHub → site/PWA → cache/Supabase.

A V2 permanece como baseline de rollback no histórico Git. A V3 não altera a fonte editorial, não cria progresso artificial e não duplica um motor completo de questões.

## Benchmark interno obrigatório

| Projeto | Adotar | Adaptar | Rejeitar |
|---|---|---|---|
| SEDES/TDAS | central de decisão, busca global, command palette, métricas, mobile dedicado | densidade do cockpit para o contexto TCE | excesso de controles simultâneos em telas pequenas |
| SEEDF | Estudar hoje, timer, checklist, conforto de leitura, progresso real | foco do dia para S01–S47 | métricas editoriais como substituto de execução |
| TJDFT | navegação modular, leitura configurável, sync visível | módulos Material/Questões/Fonte para Dxx/Qxx | duplicação de trilhas que não existem no TCE |
| Mychael PM | reader toolbar, retomar leitura, progresso, modo foco, temas | controles de largura/texto para conteúdo jurídico/técnico | esconder informação canônica relevante em modo foco |
| Plataforma de Questões | resolvedor especializado, atalhos, retorno de métricas, separação conteúdo/progresso | deep-link TCE com contexto Dxx/Sxx | recriar segundo banco/motor completo dentro do dashboard |

## Golden Flow de aceitação

1. Home identifica a primeira sessão publicada ainda não concluída pela ordem Sxx.
2. Usuário abre D001.
3. Player exibe objetivo, checklist, timer persistente, leitura e índice.
4. Leitor oferece tema, escala, largura e modo foco.
5. Retomada de leitura restaura a posição local.
6. Q001 abre como etapa própria.
7. Quando houver conteúdo público seguro no snapshot, Q001 é renderizado.
8. Questões de terceiros permanecem por referência/metadados; itens autorais permitidos podem aparecer integralmente.
9. Bateria da Plataforma é usada apenas quando validada.
10. Fechamento importa o tempo do timer para o registro, sem marcar conclusão automaticamente.
11. Progresso confirmado/cached alimenta Home e Desempenho.
12. Navegação anterior/próxima respeita S01–S47.
13. Mobile, tablet e desktop não possuem barras/controles sobrepostos.
14. Notion continua estudável integralmente se o site falhar.

## Arquitetura visual

- sidebar desktop com grupos;
- topbar de contexto com busca/command palette;
- bottom navigation mobile;
- Home como central de decisão, não mural de cards;
- player com rail de sessão + leitor;
- reader toolbar sticky, mas sem competir com topbar;
- design tokens únicos em src/v3.css;
- nenhuma dependência de estilos V2.

## Dados locais permitidos

- preferências de leitura;
- posição de leitura;
- timer;
- checklist operacional;
- cache confirmado de progresso;
- fila de sincronização.

Esses dados nunca substituem o Notion.

## Breakpoints de QA

- 375 × 812
- 430 × 932
- 768 × 1024
- 834 × 1194
- 1024 × 1366
- 1366 × 768
- 1440 × 900

## Não objetivos da primeira entrega V3

- substituir a Plataforma de Questões;
- criar novo banco canônico;
- publicar URLs internas do Notion;
- transformar dados editoriais em desempenho pessoal;
- reescrever conteúdo pedagógico do D001/Q001 no frontend.

## Gate de promoção

Só promover V3 para main quando:

- lint/type-check;
- npm audit;
- snapshot validation;
- build GitHub Pages;
- tests;
- regressões V3;
- sync real do Notion com Qxx seguro;
- smoke test das rotas;
- verificação do Golden Flow D001/Q001.
