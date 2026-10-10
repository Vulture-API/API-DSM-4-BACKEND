# SCRUM-431 — Cadastro e gerenciamento de perfis de acesso

Perfis de acesso correspondem aos registros de `roles`, referenciados por `users.role_id`. A implementação segue o contrato e o modelo SQL de referência em `confluence/`, sem migração. O módulo mantém schemas Zod, controller, serviços e repositório PostgreSQL, com dependências injetáveis por `buildApp`.

## Contrato HTTP

| Método | Rota             | Resultado                                                         |
| ------ | ---------------- | ----------------------------------------------------------------- |
| GET    | `/api/roles`     | 200 com array de perfis, sem paginação, ordenado por ID crescente |
| POST   | `/api/roles`     | 201 com perfil criado                                             |
| GET    | `/api/roles/:id` | 200 com perfil encontrado                                         |
| PUT    | `/api/roles/:id` | 200 com perfil atualizado                                         |
| DELETE | `/api/roles/:id` | 204 sem corpo                                                     |

Criação e edição recebem o mesmo corpo:

```json
{
  "name": "Analyst",
  "description": "Consulta de relatórios"
}
```

- `name`: string obrigatória, de 1 a 50 caracteres após remover espaços externos. Nome vazio ou composto apenas de espaços retorna 400.
- `description`: string de até 255 caracteres, opcional ou nula. String vazia é aceita; omissão e `null` são gravados como `null`, inclusive na edição.
- `id` na URL: inteiro entre 1 e 2147483647. Valor inválido retorna 400.
- `id` e `created_at` são gerados pelo banco e preservados na edição.

As respostas de criação, consulta individual e edição seguem o formato:

```json
{
  "id": 4,
  "name": "Analyst",
  "description": "Consulta de relatórios",
  "created_at": "2026-10-10T12:00:00.000Z"
}
```

A data acima é ilustrativa. Datas retornadas pela API são serializadas em ISO UTC. A listagem vazia retorna `[]`.

## Unicidade, exclusão e erros

A restrição existente `UNIQUE(name)` decide a unicidade também em requisições concorrentes. A API preserva a caixa do nome: `Manager` e `manager` são distintos. Espaços externos são removidos antes da persistência, portanto enviar o mesmo nome com espaços externos também retorna conflito.

A exclusão usa a FK existente `users.role_id → roles.id ON DELETE RESTRICT`. Qualquer usuário vinculado bloqueia a operação, independentemente de seu estado ativo. O perfil permanece disponível para consulta e edição; não há remoção em cascata de usuários, desativação de perfis ou configuração de permissões nesta entrega.

| Status | Situação                                           | Mensagem                                                         |
| ------ | -------------------------------------------------- | ---------------------------------------------------------------- |
| 400    | Corpo ou ID inválido                               | `Invalid data`                                                   |
| 404    | Perfil inexistente na consulta, edição ou exclusão | `Role not found.`                                                |
| 409    | Nome duplicado na criação ou edição                | `A role with this name already exists.`                          |
| 409    | Exclusão de perfil vinculado a usuário             | `The role cannot be deleted because it is referenced by a user.` |
| 500    | Falha inesperada                                   | `Internal server error`                                          |

O envelope de erro segue o padrão dos usuários:

```json
{
  "code": 409,
  "message": "A role with this name already exists.",
  "details": []
}
```

Erros de validação incluem os detalhes em `details`. O repositório traduz SQLSTATE `23505` para conflito de nome e `23503`/`23001` para conflito de exclusão. O banco de desenvolvimento retornou `23001` para `ON DELETE RESTRICT`; ambos os códigos possuem cobertura unitária. Consulte o [catálogo de códigos PostgreSQL](https://www.postgresql.org/docs/18/errcodes-appendix.html).

## Testes e reprodução

```bash
npm ci
npm run lint
npm run format
npm run typecheck
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/agritech_test npm run test:coverage
npm run build
```

As integrações só executam quando `TEST_DATABASE_URL` está definida. O teste de perfis cria um schema exclusivo com UUID, replica as restrições necessárias e o remove ao final, inclusive após falhas. Nenhuma tabela de negócio existente recebe dados de teste. Prefira um banco descartável; ao usar um banco de desenvolvimento autorizado, forneça uma conexão direta com permissão para criar schemas. O proxy de pooling do banco usado nesta validação rejeitou `options=-c search_path=...`; a execução passou pela conexão direta do mesmo banco, sem alterar `.env`.

Os testes cobrem CRUD, ordenação e listagem vazia, validação de campos e IDs, limites de tamanho, descrição omitida/nula/vazia, inexistência, manutenção de ID/data na edição, nomes duplicados e diferenças de caixa. As integrações verificam criações e renomeações concorrentes, persistência real, bloqueio por usuários ativos/inativos e o fluxo HTTP de criação de perfil, vínculo de usuário, bloqueio de exclusão e remoção após desfazer o vínculo.

## Evidências em 2026-10-10

Código funcional validado: `ebaea16`, precedido pelo commit de persistência e regras `c2202ef`.

| Verificação                   | Resultado                                          |
| ----------------------------- | -------------------------------------------------- |
| Lint                          | Aprovado                                           |
| Formatação                    | Aprovada                                           |
| TypeScript                    | Aprovado                                           |
| Suíte completa com PostgreSQL | 41 arquivos e 320 testes aprovados, nenhum pulado  |
| Cobertura global de linhas    | 94,97%, acima do gate de 80%                       |
| Cobertura do módulo `roles`   | 100% de linhas e branches nos arquivos de produção |
| Build                         | Aprovado                                           |

As integrações executaram no banco de desenvolvimento autorizado, com dados e schemas temporários. Uma consulta final aos metadados confirmou zero schemas remanescentes de testes de perfis (`it_roles_*`). A validação é local; não houve execução do CI remoto, push ou deploy.
