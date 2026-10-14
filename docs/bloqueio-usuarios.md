# SCRUM-433 — Bloqueio e desbloqueio de acesso dos usuários

O acesso usa o campo `users.active`, presente no modelo de `confluence/`, no cadastro de usuários e no banco de desenvolvimento. `true` significa acesso habilitado; `false` significa bloqueado. O campo já possui `NOT NULL DEFAULT true`, portanto esta entrega não requer migração.

## Contrato HTTP

```http
PATCH /api/users/2/access
Authorization: Bearer <token-do-operador>
Content-Type: application/json

{"active": false}
```

Para desbloquear, enviar `{"active": true}` à mesma rota. A operação retorna 200 com o usuário atualizado no formato existente: `{ id, role_id, name, email, active, created_at }`. Repetir uma operação com o estado atual também retorna 200.

- O corpo aceita somente `active`, obrigatório e booleano JSON. Strings como `"false"`, valores nulos e campos adicionais retornam 400.
- O ID deve ser um inteiro entre 1 e 2147483647. IDs inválidos retornam 400.
- Usuários inexistentes ou sem a credencial necessária para exposição pelo CRUD retornam 404, sem alteração de estado.
- A rota sempre exige autenticação JWT e `users.update`, independentemente de `ACCESS_CONTROL_ENABLED`.
- Autenticação ausente/inválida ou operador bloqueado retorna 401; falta da permissão retorna 403. Sem `JWT_SECRET` configurado, retorna 503.
- A limitação de requisições permanece antes da autorização e da escrita; excesso retorna 429 com `Retry-After`.

Erros seguem o envelope dos usuários, `{ code, message, details }`. Falhas inesperadas retornam 500, preservando o tratamento existente.

## Persistência e efeitos do bloqueio

O repositório executa um único `UPDATE` parametrizado que modifica somente `active`. A alteração é persistida no PostgreSQL e aparece na listagem, consulta individual e autenticação subsequentes. Nome, perfil, e-mail, hash de senha, data de criação e concessões do perfil permanecem preservados. Alterações concorrentes de nome/perfil não são sobrescritas pela operação de acesso.

O login consulta o estado atual e rejeita usuários bloqueados com a mesma resposta 401 utilizada para credenciais inválidas. Um JWT emitido antes do bloqueio também é rejeitado nas próximas chamadas protegidas, pois cada autorização consulta novamente o usuário ativo no banco.

Com o controle de acesso ativo, o WebSocket valida o estado antes do upgrade e em cada ciclo do broadcaster. Bloquear um usuário encerra sua conexão protegida com código 1008 antes de novos envios autorizados; uma nova abertura enquanto bloqueado recebe 401. Após desbloquear, o usuário pode efetuar login e abrir uma nova conexão. Tokens anteriores ainda válidos voltam a funcionar conforme o estado atual e as permissões do perfil.

O cadastro completo continua disponível por `PUT /api/users/:id`, incluindo o campo `active` já existente. A nova rota permite controlar apenas o acesso, sem reenviar nome e perfil.

## Configuração de proteção

Configure `JWT_SECRET` para usar a nova rota. A transição da SCRUM-432 foi preservada: APIs antigas exigem autorização quando `ACCESS_CONTROL_ENABLED=true`; em modo legado, elas continuam públicas. Bloqueio é aplicado no login e em todas as funcionalidades protegidas. Para proteger todo o conjunto de APIs e o WebSocket, integre o frontend com autenticação e ative a flag conforme [Permissões e autenticação](permissoes.md).

A nova rota de acesso, `/api/auth/me` e as APIs de permissões permanecem protegidas mesmo com a flag desligada. Um usuário bloqueado não consegue desbloquear seu próprio acesso por essa rota; a ação deve ser realizada por outro usuário ativo com `users.update`.

## Testes e evidências em 2026-10-10

```bash
npm run lint
npm run format
npm run typecheck
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/agritech_test npm run test:coverage
npm run build
```

Os testes unitários e HTTP cobrem bloqueio/desbloqueio repetidos, preservação do cadastro e credenciais, validações, inexistência, falha do banco, autenticação, permissão e limitação de requisições. As integrações PostgreSQL verificam persistência real, ausência de mutação de usuários sem credencial, atualização concorrente do cadastro, login, JWTs existentes e encerramento/reconexão do WebSocket. O fluxo HTTP também foi exercitado com ambos os estados da flag.

| Verificação                     | Resultado                                        |
| ------------------------------- | ------------------------------------------------ |
| Suíte completa com PostgreSQL   | 54 arquivos, 408 testes aprovados, nenhum pulado |
| Cobertura global de linhas      | 96,04%, acima do gate de 80%                     |
| Lint, formatação, tipos e build | Aprovados                                        |

Commits funcionais: `4494aad` (persistência e serviço) e `00e1296` (rota protegida e integração).

As integrações usaram dados exclusivos em schema temporário com UUID, removido ao final, no banco de desenvolvimento autorizado. Os usuários existentes do banco compartilhado não foram bloqueados ou desbloqueados. Esta entrega contém commits locais; push, deploy e CI remoto são etapas posteriores.
