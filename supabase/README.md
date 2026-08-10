# Banco de dados (Supabase)

Projeto: `jkvcuofxuounpxpiwtoo` (região `sa-east-1`).
Todas as tabelas do disparador usam o prefixo `mail_`.

## Migrations

O diretório `migrations/` guarda o histórico do schema. Antes destas migrations o
schema só existia no banco — não havia nada versionado no repositório, então
qualquer alteração era invisível no histórico do Git.

Aplicadas em 10/08/2026:

| Versão | O que faz |
|---|---|
| `20260810133845_mail_hardening_schema` | `mail_norm_email()`, coluna `email_norm` + índice único, tabela `mail_suppressions` (+ trigger), colunas de janela de envio, cursor IMAP, `prefetch_count`, `next_attempt_at`, índices |
| `20260810133904_mail_reclassify_proxy_opens` | reclassifica aberturas de proxy como `prefetch` e recalcula os contadores |
| `20260810134508_mail_worker_v2` | `mail_claim_next` (janela + ritmo por conta + jitter), `mail_mark_failed` (backoff + bounce no SMTP), `mail_register_open` (filtro de proxy), `mail_unsubscribe`, RPCs de scan incremental |
| `20260810134701_mail_import_and_dashboard` | `mail_import_contacts`, `mail_dashboard`, `mail_get_settings`, `mail_update_settings` + grants |
| `20260810134942_mail_next_ready_in` | `mail_next_ready_in` (quanto falta para o próximo envio) |
| `20260810135004_..._fix_null_last_send` | corrige conta que nunca enviou ficar invisível no cálculo |
| `20260810135907_mail_campaign_stats_v2` | `mail_campaign_stats` com descadastrados, retentativas e prefetch |
| `20260810141500_mail_deterministic_jitter` | `mail_jitter()`: jitter derivado de `(conta, último envio)` para `claim_next` e `next_ready_in` calcularem o mesmo intervalo |
| `20260810142600_mail_pin_function_search_path` | fixa `search_path` nas funções novas (linter 0011) |
| `20260810150200_mail_default_business_hours` | política de envio: 08:00–18:00, dias úteis (default da coluna + linha atual) |

## Tabelas

| Tabela | Papel |
|---|---|
| `mail_campaigns` | campanha: assunto, corpo, limite diário, intervalo, conta de envio |
| `mail_contacts` | contato: email **único em todo o sistema** (`email` e `email_norm`), status, tracking |
| `mail_gmail_accounts` | contas Gmail: senha de app criptografada, limite diário, cursor IMAP |
| `mail_suppressions` | lista de bloqueio permanente (descadastro / bounce), sobrevive à exclusão da campanha |
| `mail_events` | log: `sent`, `open`, `prefetch`, `click`, `reply`, `bounce`, `failed`, `unsubscribe` |
| `mail_settings` | linha única: fuso, janela de envio, jitter, tentativas, segredo do worker |

## Agendamento (pg_cron + pg_net)

```sql
select jobid, jobname, schedule, active from cron.job;
```

- `mail_send` — a cada minuto, chama `/api/cron/send`
- `mail_scan` — a cada 3 minutos, chama `/api/cron/scan`

Ambos enviam o header `x-cron-secret`, que precisa ser igual a
`mail_settings.worker_secret` **e** à variável `CRON_SECRET` na Vercel.

## RLS

As tabelas `mail_*` têm RLS ativo com política apenas para o papel
`authenticated`. O papel `anon` não lê nada diretamente: o worker acessa tudo por
funções `SECURITY DEFINER` protegidas pelo segredo. As funções do painel
(`mail_dashboard`, `mail_get_settings`, `mail_update_settings`,
`mail_import_contacts`) têm `EXECUTE` revogado de `anon`/`public`.
