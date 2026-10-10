# SCRUM-432 — Permissões por perfil e autenticação

O backend associa permissões a `roles` e usa o perfil atual de cada usuário para autorizar operações. Não há permissões implícitas pelo nome do perfil, IDs fixos ou filtros de propriedade/estação nesta entrega. A migration `015_role_permissions.sql` está no API-DSM-4-BANCO.

## Catálogo e persistência

O catálogo versionado contém 31 códigos, no formato `recurso.ação`:

| Recursos                                                                 | Ações                                |
| ------------------------------------------------------------------------ | ------------------------------------ |
| `users`, `roles`, `stations`, `sensors`, `sensor-types`, `alert-configs` | `read`, `create`, `update`, `delete` |
| `properties`, `monitoring`, `permissions`                                | `read`                               |
| `triggered-alerts`                                                       | `read`, `acknowledge`                |
| `roles.permissions`                                                      | `update`                             |
| `rules-engine`                                                           | `run`                                |

`permissions` armazena código e descrição; `role_permissions` usa chave composta por perfil/código. A FK de perfil remove suas associações em cascata, mas a FK existente dos usuários continua bloqueando a exclusão do perfil enquanto houver vínculos. Não há API para criar permissões arbitrárias.

A instalação inicial concede todo o catálogo ao perfil existente chamado `Administrador`. Outros perfis e perfis criados pelo CRUD começam sem concessões. Depois da instalação, renomear o perfil não altera seus direitos. Reaplicar a migration ou o seed não restaura concessões revogadas. Atualizar nome/descrição de um perfil também preserva suas permissões.

## APIs

| Método e rota                    | Corpo/resposta                                                                                   | Acesso                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------- |
| `POST /api/auth/login`           | Recebe `{ email, password }`; retorna `{ access_token, token_type: "Bearer", expires_in: 3600 }` | Público, exige configuração JWT |
| `GET /api/auth/me`               | Retorna campos públicos do usuário e `permissions` atuais                                        | JWT válido e usuário ativo      |
| `GET /api/permissions`           | Array de `{ code, description }`, ordenado por código                                            | `permissions.read`              |
| `GET /api/roles/:id/permissions` | `{ role_id, permissions: [...] }`                                                                | `roles.read`                    |
| `PUT /api/roles/:id/permissions` | Recebe `{ permissions: [...] }`; retorna `{ role_id, permissions: [...] }`                       | `roles.permissions.update`      |

O `PUT` substitui todo o conjunto em transação, bloqueando o perfil para serializar escritas concorrentes. `[]` remove todas as concessões. Códigos repetidos/desconhecidos, corpo inválido ou IDs fora do intervalo integer positivo retornam 400 sem modificar associações. Perfil inexistente retorna 404.

Todas as respostas de criação, listagem, consulta e edição de perfis incluem `permissions: string[]`, em ordem por código. A listagem busca concessões em lote, sem uma consulta adicional por perfil.

As APIs novas usam o envelope `{ code, message, details }`: 401 para credenciais/token inválidos, usuário inexistente/inativo ou autenticação ausente; 403 para falta da permissão; 503 quando JWT não está configurado; 500 para falhas inesperadas. Os demais módulos preservam seus envelopes atuais.

## Autenticação e autorização

O login normaliza o e-mail e verifica os hashes scrypt existentes com comparação constante. Senha incorreta, conta desconhecida/inativa e hash inválido recebem a mesma resposta 401. Hashes e tokens não são incluídos nas respostas de identidade nem nos commits.

O JWT usa HS256, emissor `agritech-backend`, audiência `agritech-api`, validade de uma hora e `sub` com o ID do usuário. Cada acesso protegido consulta novamente o usuário ativo, seu perfil e suas concessões. A autorização não confia em permissões ou perfil fornecidos no token. Revogação, mudança de perfil e inativação afetam o próximo acesso usando o mesmo token.

REST aceita exclusivamente `Authorization: Bearer <token>`. O login também fornece o cookie `agritech_ws_token`, restrito a `/api/stations/current/ws`, com `HttpOnly`, `SameSite=Lax` e `Secure` em produção, para clientes WebSocket de navegador. O cookie não autentica rotas REST.

O WebSocket verifica `monitoring.read` antes do upgrade e revalida acesso antes dos envios, a cada ciclo do broadcaster, mesmo quando não há leituras novas. Revogação, inativação, remoção do usuário, expiração ou falha de autorização encerram a conexão com código 1008 e suspendem a assinatura.

Quando o controle das rotas existentes está ativo:

- Consultas e HEAD usam `read`; POST, PUT e DELETE usam suas ações explícitas. Todos os aliases de parâmetros possuem a mesma política.
- Monitoramento e WebSocket usam `monitoring.read`; consultas de propriedades usam `properties.read`.
- O reconhecimento de alertas usa `triggered-alerts.acknowledge` e registra o usuário autenticado, ignorando identificação enviada pelo cliente. O corpo pode ser `{}`.
- A execução manual do motor exige `rules-engine.run`; sua execução automática permanece interna.
- Login, identificação do backend, healthchecks e preflight permanecem públicos. A aplicação recusa registro de rota sem política explícita.

## Configuração e sequência de ativação

