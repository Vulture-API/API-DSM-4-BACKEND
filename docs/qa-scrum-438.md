# SCRUM-438 — QA de perfis, permissões e autorização

Referência: [SCRUM-438 no VultureAPI](https://vultureapi.atlassian.net/browse/SCRUM-438). Execução local em 16/10/2026, na branch `test/SCRUM-438-qa-criar-testes-de-perfis-permissoes-e-autorizacao`.

## Escopo e ambiente

A suíte de aceite está em [`access-management.integration.test.ts`](../src/modules/auth/access-management.integration.test.ts). São 16 testes com a aplicação Fastify, JWT, verificação scrypt e repositórios PostgreSQL reais. As requisições usam `app.inject`, passando pelos hooks, validação, serviços, serialização e persistência, sem servidor HTTP externo e sem mocks de autenticação ou banco.

As alterações avaliadas passam exclusivamente pelas APIs. SQL prepara os dados e confere independentemente o estado persistido. Cada teste começa com dois perfis e três usuários: um operador com permissões explícitas e dois usuários compartilhando um perfil inicialmente sem permissões. IDs começam em 10 para perfis e 100 para usuários; o perfil sem direitos se chama `Administrador`, para detectar autorizações indevidas por nome ou ID fixo.

Ambiente: Node.js 24.19.0 e PostgreSQL 18.6 em contêiner descartável, exclusivo para esta execução, com porta vinculada a `127.0.0.1`. Schemas temporários isolam as suítes; o aceite usa UUID no nome do schema. A conferência após a execução encontrou **zero schemas de teste remanescentes**. O contêiner foi removido ao final.

O controle de acesso está explicitamente ativo (`accessControlEnabled: true`). O CI existente descobre a nova suíte por `npm run test:coverage` e já fornece `TEST_DATABASE_URL` usando PostgreSQL 16; essa execução remota não foi realizada nesta entrega.

## Cenários e critérios de aceite

Todos os cenários abaixo foram aprovados. Os identificadores aparecem nos nomes dos testes e na [evidência JSON](evidencias/scrum-438.json).

| ID               | Cenário                                   | Resultado esperado validado                                                                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QA-01            | Criação e edição de perfil                | Criação retorna 201, normaliza o nome e inicia sem concessões. Edição retorna 200, preserva ID, data e permissões; descrição omitida torna-se `null`. Consulta, listagem e SQL confirmam persistência.                                                                                                     |
| QA-02            | Associação e alteração de permissões      | Conceder, substituir e limpar permissões altera imediatamente `/auth/me` e os acessos de ambos os usuários do perfil, com os mesmos tokens; o operador de outro perfil mantém seu acesso. SQL confirma o conjunto exato.                                                                                   |
| QA-03            | Troca de perfil de usuário                | `PUT /api/users/:id` troca o perfil; o token existente perde `users.read` e recebe `roles.read`. O outro usuário do perfil original mantém seus direitos.                                                                                                                                                  |
| QA-04            | Bloqueio e desbloqueio                    | `PATCH /api/users/:id/access` repetido é idempotente. Bloqueado recebe 401 no login e em sessões existentes; desbloqueado volta a acessar com token anterior válido e com novo login. Cadastro, credenciais, perfil, concessões e acesso do outro usuário são preservados.                                 |
| QA-05 (7 testes) | Acesso com e sem permissão                | Criação, edição e consulta de perfis, consulta/alteração de concessões, catálogo e bloqueio exigem a permissão específica. Ausência de token retorna 401; perfil sem direitos ou com direito de outro recurso retorna 403, sem mutação no banco. Conceder somente o direito necessário permite a operação. |
| QA-06            | Tentativa de acesso por usuário bloqueado | Mesmo com as permissões necessárias, usuário bloqueado recebe 401 nas sete operações avaliadas e na tentativa de desbloquear a si próprio. Nenhum dado é alterado.                                                                                                                                         |
| QA-07 (3 testes) | Permissões inválidas                      | Código desconhecido, duplicado e valor nulo retornam 400; preservam integralmente os dados e o acesso já concedido.                                                                                                                                                                                        |
| QA-08            | Conflito de nome de perfil                | Criação e edição com nome duplicado retornam 409, preservando cadastro, concessões e acesso existente.                                                                                                                                                                                                     |

Isso cobre os nove itens do escopo da issue: criação e edição de perfil; associação e alteração de permissões; bloqueio e desbloqueio; acesso com e sem permissão; tentativa de acesso por usuário bloqueado.

A regressão completa também executa os testes existentes de tokens inválidos/expirados, aliases, rotas protegidas com a flag desligada, rollback e concorrência de concessões, além do encerramento e reconexão de WebSockets após bloqueio. As telas do frontend, o proxy Nginx e o deploy integrado não foram exercitados nesta execução.

## Reprodução

Use exclusivamente um PostgreSQL descartável. Exemplo de ambiente equivalente ao utilizado:

```bash
docker run --detach --rm --name scrum438-qa-postgres \
  --env POSTGRES_USER=postgres --env POSTGRES_PASSWORD=postgres \
  --env POSTGRES_DB=agritech_qa --publish 127.0.0.1:55438:5432 postgres:18-alpine
# Aguarde pg_isready indicar que o banco aceita conexões.
docker exec scrum438-qa-postgres pg_isready -U postgres -d agritech_qa
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55438/agritech_qa

# Aceite específico, com os cenários individuais.
npx vitest run src/modules/auth/access-management.integration.test.ts --reporter=verbose

# Regressão completa e cobertura.
npm run test:coverage
npm run lint
npm run format
npm run typecheck
npm run build
npm run typecheck

docker stop scrum438-qa-postgres
```

Sem `TEST_DATABASE_URL`, as integrações são puladas; uma execução assim não serve como evidência de aceite PostgreSQL. Com a variável definida, falhas de conexão reprovam a suíte.

## Evidências em 16/10/2026

| Verificação                       | Resultado                                                     |
| --------------------------------- | ------------------------------------------------------------- |
| Novos testes de aceite SCRUM-438  | 16 aprovados                                                  |
| Regressão completa com PostgreSQL | 68 arquivos, 549 testes aprovados, zero falhas e zero pulados |
| Cobertura de linhas               | 96,67% (1713/1772), acima do gate de 80%                      |
| Cobertura de branches             | 88,77% (925/1042)                                             |
| Lint, formatação, tipos e build   | Aprovados                                                     |
| Checagem de tipos após o build    | Aprovada                                                      |

A [evidência JSON](evidencias/scrum-438.json) foi extraída do reporter JSON do Vitest e do resumo V8 da execução completa. Contém os resultados individuais dos 16 testes, totais da regressão, versões utilizadas e cobertura. Os relatórios detalhados de cobertura são gerados em `coverage/`, pasta ignorada pelo Git.

## Falhas encontradas e tratamento

Não foram encontradas falhas funcionais de perfis, permissões ou autorização nos cenários executados. Duas falhas de configuração/preparo de validação foram corrigidas nesta entrega:

| Falha                                                     | Evidência e correção                                                                                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck carregava declarações antigas de `dist/`        | A configuração padrão incluía `.d.ts` gerados, causando declaração duplicada de `AccessPolicy` e erros em permissões novas. `tsconfig.json` agora exclui `dist`, `coverage` e `node_modules`. A checagem passou antes e depois do build.     |
| Testes de ocorrências deslocavam timestamps em três horas | Três testes falhavam no fuso `America/Sao_Paulo`, porque o preparo não carregava o parser UTC do bootstrap. A suíte agora importa a configuração real do banco; os cinco testes desse arquivo passaram sem alteração nas regras de produção. |

O Atlassian foi utilizado somente para leitura, conforme solicitado. As falhas de validação estão documentadas acima; o registro delas no Jira não foi realizado devido à restrição de escrita solicitada. Nenhum comentário, status ou ticket foi criado ou alterado.
