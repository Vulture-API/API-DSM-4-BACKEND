# Logging Estruturado e Auditoria da Aplicação

Este documento descreve a arquitetura, padrões, níveis de severidade, políticas de segurança e orientações práticas de consulta do mecanismo padronizado de **logging estruturado** e **auditoria** do backend AgriTech.

Esta implementação atende aos requisitos:

- **RF12 — Registro de Logs (SCRUM-488)**
- **RNF06 — Confiabilidade (SCRUM-522)**
- **RNF11 — Auditabilidade (SCRUM-527)**
- **Item de Trabalho:** [SCRUM-542]

---

## 1. Padrão de Logging Adotado

A aplicação adota o padrão de **logs estruturados em formato JSON** na saída padrão (`stdout` / `stderr`), processados por meio do ecossistema **Pino** (nativo do Fastify), garantindo:

- **Alta performance:** overhead mínimo de serialização assíncrona;
- **Consistência:** esquema uniforme de campos chave para facilitar parsing e ingestão por ferramentas de observabilidade (ex: Datadog, Prometheus/Loki, ElasticSearch/Logstash, CloudWatch);
- **Correlação ponta a ponta (Request Tracing):** cada requisição carrega ou gera um `x-request-id` único (Correlation ID), presente nos logs de entrada, de conclusão, nos erros e no cabeçalho de resposta HTTP.

---

## 2. Níveis de Log Utilizados

| Nível    | Finalidade                     | Quando Utilizar                                                                                                           |
| :------- | :----------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `fatal`  | Falha catastrófica             | Erros críticos irrecuperáveis que impedem a inicialização ou derrubam o processo do servidor.                             |
| `error`  | Erro não esperado (5xx)        | Falhas de infraestrutura, exceções não tratadas, indisponibilidade de banco de dados ou provedores externos.              |
| `warn`   | Alerta / Erro de cliente (4xx) | Validações inválidas (400), acessos negados (401/403), gargalos operacionais ou degradações de recursos.                  |
| `info`   | Operações normais do sistema   | Ciclos de workers, inicialização/encerramento de serviços, requisições HTTP recebidas e concluídas, eventos de auditoria. |
| `debug`  | Diagnóstico aprofundado        | Dados contextuais detalhados para investigação durante o desenvolvimento ou homologação.                                  |
| `trace`  | Rastreamento fino              | Passo a passo detalhado de fluxos internos e processamentos em lote de leituras.                                          |
| `silent` | Desativação de saída           | Utilizado por padrão em rotinas automatizadas de testes unitários (`NODE_ENV=test`).                                      |

A variável de ambiente `LOG_LEVEL` permite ajustar a granularidade em tempo de execução:

```env
LOG_LEVEL=info # fatal | error | warn | info | debug | trace | silent
```

---

## 3. Informações Registradas

Sempre que aplicável, cada registro de log emite os seguintes campos padronizados:

```json
{
  "level": "info",
  "timestamp": "2026-10-21T14:30:00.123Z",
  "component": "http",
  "operation": "POST /api/stations",
  "requestId": "9155006d-6093-4881-8292-561e9451a4eb",
  "result": "success",
  "statusCode": 201,
  "durationMs": 32.45,
  "message": "Request completed: POST /api/stations - 201 (32.45ms)",
  "actor": {
    "id": 1,
    "email": "admin@agritech.com"
  }
}
```

### Detalhamento dos Campos

- **`timestamp`**: Data e hora do evento no formato ISO 8601 UTC.
- **`level`**: Nível de severidade em texto minúsculo (`info`, `warn`, `error`, etc.).
- **`component`**: Módulo ou origem emissora (`http`, `audit`, `auth`, `users`, `stations`, `rules-engine`, `occurrences`, `devops`, `app`).
- **`operation`**: Identificador da ação executada (ex: `GET /api/stations`, `POST /api/users`, `rules_engine_cycle`, `shutdown`).
- **`requestId`**: Identificador de correlação (`x-request-id`).
- **`result`**: Resultado da operação (`success`, `error`, `denied`).
- **`statusCode`**: Código HTTP de resposta (quando aplicável).
- **`durationMs`**: Tempo total de processamento em milissegundos.
- **`error`**: Objeto com `{ name, message, code, stack }` presente em falhas.
- **`actor`**: Identificação do ator autenticado (`id`, `email`).
- **`message`**: Descrição legível do evento registrado.

---

## 4. Segurança e Dados Sensíveis (Sanitização)

> [!CAUTION]
> **Nenhuma informação confidencial ou sensível de autenticação deve ser registrada em texto aberto nos logs ou nos registros de auditoria.**

### Informações que NÃO devem ser registradas:

- Senhas e confirmações de senha (`password`, `senha`, `current_password`, `new_password`);
- Tokens de autenticação (`token`, `access_token`, `refresh_token`, `jwt`, `bearer`);
- Segredos de ambiente e chaves privadas (`secret`, `JWT_SECRET`, `private_key`);
- Chaves de API (`apiKey`, `api_key`);
- Cabeçalhos de credenciais e cookies (`Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`);
- Dados financeiros sensíveis (`credit_card`, `cvv`).