A limitação de requisições usa `@fastify/rate-limit` em `onRequest`, antes das consultas de autorização e dos handlers. `RATE_LIMIT_MAX=300` define o orçamento compartilhado por IP entre rotas, métodos, aliases e abertura de WebSockets. O login tem orçamento separado com `LOGIN_RATE_LIMIT_MAX=10`. Ambos usam `RATE_LIMIT_WINDOW_MS=60000`, e valores inválidos impedem a inicialização. Login bem-sucedido, falho e corpos inválidos consomem esse orçamento.

O excesso retorna 429 com `Retry-After` e cabeçalhos `X-RateLimit-*`, preservando o envelope de erro de cada módulo. Identificação do backend, healthchecks e preflight não consomem orçamento. A proteção funciona também com controle de acesso desligado. O contador fica em memória por processo, com cache limitado; reiniciar o backend reinicia as janelas. O backend utiliza o IP da conexão e não confia em `X-Forwarded-For`; atrás de um proxy, seus clientes compartilham o orçamento do endereço desse proxy. A configuração de confiança no proxy e um contador distribuído exigem ajuste específico antes de escalar para múltiplas instâncias.

`ACCESS_CONTROL_ENABLED=false` é o padrão escolhido para preservar as chamadas atuais do frontend. Nessa fase, as APIs anteriores mantêm seu comportamento, inclusive o corpo legado `acknowledged_by` no reconhecimento de alertas. As novas APIs de permissões e `/api/auth/me` permanecem protegidas independentemente da flag.

`JWT_SECRET` não tem valor padrão e deve conter pelo menos 32 caracteres aleatórios, configurados fora do Git. Sem ele, login e APIs novas protegidas retornam 503; a aplicação ainda funciona em modo legado. Com `ACCESS_CONTROL_ENABLED=true`, a inicialização falha se o segredo estiver ausente ou inválido.

Sequência de ativação:

1. Aplicar a migration 015 do BANCO antes de executar o backend atualizado. Em instalações novas, `npm run db:setup` aplica schema, migration e seed na ordem correta.
2. Configurar `JWT_SECRET` no ambiente e manter `ACCESS_CONTROL_ENABLED=false` durante a integração. Utilizar um usuário ativo com credencial existente e perfil Administrador para configurar os demais perfis.
3. Integrar o frontend com login, Bearer nas chamadas REST, novas rotas e cookie no WebSocket. Atualizar seus proxies para `/api/auth`, `/api/permissions` e subrotas de `/api/roles`.
4. Validar os perfis configurados, definir `ACCESS_CONTROL_ENABLED=true` e reiniciar o backend. Para voltar ao comportamento legado, desativar a flag e reiniciar; as associações permanecem gravadas.

O código do frontend e do Compose permanece como estava. Não foram criados commits no INFRA; a atualização versionada dos gitlinks fica para após a publicação dos commits de BACKEND e BANCO. Publicação e ativação no ambiente integrado são etapas posteriores. Não há refresh token ou recuperação de senha nesta implementação.

## Testes e evidências em 2026-10-10

```bash
npm ci
npm run lint
npm run format
npm run typecheck
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/agritech_test npm run test:coverage
npm run build
```

As integrações criam schemas temporários exclusivos e os removem ao final. O teste do BANCO verifica migration/seed repetidos, concessões iniciais sem IDs fixos, preservação de revogações e integridade das FKs. O backend cobre associações, rollback, concorrência, perfis, login, tokens, todos os grupos de rotas e aliases, ambos os estados da flag e revogação WebSocket. Use conexão direta no PostgreSQL para o isolamento por `search_path`.

| Verificação                                    | Resultado                                        |
| ---------------------------------------------- | ------------------------------------------------ |
| Suíte completa do backend com PostgreSQL       | 50 arquivos, 369 testes aprovados, nenhum pulado |
| Migration e seed do BANCO em schema isolado    | Aprovados                                        |
| Cobertura global de linhas                     | 95,73%, acima do gate de 80%                     |
| Lógica executável de autenticação e permissões | 100% de linhas e branches                        |
| Lint, formatação, tipos e build                | Aprovados                                        |

Commits funcionais do backend: `edcf4f1` (autenticação), `8c5aa79` (associações) e `d25d3a6` (autorização). Migration do BANCO: `d218b74`.

A migration foi aplicada ao banco de desenvolvimento autorizado. A consulta após aplicação confirmou 31 concessões para Administrador e zero para Gerente Agrícola/Cliente. A conferência final encontrou zero schemas remanescentes dos testes de autenticação, permissões e perfis. Não houve alteração de credenciais existentes, push, deploy ou execução do CI remoto.

### Correção do alerta de limitação de requisições

O alerta [Missing rate limiting](https://codeql.github.com/codeql-query-help/javascript/js-missing-rate-limiting/) motivou a adição do middleware e a ordem explícita dos hooks: limite → autorização → validação/handler. Os testes verificam que requisições excedentes não consultam credenciais, usuários ou recursos, incluindo HEAD e upgrades WebSocket; também cobrem orçamento compartilhado dos aliases, independência do login, isolamento de IPs, cabeçalhos de encaminhamento e reinício da janela.

Após a correção, a suíte completa com PostgreSQL aprovou 381 testes em 51 arquivos, sem testes pulados, com cobertura de linhas de 95,77%. Lint, formatação, tipos e build passaram. A análise CodeQL remota deverá executar após a publicação do commit; este resultado local não confirma o encerramento do alerta no GitHub.
