# SCRUM-434 — Autorização das funcionalidades

Referência: [SCRUM-434 no VultureAPI](https://vultureapi.atlassian.net/browse/SCRUM-434).

## Validação de acesso

O JWT identifica o usuário por `sub`. Cada requisição protegida consulta novamente o usuário ativo, seu perfil e as permissões atuais em `role_permissions`. Nome/ID do perfil e concessões enviadas no token não atribuem direitos. Troca de perfil, revogação e bloqueio afetam o próximo acesso com o mesmo token.

A ordem de execução permanece: limite de requisições → autenticação e autorização → validação da entrada → operação de negócio. Requisições recusadas não executam consultas nem alterações de negócio. A consulta de autenticação continua necessária para verificar o estado atual do usuário.

As políticas de rota aceitas são:

```ts
{ public: true }                              // acesso público
{ always: true }                              // usuário autenticado e ativo
{ permission: "users.read" }                  // permissão exigida com a flag ativa
{ always: true, permission: "users.update" }  // permissão exigida em ambos os modos
{ permission: "monitoring.read", websocket: true }
```

O tipo `AccessPolicy` representa essas alternativas. O registro também valida políticas em runtime, inclusive quando vêm de código JavaScript sem tipagem. Política ausente, vazia, desconhecida ou contraditória impede o registro da rota, mesmo com a proteção legada desligada. Exemplos rejeitados: `{}`, `{ always: false }`, `{ public: true, permission: "users.read" }`, códigos fora do catálogo e flags que não sejam booleanas. `websocket` permite a autenticação por cookie da conexão, sem substituir a exigência de autenticação/permissão.

## Matriz de permissões

| Funcionalidade                                           | Permissão                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| CRUD de usuários                                         | `users.read`, `users.create`, `users.update`, `users.delete`                                 |
| CRUD de perfis                                           | `roles.read`, `roles.create`, `roles.update`, `roles.delete`                                 |
| CRUD de estações e consulta de status                    | `stations.read`, `stations.create`, `stations.update`, `stations.delete`                     |
| CRUD de sensores e tipos de sensor                       | `sensors.*` e `sensor-types.*`, com ações `read`, `create`, `update`, `delete`               |
| Consulta de propriedades                                 | `properties.read`                                                                            |
| Dados atuais, séries, histórico, estatísticas e previsão | `monitoring.read`                                                                            |
| WebSocket de dados atuais                                | `monitoring.read`                                                                            |
| CRUD de configurações de alerta                          | `alert-configs.read`, `alert-configs.create`, `alert-configs.update`, `alert-configs.delete` |
| Consulta e reconhecimento de alertas disparados          | `triggered-alerts.read`, `triggered-alerts.acknowledge`                                      |
| Consulta e resolução de ocorrências                      | `occurrences.read`, `occurrences.resolve`                                                    |
| Execução manual dos verificadores                        | `rules-engine.run`, `occurrences.run`                                                        |
| Catálogo de permissões                                   | `permissions.read`, sempre protegido                                                         |
| Consulta de permissões de um perfil                      | `roles.read`, sempre protegido                                                               |
| Substituição das permissões de um perfil                 | `roles.permissions.update`, sempre protegido                                                 |
| Bloqueio/desbloqueio de usuário                          | `users.update`, sempre protegido                                                             |
| Identidade em `/api/auth/me`                             | Usuário autenticado e ativo, sempre protegido                                                |

GET e HEAD usam a permissão de consulta; POST, PUT, PATCH e DELETE usam a ação explícita de cada funcionalidade. Os aliases de sensores/tipos (`/`, `/v1`, `/api`, `/api/v1`) e de histórico (`/readings`, `/api/readings`, `/api/v1/readings`) conservam as mesmas políticas. A matriz completa por método e caminho está em [`access-policy-matrix.ts`](../src/modules/auth/testing/access-policy-matrix.ts), independente dos metadados lidos das rotas em teste.

Login, identificação do backend, healthchecks e preflight de parâmetros continuam públicos. O login exige configuração de JWT e valida as credenciais existentes.

## Contrato de respostas 401/403

Todos os módulos utilizam o mesmo corpo para `UnauthorizedError` e `ForbiddenError`, inclusive antes do upgrade WebSocket. O status HTTP acompanha o `code` numérico:

```json
{
  "code": 401,
  "message": "Invalid credentials or authentication token.",
  "details": []
}
```

401 indica ausência de autenticação válida, token inválido/expirado ou usuário inexistente/bloqueado. O login também usa essa resposta para credenciais inválidas.

```json
{
  "code": 403,
  "message": "You do not have permission to perform this action.",
  "details": []
}
```

403 indica usuário autenticado e ativo sem a permissão exigida. O corpo não contém stack, permissões, informações do banco ou detalhes internos, inclusive em desenvolvimento. HEAD retorna o status correspondente, sem corpo.

Esta entrega altera o envelope 401/403 dos módulos que anteriormente devolviam `statusCode` e `code` textual. Consumidores desses erros devem usar o status HTTP ou o `code` numérico. Respostas de sucesso e os demais erros, incluindo validação, conflitos, 429, falhas de banco e autenticação não configurada (503), mantêm seus contratos por domínio.

No WebSocket protegido, a autorização é verificada antes do upgrade e novamente nos ciclos do broadcaster. Revogação, bloqueio, remoção do usuário, expiração ou falha de autorização encerram a assinatura com código 1008. REST continua exigindo Bearer; o cookie `agritech_ws_token` é aceito somente na rota WebSocket.

## Configuração e compatibilidade

`ACCESS_CONTROL_ENABLED=false` continua sendo o padrão. As APIs anteriores permanecem no modo legado até a ativação explícita; identidade, permissões e bloqueio/desbloqueio continuam protegidos em ambos os modos. Com a flag ativa, todo o conjunto de rotas de negócio exige autenticação e as permissões da matriz.

`JWT_SECRET` deve conter ao menos 32 caracteres e permanecer fora do Git. Com a flag ativa, a ausência do segredo impede a inicialização. A ativação no ambiente integrado segue a [sequência da SCRUM-432](permissoes.md#configuração-e-sequência-de-ativação), após integrar autenticação no frontend.

Não há novos endpoints, permissões, migrations ou alterações no frontend/INFRA. Esta entrega não ativa a flag, modifica bancos compartilhados ou realiza deploy.

## Testes e evidências — 16/10/2026

A suíte confere **157 pares distintos de método/caminho**, incluindo HEAD, contra a matriz independente. São 172 entradas emitidas pelo registro do Fastify, considerando também as variações HEAD com barra final. Tentativas sem token, com token inválido, sem concessão e com usuário bloqueado verificam os corpos exatos, precedência sobre entrada inválida e ausência de operações de negócio. Testes com a flag ligada/desligada exercitam leituras permitidas nos módulos e a proteção permanente das APIs de identidade, permissões e acesso.

Os testes de políticas verificam 19 entradas inválidas em ambos os modos e sete configurações válidas. Os três handlers são verificados também em desenvolvimento, garantindo que detalhes internos não entrem nas recusas e que outros erros mantenham o contrato.

A regressão reutiliza os testes PostgreSQL da SCRUM-438 para concessões, troca de perfil e bloqueio com sessões existentes, além das integrações de autenticação, permissões e WebSocket. Banco PostgreSQL 18.6 descartável e schemas temporários isolam a execução; a conferência final encontrou zero schemas de teste remanescentes. Node.js utilizado: 24.19.0.

| Verificação                                            | Resultado                                                               |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| Suíte completa com PostgreSQL                          | 71 arquivos, 589 testes aprovados, zero falhas e zero pulados           |
| Suítes diretamente alteradas/adicionadas nesta entrega | 43 testes aprovados em quatro arquivos                                  |
| Aceite PostgreSQL da SCRUM-438 reutilizado             | 16 testes aprovados                                                     |
| Regressão de autorização WebSocket                     | 8 testes aprovados, além da integração PostgreSQL de bloqueio/reconexão |
| Cobertura de linhas                                    | 96,93% (1737/1792), acima do gate de 80%                                |
| Cobertura de branches                                  | 89,66% (963/1074)                                                       |
| Lint, formatação, tipos, build e tipos após build      | Aprovados                                                               |

A [evidência JSON](evidencias/scrum-434.json) contém os totais, cobertura e resultados individuais dos testes diretamente relacionados à entrega, extraídos dos reporters Vitest/V8. O CI existente executa essas suítes com PostgreSQL 16; sua execução remota não foi realizada nesta validação local.

Para reproduzir, defina `TEST_DATABASE_URL` apontando exclusivamente para um PostgreSQL descartável e execute:

```bash
# Testes diretamente relacionados à entrega.
npx vitest run src/modules/auth/access-control.test.ts \
  src/modules/auth/access-policy.test.ts \
  src/modules/auth/authorization.routes.test.ts \
  src/errors/handlers/authorization.test.ts --reporter=verbose

# Regressão e cobertura, incluindo as integrações PostgreSQL e WebSocket.
npm run test:coverage
npm run lint
npm run format
npm run typecheck
npm run build
npm run typecheck
```

Sem `TEST_DATABASE_URL`, as integrações são puladas e a execução não comprova o aceite PostgreSQL. O Atlassian permanece somente para leitura; nenhum status, comentário ou ticket foi alterado.