### Mecanismo de Sanitização Automática

O sistema possui duas camadas integradas de segurança:

1. **Redação Nativa do Pino:** Padrões declarados como `*.password`, `*.senha`, `*.token`, `headers.authorization`, etc., são substituídos automaticamente por `"[REDACTED]"`.
2. **Utilitário `sanitizeLogData`:** Função recursiva que inspeciona objetos, arrays e instâncias de erro, tratando referências circulares e mascarando chaves sensíveis por expressão regular antes da gravação.

---

## 5. Tratamento Estruturado de Erros

Todas as rotas passam pelos error handlers padronizados (`handleError`, `handleUsersError`, `handleParametersError`), que executam a função `logHttpError` **antes** de retornar a resposta ao cliente:

- Erros de cliente (HTTP 4xx, validações de schema Zod, acessos negados): registrados no nível `warn`.
- Erros de servidor (HTTP 5xx, exceções não tratadas, erros de banco de dados): registrados no nível `error`, preservando a mensagem, o código e o stack trace sanitizado para posterior diagnóstico.

---

## 6. Auditoria de Operações Relevantes

Para atender ao **RNF11 (Auditabilidade)**, o serviço `AuditService` rastreia operações de segurança e mutações críticas no sistema:

### Categorias de Auditoria

- `AUTHENTICATION`: Login, logout, tentativas de autenticação com falha ou sucesso.
- `USER_MANAGEMENT`: Criação, atualização, exclusão e bloqueio/desbloqueio de usuários.
- `ACCESS_CONTROL`: Criação, alteração ou exclusão de papéis e permissões; tentativas de acesso não autorizado (401/403).
- `ENTITY_MUTATION`: Criação, alteração ou exclusão de estações, sensores, tipos de sensores, propriedades e configurações de alerta.
- `SYSTEM`: Execução manual ou automática de ciclos de regras, monitoramento de ocorrências e registros de indisponibilidade (outages).

### Estrutura do Registro de Auditoria

```json
{
  "id": "e3b0c442-98fc-1c14-9afb-4c28e932b781",
  "timestamp": "2026-10-21T14:30:00.123Z",
  "category": "USER_MANAGEMENT",
  "action": "CREATE",
  "operation": "POST /api/users",
  "actor": {
    "id": 1,
    "email": "gestor@vulture.com",
    "ip": "192.168.1.10"
  },
  "target": {
    "type": "users",
    "id": 42
  },
  "result": "SUCCESS",
  "requestId": "9155006d-6093-4881-8292-561e9451a4eb",
  "details": {
    "statusCode": 201,
    "durationMs": 45.1,
    "body": {
      "name": "Novo Operador",
      "email": "operador@vulture.com",
      "password": "[REDACTED]"
    }
  }
}
```

### Consulta de Auditoria via API

A API disponibiliza o endpoint para consulta dos registros recentes de auditoria (com buffer circular):

- **Rota:** `GET /api/devops/audit-logs`
- **Filtros suportados via Query Parameters:**
  - `category`: `AUTHENTICATION` | `USER_MANAGEMENT` | `ACCESS_CONTROL` | `ENTITY_MUTATION` | `SYSTEM`
  - `action`: `CREATE` | `UPDATE` | `DELETE` | `LOGIN` | `DENIED` | etc.
  - `result`: `SUCCESS` | `FAILURE` | `DENIED`
  - `actorId`: ID numérico do usuário operador
  - `targetType`: Tipo de entidade afetada (ex: `stations`, `users`)
  - `fromDate`: Data inicial (ISO 8601)
  - `toDate`: Data final (ISO 8601)
  - `limit`: Quantidade máxima de registros retornados (padrão 50, máx 100)

Exemplo de consulta:

```bash
curl "http://localhost:3000/api/devops/audit-logs?category=USER_MANAGEMENT&result=SUCCESS&limit=10"
```

---

## 7. Orientações para Consulta e Diagnóstico

### 7.1 Visualização Local Formatada (Pino Pretty)

Em desenvolvimento local, para visualizar logs em formato legível com cores:

```bash
npm run dev
```

### 7.2 Filtragem via Linha de Comando com `jq`

Ao coletar logs da aplicação em arquivo ou container Docker:

```bash
# Filtrar apenas erros e falhas críticas
node dist/index.js | jq 'select(.level == "error" or .level == "fatal")'

# Filtrar requisições com tempo de resposta superior a 500ms
node dist/index.js | jq 'select(.durationMs > 500)'

# Rastrear o ciclo completo de uma requisição pelo Request ID
node dist/index.js | jq 'select(.requestId == "dadafff1-1771-458d-a760-47e2af4fb987")'

# Filtrar eventos de auditoria
node dist/index.js | jq 'select(.component == "audit")'
```

### 7.3 Integração com Ferramentas de Observabilidade

Por estarem padronizados em JSON estruturado de linha única (JSON Lines), os logs são imediatamente compatíveis com coletores padrão como Fluentd, Promtail (Loki), AWS CloudWatch Logs Agent e Datadog Agent sem necessidade de regex personalizada para extração de campos.
