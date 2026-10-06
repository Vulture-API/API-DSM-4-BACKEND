# SCRUM-476 — Inventário da migração Node

Fonte: checkouts locais do INFRA em 2026-10-06. SCRUM-475 acompanha a migração completa.

| Serviço | Responsabilidade | Recursos HTTP | Acesso PostgreSQL | Revisão usada | Testes |
| --- | --- | --- | --- | --- | --- |
| USUARIO | Usuários, credenciais e cargos | /api/users; /api/roles | roles, users, credentials | `a493ea092c95bb6bf75a7f2aac9da1664840f532` | 7 arquivos |
| PARAMETROS | Tipos de sensor, calibração e sensores | /api/sensor-types; /api/sensors e aliases | sensor_types, sensors; referências a stations | `00fa8efcd509337f756a6a18516dab263d26c332` | 11 arquivos |
| ESTACOES | Estações, propriedades, status e monitoramento | /api/stations; /api/properties; overview e séries | stations, properties, readings, sensors, alertas | `70ab68d10099fa4088bd6f54f069dbc919b61e2c` | 13 arquivos |
| ALERTAS | Regras, alertas disparados, reconhecimento e processamento | /api/alerts/config; /api/alerts/triggered; /internal/rules-engine/run | alert_configs, triggered_alerts, readings, processing_checkpoints | `8ca070f291c3981d7d29a7daa97a57c3a3e354df` | 7 arquivos |

## Comunicação e integrações

- As quatro APIs usam o mesmo PostgreSQL. Não existem chamadas HTTP entre elas, nem clientes MQTT/Redis em seu código Node.
- Dependências de usuários/cargos, sensores/estações/tipos e regras/sensores são verificadas pelos repositórios SQL e pelas FKs existentes.
- O motor consulta leituras por ID crescente, grava alertas e só então avança `rules_engine_last_reading_id`; índices únicos impedem duplicação.
- Estação/datalogger → tópico MQTT `estacoes/<MAC>/dados` → recepção Python → Redis Stream → persistidor Python → PostgreSQL → APIs → frontend.
- Payload MQTT: `estacao_id` (MAC), `unix_time` e campos numéricos usando `local_identifier` dos sensores.
- O frontend usa URLs relativas e rewrites definidos no build; o INFRA define os quatro destinos de API.
- O simulador consulta estações, sensores e tipos por HTTP e publica MQTT. Continua separado.

## Contratos a preservar

- Usuários: CRUD `/api/users`, cargos `GET /api/roles`.
- Parâmetros: CRUD de `/sensor-types` e `/sensors`, também disponíveis sob `/v1`, `/api` e `/api/v1`.
- Estações: CRUD `/api/stations`, `/api/stations/properties`, `/api/properties`, `/:id/status`, `/overview`, `/readings/series` e `/:id/readings/series`.
- Alertas: CRUD `/api/alerts/config`, listagem `/api/alerts/triggered`, `PUT /api/alerts/triggered/:id/acknowledge`.
- Operação: `POST /internal/rules-engine/run` mantém respostas 200, 409 (ocupado) e 503 (motor ausente).
- Erros de usuários/parâmetros usam códigos numéricos e `details`; estações/alertas usam `statusCode`, códigos textuais e `errors` em validação. Handlers por domínio preservam os envelopes.
- Healthchecks serão unificados em `/health`, `/api/health`, `/api/v1/health`, com `status: "ok"` e `rules_engine`. `/` identificará o monolito.

## Configuração e cuidados da migração

- Ambiente central: `NODE_ENV`, `PORT` (3000), `DATABASE_URL`, `STATION_OFFLINE_THRESHOLD_MINUTES` e `RULES_ENGINE_*`.
- Preservar parser UTC de timestamp, parser numérico de bigint, transações de credenciais e listener de falhas do pool.
- USUARIO e PARAMETROS estão em revisões locais mais recentes que os gitlinks do INFRA; a migração incorpora essas revisões sem resetá-las.
- O `package.json` de PARAMETROS contém marcadores de merge e dois objetos JSON. O BACKEND terá manifesto próprio válido; o legado não será corrigido.
- As 38 suítes incluem duplicatas de testes de infraestrutura compartilhada. Consolidar essas duplicatas sem remover cobertura de regras de negócio.
- Frontend, Python e BANCO ficam fora da consolidação. Schema e migrations continuam no BANCO; não aplicar migrations ou seeds no banco externo durante validação.
- Os quatro submódulos Node serão retirados do INFRA depois da cópia e validação. Seus históricos permanecem nos repositórios originais.
- Deploy manual por Docker Compose. Não configurar Render ou publicar/deployar automaticamente.
