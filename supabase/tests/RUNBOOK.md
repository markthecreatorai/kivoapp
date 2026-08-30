# QA-4A-V7 — Runbook do harness transacional da Onda 4A

Harness **criado**. Os testes E2E de banco e os cenários de concorrência
**NÃO foram executados** neste commit (nenhum banco disponível no ambiente de
build; execução remota não autorizada).

## Regras invioláveis

- Nunca apontar para o projeto de produção `wfuwenylojhabresnrvi` nem para host
  `*.supabase.co` / `pooler.supabase.*`. Os dois runners abortam nesses casos.
- Banco da suíte transacional: prefixo obrigatório `kivo_qa*`.
- Banco do runner de concorrência: prefixo obrigatório `kivo_qa_conc*` (é
  **destruído** ao final, pois os cenários exigem `COMMIT`).
- Nenhum dado de produção é copiado. Todas as linhas são sintéticas e marcadas
  com `qa4b` em e-mail/slug (`qa4b.assert_not_production()` varre `orders`).
- Sem segredos neste repositório: `DATABASE_URL` é sempre exportada localmente.

## Pré-condições

- Postgres 15+ (`initdb`, `psql`) local. Docker/Supabase CLI **opcional**.
- `pgcrypto` disponível. `pgtap` é opcional (as asserções usam `DO`/`RAISE`).
- As migrations financeiras `20260811090000`, `20260811100000`,
  `20260811110000` e `20260811120000` **não estão aplicadas em produção** — o
  harness as aplica apenas no cluster efêmero.

## A) Cluster efêmero + suíte transacional (BEGIN … ROLLBACK)

```bash
export PGDATA=/tmp/kivo-qa-pg
export PGPORT=54329
export PGHOST=/tmp/kivo-qa-sock
mkdir -p "$PGHOST"

initdb -D "$PGDATA" -U postgres --auth=trust
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGHOST -c listen_addresses=''" -l /tmp/kivo-qa-pg.log start

createdb -U postgres kivo_qa
export DATABASE_URL="postgresql://postgres@localhost/kivo_qa?host=$PGHOST&port=$PGPORT"

# 1) compatibilidade Supabase (schemas auth/storage, roles, stubs cron/net)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/00_bootstrap_compat.sql

# 2) schema do projeto, em ordem lexicográfica
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f" || { echo "FALHOU: $f"; break; }
done

# 3) fixtures sintéticas + helpers de asserção
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/10_fixtures.sql

# 4) suíte (cada arquivo termina em ROLLBACK)
bash supabase/tests/run_sql_suite.sh
```

Cobertura de `run_sql_suite.sh`:

| Arquivo | Casos |
| --- | --- |
| `sql/01_settlement_atomic.sql` | settlement atômico, replay idêntico, fail-closed sem split, invariante `total_balance + reserva_retida = creator_net` em varredura de valores, paridade com `get_wallet_balance` |
| `sql/02_refunds.sql` | parcial único, dois parciais cumulativos, replay convergente, replay que **repara** reserva, colisão por payment/valor/status, over-refund com rollback, total após parcial |
| `sql/03_chargeback.sql` | chargeback novo, replay idempotente, colisão divergente, guardas de payload, chargeback após refund parcial sem débito dobrado |
| `sql/04_reserve_lifecycle.sql` | FREE 10%/30d a partir de `settled_at`, CREATOR_PRO 15d, drift de política fail-closed, release antes/depois de `release_at`, reserva legada, bloqueio por chargeback, reserva parcialmente revertida / revertida / reconciliada |
| `sql/05_grants_rls.sql` | RPCs financeiras sem `EXECUTE` para `PUBLIC`/`anon`/`authenticated` e com `service_role`, RLS habilitada nas tabelas financeiras, `anon` sem `SELECT`, isolamento cross-workspace |

## B) Concorrência real (2 conexões, banco descartável)

```bash
createdb -U postgres kivo_qa_conc1
export DATABASE_URL="postgresql://postgres@localhost/kivo_qa_conc1?host=$PGHOST&port=$PGPORT"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/00_bootstrap_compat.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/10_fixtures.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sql/06_concurrency_fixtures.sql

bash supabase/tests/run_concurrency.sh
```

Cenários: `C1` dois settlements do mesmo pedido · `C2` dois refunds com IDs
distintos · `C3` replay simultâneo do mesmo refund · `C4` dois saques disputando
o mesmo saldo · `C5` duas resoluções do mesmo chargeback.

## C) Destruição do ambiente (obrigatória)

```bash
dropdb -U postgres kivo_qa_conc1 || true
dropdb -U postgres kivo_qa || true
pg_ctl -D "$PGDATA" stop -m immediate || true
rm -rf "$PGDATA" "$PGHOST" /tmp/kivo-qa-pg.log
```

## Limitações honestas (não contornar com mocks)

1. **RLS não é prova de runtime.** `auth.uid()`/`auth.jwt()` no bootstrap são
   stubs alimentados por `set_config`. Resultados de RLS valem como
   *integração local*; o veredito de runtime exige branch Supabase com
   PostgREST. Grants, por serem catálogo, valem integralmente.
2. **`pg_cron` / `pg_net` são no-ops.** Liberação agendada de reserva é testada
   chamando `release_reserve_entry` diretamente, envelhecendo `release_at`.
3. **Política de reserva não é versionada em migration** (`fee_config` é dado).
   O harness semeia 10%/30d (`creator`) e 10%/15d (`creator_pro`) via
   `qa4b.seed_reserve_policy()`. Bloqueador registrado: se produção divergir,
   `reserve_policy_for_workspace` levanta `RESERVE_POLICY_DRIFT`.
4. **Concorrência exige `COMMIT`**, portanto não roda em transação revertida —
   daí o banco descartável separado e a destruição obrigatória.
5. **Gap do chargeback (bruto − `creator_net`) permanece política aberta.** Os
   testes apenas fixam o comportamento vigente (débito econômico limitado a
   `creator_net`, trilha do bruto em `status='canceled'`), sem decidir a
   alocação de `gateway_fee` / `kivo_fee` / `chargeback_fee`.
6. **Ordem das migrations pode exigir intervenção** no cluster efêmero: o laço
   para na primeira falha e imprime o arquivo, para triagem manual.
