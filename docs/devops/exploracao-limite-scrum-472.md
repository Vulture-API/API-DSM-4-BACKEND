# SCRUM-472 — Exploração progressiva do limite

Execução em 23/10/2026, horário de São Paulo. A pasta de evidências usa UTC e começa em 24/10. O [plano](testes-de-carga-scrum-472.md) contém os requisitos e as fontes consultadas no Confluence.

## Resultado encontrado

Para o mix de consultas, a máquina, a rede e a base atuais, a fronteira observada do requisito de **até 3 segundos por resposta válida** ficou entre **736 e 784 consultas concorrentes, sem pausa entre consultas**:

- **736:** 4.026 consultas, nenhuma acima de 3 s; máximo de **2.771 ms**.
- **784:** 4.013 consultas, **40 acima de 3 s**; máximo de **3.027 ms**.
- **1.024:** a violação foi reproduzida em duas etapas, com máximo de **3.898 ms** na confirmação.
- **Recuperação:** 15 consultas com um usuário e pausa de 1 s; máximo de **35 ms**, fila do pool zerada.

Isso é uma faixa observada em janelas curtas, não um teto universal nem homologação de 736 usuários humanos. Cada worker mantém no máximo uma consulta em andamento e inicia outra imediatamente; pessoas usando o portal produzem outro padrão de tráfego. O critério usa o máximo, além de p95: em 784 consultas concorrentes, p95 ainda estava abaixo de 3 s, mas o requisito já havia sido violado por respostas individuais.

Foram feitas **52.526 consultas**, todas com HTTP 200 e formato esperado. **944 respostas ultrapassaram 3 segundos** nas etapas que reprovaram. Ausência de erro HTTP não significou aprovação de desempenho.

## Curva medida

| Concorrência sem pausa |  req/s |      p95 |   Máximo | Consultas > 3 s | Maior fila do pool amostrada |
| ---------------------- | -----: | -------: | -------: | --------------: | ---------------------------: |
| 5                      | 166,99 |    39 ms |   164 ms |               0 |                            0 |
| 10                     | 323,74 |    41 ms |   271 ms |               0 |                            0 |
| 20                     | 351,93 |    77 ms |   277 ms |               0 |                           10 |
| 40                     | 340,22 |   170 ms |   367 ms |               0 |                           30 |
| 80                     | 363,65 |   289 ms |   354 ms |               0 |                           70 |
| 160                    | 296,34 |   876 ms | 1.292 ms |               0 |                          150 |
| 320                    | 351,05 | 1.241 ms | 1.304 ms |               0 |                          310 |
| 640                    | 352,98 | 2.370 ms | 2.489 ms |               0 |                          629 |
| 736, refinamento       | 351,55 | 2.737 ms | 2.771 ms |               0 |                          726 |
| 784, refinamento       | 343,43 | 2.936 ms | 3.027 ms |              40 |                          774 |
| 832, refinamento       | 353,40 | 2.968 ms | 3.038 ms |              56 |                          822 |
| 1.024                  | 355,68 | 3.530 ms | 3.641 ms |             407 |                          985 |
| 1.024, confirmação     | 319,07 | 3.683 ms | 3.898 ms |             441 |                          931 |

A duração efetiva, o número de consultas e as latências de cada rota estão nos JSONs. Etapas que cruzaram o critério interromperam a emissão de novas consultas e drenaram as já iniciadas; por isso algumas duraram menos que o planejado. A vazão usa a duração real, incluindo a drenagem.

## Gargalo observado

O pool permaneceu limitado a **10 conexões**, sem alteração na configuração do backend normal. A partir de aproximadamente 20 consultas concorrentes, a vazão ficou perto de **350 req/s**, enquanto a fila aumentou quase junto com a concorrência. Mais workers aumentaram principalmente o tempo de espera, não a vazão.

Na amostragem, a CPU do backend chegou a 78,93% de um núcleo; a do gerador ficou abaixo de 39% de um núcleo nas etapas de busca. O RSS máximo do backend foi 261 MB. As proteções de RSS/event loop e orçamento de consultas não foram acionadas.

