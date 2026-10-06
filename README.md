# AgriTech — Backend

Backend monolítico modular que reúne usuários, parâmetros/sensores, estações/monitoramento e alertas/motor de regras. Uma aplicação Fastify, um processo Node 24 e um pool PostgreSQL atendem todos os domínios.

O frontend Next.js, a recepção Python, MQTT, Redis e o repositório BANCO permanecem separados. A migração não altera o schema de produção nem o protocolo do datalogger.

## Executar localmente

Requisitos: Node 24 e PostgreSQL com o schema existente do API-DSM-4-BANCO.

```bash
npm ci
cp .env.example .env
# Configure DATABASE_URL em .env.
npm run dev
```

Para executar o artefato compilado:

```bash
npm run build
npm start
```

A API escuta em `http://localhost:3000`. `/health`, `/api/health` e `/api/v1/health` retornam `{"status":"ok","rules_engine":false}` quando o motor está desligado. `/` identifica o backend.

## Organização

```text
src/
  app.ts                  composição dos módulos e buildApp(options)
  index.ts                inicialização HTTP e motor de regras
  lifecycle.ts            encerramento HTTP → motor → pool
  config/                 ambiente, pool PostgreSQL e Zod
  errors/                 erro comum e handlers por contrato
  shared/                 schemas de paginação e tipos compartilhados
  modules/
    users/                usuários, credenciais e hashes de senha
    roles/                cargos
    sensor-types/         tipos de sensor e calibração
    sensors/              sensores vinculados às estações
    stations/             estações, propriedades e status
    monitoring/           visão geral e séries de leituras
    alerts/               regras e reconhecimento de alertas
    rules-engine/         avaliação de leituras e checkpoint
```

Cada módulo mantém controllers, schemas, serviços e repositórios próprios. `buildApp(options)` aceita repositórios, relógio, motor e pool para testes. Com um pool explicitamente fornecido, os repositórios padrão usam esse pool; sem ele, os módulos de parâmetros mantêm seus repositórios em memória no ambiente `test`. O bootstrap inicia o motor; construir uma aplicação em teste não inicia processamento automático.

## APIs e compatibilidade

| Recurso                 | Rotas                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Usuários e cargos       | `/api/users`, `/api/roles`                                                                                                 |
| Tipos e sensores        | `/api/sensor-types`, `/api/sensors`                                                                                        |
| Estações e propriedades | `/api/stations`, `/api/stations/properties`, `/api/properties`                                                             |
| Status e monitoramento  | `/api/stations/:id/status`, `/api/stations/overview`, `/api/stations/readings/series`, `/api/stations/:id/readings/series` |
| Configurações e alertas | `/api/alerts/config`, `/api/alerts/triggered`, `/api/alerts/triggered/:id/acknowledge`                                     |
| Operação do motor       | `POST /internal/rules-engine/run`                                                                                          |

CRUD, métodos, payloads, paginação e formatos de erro continuam iguais aos serviços de origem. Tipos e sensores também aceitam os aliases sem prefixo, com `/v1` e com `/api/v1`. O CORS desses recursos permanece encapsulado no módulo de parâmetros.

Os healthchecks foram unificados e as portas antigas 3001, 3002 e 3005 deixaram de existir. O frontend continua chamando URLs relativas; o INFRA aponta seus quatro destinos de build para o mesmo backend, sem modificar seu código.

## Variáveis de ambiente

| Variável                            | Padrão        | Uso                            |
| ----------------------------------- | ------------- | ------------------------------ |
| `NODE_ENV`                          | `development` | Ambiente da aplicação          |
| `PORT`                              | `3000`        | Porta HTTP                     |
| `DATABASE_URL`                      | obrigatório   | Única conexão PostgreSQL       |
| `STATION_OFFLINE_THRESHOLD_MINUTES` | `10`          | Limite para estação Offline    |
| `RULES_ENGINE_ENABLED`              | `false`       | Ativa o agendamento do motor   |
| `RULES_ENGINE_INTERVAL_MS`          | `15000`       | Intervalo entre ciclos         |
| `RULES_ENGINE_BATCH_SIZE`           | `500`         | Leituras por lote, máximo 5000 |

O motor fica desligado por padrão para não avançar o checkpoint do banco compartilhado durante desenvolvimento. O Compose o habilita e usa intervalo de 5000 ms. A rota manual permanece disponível quando um motor está anexado, mesmo sem agendamento, e retorna 409 durante um ciclo concorrente.

O pool preserva timestamps sem fuso como UTC, IDs bigint numéricos e o listener de falhas de conexões ociosas. Transações, checkpoint e índices de prevenção de duplicidade continuam seguindo o modelo existente. Redis e MQTT são utilizados pelos processos Python; o backend lê o PostgreSQL e não cria clientes adicionais para esses serviços.

## Verificação

```bash
npm run lint
npm run format
npm run typecheck
npm test
npm run build
```

As integrações SQL só executam quando `TEST_DATABASE_URL` está definida e usam schemas temporários. Aponte exclusivamente para um PostgreSQL descartável:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/agritech_test npm run test:coverage
```

No CI, PostgreSQL 16 é criado para essa finalidade. O gate exige no mínimo 80% de linhas, incluindo os repositórios PostgreSQL. O pipeline também audita vulnerabilidades críticas e compila a imagem Docker, sem push ou deploy.

## Docker e implantação

A implantação completa e o teste MQTT estão no [API-DSM-4-INFRA](https://github.com/Vulture-API/API-DSM-4-INFRA). O Dockerfile deste repositório compila o backend e instala somente dependências de produção na imagem final, executando como usuário `node`.

Publique os commits do BACKEND antes de publicar o gitlink correspondente do INFRA. O deploy e a reversão são manuais pelo Compose; não há configuração de Render.

- [Inventário dos serviços e contratos](docs/mapa-migracao.md)
- [Arquitetura e decisões](docs/arquitetura.md)
- [Verificação e aceite](docs/validacao.md)

A pasta local `confluence/` contém material para publicação e validação pelo time. Ela está ignorada pelo Git e pelo contexto Docker; sua publicação e o aceite do time são etapas externas.
