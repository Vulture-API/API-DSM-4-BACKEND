# SCRUM-472 — Testes de carga e capacidade

## Objetivo

Avaliar o tempo de resposta das consultas meteorológicas, acompanhar os recursos do backend e identificar em qual carga o sistema ultrapassa o limite de 3 segundos.

## Referências

- [SCRUM-472 — tarefa de carga e capacidade](https://vultureapi.atlassian.net/browse/SCRUM-472).
- [Confluence — Requisitos Não Funcionais](https://vultureapi.atlassian.net/wiki/spaces/V/pages/3866626): RNF01, processamento em até 3 segundos; RNF02, disponibilidade mínima de 99%; RNF03, crescimento de estações sem degradação significativa.
- [Confluence — Backlog Sprint 2](https://vultureapi.atlassian.net/wiki/spaces/V/pages/35717121): US06 associa capacidade, observabilidade e disponibilidade.
- [Confluence — Arquitetura monolítica modular](https://vultureapi.atlassian.net/wiki/spaces/V/pages/37453825): Fastify, pool PostgreSQL compartilhado, ingestão MQTT/Python externa; não alterar schema/checkpoints do banco compartilhado.
- [RNF01 / SCRUM-517](https://vultureapi.atlassian.net/browse/SCRUM-517) e [RNF03 / SCRUM-519](https://vultureapi.atlassian.net/browse/SCRUM-519) confirmam a rastreabilidade com esta tarefa.

Os requisitos não definem um volume mínimo de usuários ou requisições. Os cenários foram definidos considerando a estrutura atual do projeto e o banco gratuito.

## Parâmetros definidos

Os resultados estão no [relatório de exploração do limite](exploracao-limite-scrum-472.md).

O perfil padrão **free-tier** usa até 10 usuários virtuais, pausa de 2 segundos entre consultas e pool de até 5 conexões. A carga máxima pretendida é de aproximadamente 5 requisições por segundo, e pode ser menor conforme a latência. As etapas HTTP somam 3 minutos; a duração total inclui pré-condições e WebSockets.

| Etapa                    | Usuários virtuais |        Duração | Objetivo                         |
| ------------------------ | ----------------: | -------------: | -------------------------------- |
| baseline                 |                 1 |           15 s | Referência inicial               |
| normal                   |                 3 |           30 s | Uso acadêmico normal             |
| peak                     |                 5 |           30 s | Pico moderado                    |
| stress                   |                10 |           30 s | Limite conservador do ensaio     |
| endurance                |                 3 |           60 s | Observação curta de estabilidade |
| recovery                 |                 1 |           15 s | Recuperação após a carga         |
| WebSocket                |            5 e 10 | 10 s por grupo | Conexões moderadas               |
| Proxy frontend, opcional |                 1 |           15 s | Integração autenticada           |

O perfil **extended**, acionado com `--extended`, usa 1/5/10/20 usuários, durações de 30/60/60/60/120/30 segundos, pausa de 1 segundo, pool de 10 conexões, WebSockets com 10/30 conexões por 20 segundos e o lote de 310 requisições de rate limit. Esse perfil não é executado pelo comando padrão.

Cada usuário virtual executa uma consulta por vez, alternando entre as seis rotas abaixo. Todos compartilham a mesma conta autenticada. A carga de login não faz parte da medição.

Rotas consultadas, com distribuição aproximadamente uniforme:

1. `GET /api/stations/overview`;
2. `GET /api/stations/current`;
3. `GET /api/stations/:id/current`;
4. `GET /api/stations/readings/series?hours=720&bucket_minutes=120`;
5. `GET /api/readings`, filtrado por estação e últimos 30 dias, até 100 resultados;
6. `GET /api/stations/statistics` (janela padrão do backend).

Respostas vazias com formato válido contam como sucesso HTTP. A previsão do Open-Meteo fica fora do teste por depender de um serviço externo.

## Critérios de avaliação

- Nenhuma resposta válida de sucesso acima de **3.000 ms**. São registrados média, p50, p95, p99 e máximo.
- Pelo menos **99% das respostas com HTTP 200 e JSON no formato esperado**. Esse indicador mede sucesso das consultas; não valida a disponibilidade mensal do RNF02.
- Respostas 429 contam como falha nas etapas de capacidade e são esperadas somente no cenário específico de rate limit.
- As conexões WebSocket devem abrir e permanecer conectadas durante a etapa. A entrega de novas medições não é validada, pois o teste não insere leituras.
- Comparar o tempo de resposta e a fila do pool antes e depois da carga. CPU, RSS, heap e atraso do event loop ajudam a identificar gargalos.

As requisições têm timeout de 10 segundos. Nos perfis padrão e estendido, mais de 10% de erros após pelo menos 50 consultas interrompem a progressão HTTP. Na busca do limite, a emissão para ao observar uma resposta válida acima de 3 segundos ou mais de 1% de erros após 50 consultas. As requisições já iniciadas são concluídas e registradas.

## Ambiente do teste

O script inicia uma instância local do backend em outro processo, com autenticação ativa e porta livre. As consultas usam HTTP real e os serviços e repositórios da aplicação.

O pool PostgreSQL usa até 5 conexões no perfil padrão e 10 no estendido e na busca do limite. O acesso é somente leitura (`default_transaction_read_only=on`), conferido antes de abrir o servidor. Cada conexão recebe um `statement_timeout` de 10 segundos.

O monitor de indisponibilidades usa armazenamento em memória, e os motores de regras e ocorrências ficam desativados nessa instância. O teste não altera dados, schema ou configurações do backend que já estiver rodando.

Para medir capacidade sem interromper a carga pelo rate limit, a instância de teste usa 600 requisições/minuto no perfil padrão, 100.000 no estendido e 1.000.000 na busca do limite. A verificação do limite de 300/minuto/IP roda separadamente, com 310 consultas, apenas no perfil estendido.

A busca do limite aumenta a concorrência de 5 até 1.024 consultas, sem pausa, confirma a falha, testa três valores intermediários e mede a recuperação. Cada etapa tem teto de 12.000 consultas. RSS acima de 512 MB ou atraso do event loop acima de 1 segundo também interrompem a emissão. Esses tetos são proteções do teste. O procedimento completo está no [relatório](exploracao-limite-scrum-472.md).

## Como executar

Executar na **raiz de `API-DSM-4-BACKEND`**.

Pré-condições: dependências instaladas, Node compatível com `package.json`, `DATABASE_URL` e `JWT_SECRET` válidos no ambiente/`.env`, conta ativa com `monitoring.read`.

PowerShell:

```powershell
$env:LOAD_EMAIL = 'email-da-conta-de-teste'
$env:LOAD_PASSWORD = 'senha-da-conta-de-teste'

# Validação curta da infraestrutura; não usar como resultado de capacidade.
npm run test:load -- --quick

# Ensaio padrão conservador para banco gratuito.
npm run test:load

# Opcional: maior carga e rajada de rate limit.
npm run test:load -- --extended

# Busca progressiva do corte de desempenho, sem pausas entre consultas.
# Interrompe na violação, confirma/refina a faixa e mede a recuperação.
npm run test:load -- --find-limit

# Opcional: incluir consultas pelo proxy do frontend local.
$env:LOAD_FRONTEND_URL = 'http://localhost:3010'
npm run test:load

# Repetir somente a etapa complementar, sem refazer a carga do backend.
# Exige LOAD_FRONTEND_URL e frontend/backend já disponíveis.
npm run test:load -- --frontend-only

Remove-Item Env:LOAD_PASSWORD
Remove-Item Env:LOAD_EMAIL
Remove-Item Env:LOAD_FRONTEND_URL -ErrorAction SilentlyContinue
```

Não colocar senhas/tokens em scripts, commits ou evidências. As credenciais só são usadas no login; cabeçalhos, corpos e dados pessoais não são armazenados nos resultados.

As consultas iniciais aquecem o banco antes das etapas. O resultado não inclui o tempo de despertar de uma instância suspensa.

Não combinar `--find-limit` com `--quick` ou `--frontend-only`. Na busca do limite, a reprovação de uma etapa faz parte do resultado esperado; falha na referência inicial ou na recuperação gera código de saída 1. Nos demais perfis, o comando retorna 1 quando os critérios ou as pré-condições falham. Ctrl+C interrompe a execução e encerra os processos do teste. Erros de execução produzem `execution-error.json`.

## Evidências e reprodutibilidade

Cada execução cria `docs/devops/evidencias/scrum-472/<data-UTC>/`:

- `summary.json` ou `limit-summary.json`: configuração e resultados das etapas;
- `<etapa>.json`: vazão, distribuição de status, latências totais/por rota e amostras de recursos a cada aproximadamente 2 s;
- `<etapa>-requests.jsonl`: horário, rota, status, duração, tamanho e validade de cada resposta, sem corpo/token;
- `websocket-5.json` e `websocket-10.json` no perfil padrão; 10/30 no estendido;
- `rate-limit-requests.jsonl`, somente no perfil estendido;
- arquivos equivalentes para `frontend-proxy`, quando habilitado.

O banco e a rede externos influenciam os resultados. As contagens de dados também podem mudar se houver gravações de outros integrantes durante o teste.

Testes automatizados de cálculo e critérios:

```powershell
npx vitest run scripts/devops/load-metrics.test.ts
npm run lint
npm run typecheck
```

## Limitações

A base usada contém 13 estações, 49 sensores e 56 leituras. Os resultados representam esse conjunto de dados, a máquina e as condições de rede e banco no momento da execução.

Usuários virtuais sem pausa representam consultas concorrentes, não a mesma quantidade de pessoas navegando. As janelas curtas também não permitem concluir sobre estabilidade prolongada, disponibilidade mensal ou vazamento de memória.

A busca do limite não executa as etapas de WebSocket e rate limit. O teste não cobre ingestão MQTT, entrega de novas medições por WebSocket ou renderização em muitos navegadores. O proxy opcional exige frontend e backend locais disponíveis; em `next dev`, serve para verificar a integração.

A validação do RNF03 com maior volume de dados depende de uma base descartável populada para esse fim. O banco compartilhado não foi alterado para gerar dados de teste.
