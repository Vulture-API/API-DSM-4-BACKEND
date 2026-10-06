# SCRUM-475 — Evidências e checklist de aceite

## Validação executada em 2026-10-06

Código validado: BACKEND `c247eb9` (os commits posteriores desta entrega consolidam lockfile, CI e documentação sem mudar as funcionalidades). O runtime foi exercitado com os serviços separados e um PostgreSQL 16 descartável, inicializado pelo schema/seed do BANCO.

| Verificação                                         | Resultado                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Lint, formatação, TypeScript e build                | Aprovados                                                                                                  |
| Testes unitários e integração SQL                   | 35 arquivos, 239 testes aprovados, sem testes pulados com TEST_DATABASE_URL                                |
| Cobertura de linhas                                 | 94,32%; gate de 80% aprovado, incluindo repositórios PostgreSQL                                            |
| Auditoria npm com nível critical                    | Aprovada, sem vulnerabilidades críticas; permanecem 7 avisos altos e 2 moderados herdados das dependências |
| Build Docker do backend, frontend e recepção Python | Aprovado                                                                                                   |
| E2E com frontend direto em :3010                    | 51 verificações aprovadas, zero falhas                                                                     |
| E2E pelo Nginx em :8080                             | 51 verificações aprovadas, zero falhas                                                                     |
| Compose e healthchecks                              | Backend, frontend, Redis, MQTT, PostgreSQL e Nginx saudáveis                                               |
| Simulador                                           | Testes e checagem de sintaxe aprovados                                                                     |
| Script Bash                                         | Sintaxe validada                                                                                           |

O E2E cadastra usuário, tipo, estação, sensor e regra; envia leitura MQTT; aguarda persistência e status Online; verifica alerta e reconhecimento; testa páginas/proxies e remove seus registros. Os testes de serviço cobrem checkpoint, duplicidade, falha/reagendamento e ciclos concorrentes. Testes do monolito verificam aliases, CORS encapsulado, erros por domínio, pool e encerramento com motor em andamento.

O healthcheck original do Nginx tentava localhost/IPv6 contra um listener IPv4. Foi corrigido para 127.0.0.1; o E2E pelo proxy passou após a correção.

## Critérios entregues no código

- [x] Quatro APIs Node consolidadas em uma aplicação, sem executar os microsserviços antigos.
- [x] Oito módulos internos, ambiente central, um pool e motor no mesmo processo.
- [x] APIs, aliases, regras de negócio e envelopes de erro preservados; healthchecks unificados.
- [x] Fluxo MQTT → Python → Redis → PostgreSQL → monolito validado com mensagens simuladas.
- [x] Frontend integrado exclusivamente pelos destinos de build do INFRA.
- [x] Docker Compose, CI, scripts e gitlinks atualizados.
- [x] README, inventário e diagrama arquitetural versionados.
- [x] Material para Confluence preparado em pasta ignorada pelo Git.
- [x] Frontend, Python e BANCO preservados sem alteração de código/revisão.

## Etapas externas e limites

- [ ] Publicar commits do BACKEND antes do INFRA para disponibilizar os objetos referenciados pelos gitlinks.
- [ ] Executar os workflows no GitHub após publicação; os checks locais não representam uma execução remota.
- [ ] Validar o script PowerShell em Windows; pwsh não está instalado neste ambiente.
- [ ] Confirmar o fluxo com estação/datalogger físico; esta validação utilizou mensagens MQTT simuladas.
- [ ] Publicar a documentação na página técnica do Confluence e registrar aceite do time.
- [ ] Realizar implantação/reversão no ambiente do time. Não houve push, deploy externo nem acesso ao PostgreSQL externo nesta tarefa.

Os commits locais usam as chaves SCRUM-476 (inventário), SCRUM-477 (base), SCRUM-478 (funcionalidades/testes), SCRUM-479 (infra/CI/docs) e SCRUM-475 (consolidação/aceite). Todos estão na branch codex/scrum-475-monolito.