O indício principal de saturação está no **pool/caminho SQL e sua latência**. Isso não isola o limite físico do PostgreSQL gratuito: pool, consultas, rede e backend participam da medição. Não foi aumentado o pool para contornar o ponto encontrado, nem foram alterados os limites da aplicação normal. A quantidade de conexões amostrada e a fila sustentam o diagnóstico; não houve captura de CPU/IO internos do provedor de banco.

O monitor também registrou alertas de heap. Após a recuperação, a latência e a fila voltaram ao nível baixo; RSS ainda estava em aproximadamente 257 MB, contra 130 MB na referência. V8, buffers, caches e logs podem reter memória após carga; esta execução curta não comprova vazamento nem retorno completo da memória ao valor inicial.

## Método

1. Referência com um usuário, 10 s e pausa de 1 s.
2. Rampa de 5, 10, 20, 40, 80, 160, 320, 640 e 1.024 workers, até 15 s por etapa e sem pausa. A partida foi distribuída nos primeiros 200 ms.
3. Parada da subida na primeira violação, com drenagem e 5 s de redução de carga.
4. Confirmação da etapa que falhou, por até 10 s.
5. Três aproximações intermediárias: 832, 736 e 784, com intervalos de redução de carga de 3 s.
6. Redução de carga por 5 s e recuperação por 15 s.

O limite usado foi o documentado: nenhuma resposta válida acima de 3 s; erro HTTP/formato acima de 1% também interromperia a busca. Não foi necessário provocar queda do serviço para observar o corte de desempenho.

Proteções do ensaio: teto de 1.024 workers, 12.000 consultas por etapa, máximo de 512 MB de RSS no backend ou lag do event loop acima de 1 s. São limites do gerador/ensaio; se acionados, não são tratados como capacidade comprovada. O rate limit foi elevado somente na instância efêmera, para separar a política de proteção do processamento.

Foi usado HTTP/TCP real, gerador em processo separado e banco somente leitura. As consultas foram as mesmas do mix já documentado: overview, atuais da rede e da estação, séries de 30 dias, histórico e estatísticas. Nenhum schema, checkpoint, permissão ou registro foi alterado. Não houve teste de ingestão, renderização de muitos navegadores ou limite de conexões WebSocket nesta busca.

Base: **13 estações, 49 sensores e 56 leituras**. O volume pequeno e o cache aquecido limitam a extrapolação. A fronteira pode mudar em outra máquina, outro momento da nuvem, com outras consultas ou com mais dados. Os limites encontrados não substituem um ensaio de sustentação longo ou a validação de SLA mensal.

## Como repetir e evidências

Na raiz do backend, com `LOAD_EMAIL` e `LOAD_PASSWORD` definidos no ambiente:

```powershell
npm run test:load -- --find-limit
```

Este modo é separado do padrão conservador. Não combinar com `--quick` ou `--frontend-only`. O comando encerra após encontrar a faixa ou atingir uma proteção. O arquivo `limit-summary.json` diferencia `limitConfirmed`, motivo da parada e resultado da recuperação; a reprovação intencional de uma etapa não significa falha do runner.

- [Resumo da busca e etapas completas](evidencias/scrum-472/2026-10-24T01-01-35-824Z/limit-summary.json).
- [Diagnóstico consolidado](evidencias/scrum-472/2026-10-24T01-01-35-824Z/diagnostics.json).
- [Etapa aprovada de 736 consultas concorrentes](evidencias/scrum-472/2026-10-24T01-01-35-824Z/limit-refine-736.json).
- [Etapa reprovada de 784](evidencias/scrum-472/2026-10-24T01-01-35-824Z/limit-refine-784.json).
- [Confirmação em 1.024](evidencias/scrum-472/2026-10-24T01-01-35-824Z/limit-confirm-1024.json).
- [Recuperação](evidencias/scrum-472/2026-10-24T01-01-35-824Z/limit-recovery.json).

Cada etapa preserva também as consultas individuais em `<nome>-requests.jsonl`. Os percentis foram calculados somente sobre respostas válidas; status e falhas são contabilizados separadamente. O gerador deixou de ordenar todas as amostras a cada resposta: os contadores de interrupção são atualizados em tempo constante e os percentis são calculados ao finalizar a etapa.

TypeScript, lint do runner e os quatro testes dos critérios passaram. A combinação inválida `--find-limit --quick` foi verificada e rejeitada antes de abrir o servidor. Não houve commit ou alteração no Jira.
