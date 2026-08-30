# QA-4B — Plano de evidência transacional real (Onda 4A)

Somente leitura nesta rodada. Nada foi editado, executado, aplicado ou publicado.

## 1. HEAD efetivo e ancestralidade

- HEAD do checkout local: `700ea7f04b89f45383505ff8e172cfc7b4a0d61e` ("Work in progress").
- `b7f72311fdfa906df1903fa612d214f8a8937264` é o **pai** desse HEAD, ou seja o repo local está **1 commit à frente** da base canônica indicada.
- `git merge-base --is-ancestor 02c3e9cc… HEAD` → **YES**; distância `02c3e9cc..HEAD` = **6 commits** (5 até `b7f72311` + 1).
- Diff `b7f72311..HEAD` = 3 arquivos, todos de front/auth de preview, **nenhum** arquivo financeiro:
  `src/integrations/supabase/client.ts`, `src/integrations/supabase/previewAuthStorage.ts`, `src/integrations/supabase/types.ts`.
- Conclusão fail-closed: para a Onda 4B, o conteúdo financeiro em HEAD é **idêntico** a `b7f72311`. Se a política exigir base exata, executar a suíte a partir de um worktree read-only em `b7f72311`.

## 2. Há configuração suficiente para Postgres/Supabase local efêmero?

Situação verificada (sem executar nada):

- `supabase/config.toml` existe, mas contém **apenas** `project_id` e a matriz `verify_jwt` por função. **Não há** blocos `[db]`, `[auth]`, `[api]`, nem `major_version` → `supabase start` funcionaria com defaults, não com paridade declarada.
- **Não existe** `supabase/seed.sql`.
- 206 migrations em `supabase/migrations/`.
- Binários disponíveis: `postgres 17.9`, `initdb`, `pg_ctl`, `psql`. **Docker ausente**, **Supabase CLI ausente**, **pgTAP ausente** no ambiente.

Veredito: dá para subir um **cluster Postgres 17 efêmero puro** (initdb + pg_ctl em `/tmp`), mas **não** o stack Supabase completo. Consequências:

- Faltam os papéis/schemas Supabase (`anon`, `authenticated`, `service_role`, `supabase_auth_admin`, `auth`, `storage`, `graphql`) e as funções `auth.uid()` / `auth.jwt()`.
- Faltam extensões que várias migrations assumem (`pgcrypto`, `pg_cron`, `pg_net`, `uuid-ossp`).
- pgTAP indisponível → primeira escolha é **SQL puro com asserções `DO ... RAISE EXCEPTION`** (fail-closed, sem dependência nova). pgTAP só se autorizarem instalar a extensão.

Portanto o plano prevê um **bootstrap de compatibilidade** (arquivo novo, criado só na etapa de execução) que cria os papéis, o schema `auth`, stubs de `auth.uid()`/`auth.jwt()` alimentados por `set_config`, e stubs no-op de `cron.schedule`/`net.http_post`.

## 3. Ordem de migrations para reproduzir o schema financeiro

Aplicar **todas** as 206 migrations em ordem lexicográfica de nome de arquivo (é a ordem cronológica do Supabase). Não montar subconjunto: as migrations financeiras dependem de `workspaces`, `products`, `orders`, `payments`, `is_workspace_member/admin`, `has_role`.

Espinha dorsal financeira (subconjunto crítico, na ordem em que ocorre):

```text
20260324013047…  base de orders/payments
20260324023642…
20260324055602…
20260324060127…
20260324060757…
20260401141456…
20260405193456…
20260409192447…   fee_config (+ seed creator / creator_pro), transactions, security_reserves, RLS
20260808064330…   wallet_ledger / split_entries / ciclo de comissões
20260808065947…
20260808070205…
20260808070558…
20260808071420…
20260808072056…
20260808073018…
20260808073220…
20260811031918…
20260811032117…
20260811033030…
20260811074500_process_refund_increment_atomic.sql
20260811090000_wave4_wallet_payout_hardening.sql
20260811100000_wave5_reserve_model_canonical.sql   reserve_entries canônico, get_reserve_policy, settle_order_reserve, reverse_reserve_entry
20260811110000_wave6_reserve_atomicity.sql          settle_order_atomic, settled_at
20260811120000_wave61_refund_chargeback_atomic.sql  refund atômico + resolve_chargeback_financials (V6.1→V6.4)
```

Dependências e incompatibilidades históricas a tratar no bootstrap (não editar migrations):

- Migrations que referenciam `auth.users` / `auth.uid()` → exigem schema `auth` e stubs.
- Migrations com `cron.schedule` / `pg_net` → exigem stubs no-op.
- Políticas com `TO anon, authenticated, service_role` → exigem os papéis pré-criados.
- Objetos de Storage (`storage.objects`, políticas de bucket) → schema `storage` mínimo com a tabela `objects`, ou pular via stub; **não** fazem parte da matriz 4B.
- `fee_config` **não tem** linha `FREE`: o mapeamento é `feeTierForPlan()` (FREE → tier `creator`). O teste do "plano FREE 10%/30 dias" deve provar exatamente esse mapeamento, e as colunas `reserve_percent` / `reserve_hold_days` (adicionadas na Wave 5) precisam de valor semeado pelas fixtures.

## 4. Matriz de testes transacionais

Cada caso: fixture sintética → ação → asserção `DO`/`RAISE EXCEPTION` → `ROLLBACK`. Identificadores propostos para o checklist entre parênteses.

**A. Settlement e segregação (T-4B-01…04)**
1. `settle_order_atomic` cria, no mesmo commit: `wallet_ledger.sale`, `wallet_ledger.fee`, `reserve_entries` (held) e `orders.settled_at`. Falta de qualquer um ⇒ falha.
2. Erro injetado no meio (ex.: pedido sem `split_entries`) ⇒ **nada** persistido (transação inteira revertida).
3. Replay do mesmo pedido ⇒ nenhuma linha duplicada, `settled_at` inalterado.
4. Advisory lock: chamada concorrente serializa (ver bloco I).

**B. Igualdade centavo a centavo (T-4B-05…07)**
5. `available + reserve_held = creator_net` para valores primos/ímpares (ex.: 1, 3, 7, 999, 1001, 12345, 99999 centavos) — varredura parametrizada.
6. Arredondamento: `reserve = round(creator_net * pct/100)`; nenhuma combinação pode gerar `available < 0` nem sobra de 1 centavo.
7. `computeBalances` (TS) e `get_wallet_balance` (SQL) devem devolver o mesmo número para o mesmo conjunto de linhas.

**C. Políticas de reserva (T-4B-08…10)**
8. Workspace `plan = 'FREE'` resolve tier `creator` ⇒ 10% / 30 dias (`release_at = settled_at + 30d`).
9. `plan = 'CREATOR_PRO'` ⇒ percentual/dias da linha `creator_pro`.
10. Tier inexistente / `reserve_percent` nulo ⇒ **fail-closed** (exceção), nunca 0%.

**D. Relógio do hold (T-4B-11…13)**
11. `release_reserve_entry` antes de `release_at` ⇒ mantém `held`, sem crédito.
12. Depois de `release_at` ⇒ crédito único; `total` volta a `creator_net`.
13. Reserva legada sem débito de segregação ⇒ permanece retida com `NEEDS_PRODUCT_DECISION` (não credita).

**E. Refunds parciais sucessivos (T-4B-14…17)**
14. 100 → refund 20 → refund 20: acumulado = 40, reserva reduzida proporcionalmente, sem over-refund.
15. Refund que excederia o total do pedido ⇒ exceção `over-refund`.
16. Replay idêntico (mesmo `gateway_refund_id`) ⇒ `outcome = 'duplicate'`, saldo idêntico, reserva **reparada** se estiver desalinhada.
17. Refund total após parcial ⇒ venda cancelada, reserva revertida, saldo 0.

**F. Replay divergente fail-closed (T-4B-18…20)**
18. Mesmo `gateway_refund_id`, `payment_id` diferente ⇒ `REFUND_CORRELATION_MISMATCH`.
19. Mesmo id, valor em centavos diferente ⇒ mesma exceção.
20. Mesmo id, `status <> 'PROCESSED'` ⇒ mesma exceção. Em todos: zero escrita persistida.

**G. Chargeback (T-4B-21…24)**
21. Caso novo: `chargeback_cases` gravado em **reais**, venda cancelada, débito limitado a `creator_net`, linha `chargeback` em `status='canceled'` (auditoria).
22. Replay idêntico por `gateway_dispute_id` ⇒ `ALREADY_PROCESSED`, saldo idêntico.
23. Colisão divergente em `order_id` / `payment_id` / `workspace_id` / `amount` ⇒ `DISPUTE_CORRELATION_MISMATCH`.
24. `gateway_dispute_id` ausente ⇒ exceção antes de qualquer escrita.

**H. Ciclo de vida da reserva (T-4B-25…27)**
25. `held` após settlement; 26. `released` após vencimento; 27. `reversed`/`reduced` após refund — sempre com a invariante do bloco B revalidada ao final.

**I. Concorrência real, duas sessões (T-4B-28…32)**
Duas conexões `psql` simultâneas (não duas transações na mesma conexão):
28. `settle_order_atomic` × 2 no mesmo pedido ⇒ uma escreve, a outra converge sem duplicar.
29. Dois refunds concorrentes ⇒ soma final correta, nunca over-refund.
30. Release concorrente ⇒ crédito único.
31. Chargeback concorrente com o mesmo `dispute_id` ⇒ um aplica, outro `ALREADY_PROCESSED`.
32. Refund concorrente com release ⇒ sem crédito de reserva já revertida.

**J. Grants (T-4B-33…35)**
33. `SET ROLE anon` / `authenticated` ⇒ `EXECUTE` negado em `settle_order_atomic`, `settle_order_reserve`, `reverse_reserve_entry`, `release_reserve_entry`, `process_refund_increment`, `resolve_chargeback_financials`.
34. `PUBLIC` sem privilégio (`has_function_privilege('public', …)` = false).
35. `service_role` ⇒ permitido. Asserção por catálogo (`information_schema.role_routine_grants`) **e** por chamada real que falha com `permission denied`.

**K. RLS e isolamento cross-workspace (T-4B-36…38)**
36. Membro do workspace A não lê `wallet_ledger` / `reserve_entries` / `chargeback_cases` do workspace B (via stub de `auth.uid()`).
37. `authenticated` não escreve nessas tabelas diretamente.
38. RLS habilitada em todas as tabelas financeiras (varredura de `pg_class.relrowsecurity`).

## 5. Fixtures sintéticas, rollback e cleanup

- Zero dado de produção. Nenhuma consulta ao Supabase remoto.
- UUIDs determinísticos com prefixo reconhecível (`qa4b-…`) gerados por `md5()` de rótulos, para diagnóstico legível.
- Fábrica em SQL: `qa4b.mk_workspace(plan)`, `qa4b.mk_order(ws, gross_cents, method)`, `qa4b.mk_payment(order)`, `qa4b.mk_split(order, creator_net)` — criadas em um schema `qa4b` descartável.
- Isolamento primário: cada caso roda em `BEGIN; … ROLLBACK;`. Casos de concorrência (bloco I), que exigem commit real, rodam contra um **banco descartável recriado** (`DROP DATABASE`), nunca com `TRUNCATE` seletivo.
- Cluster inteiro vive em `/tmp/qa4b-pg` e é destruído ao final (`pg_ctl stop` + `rm -rf`).
- Guarda fail-closed: os scripts abortam se `current_database()` não casar com o nome efêmero esperado ou se detectarem qualquer host que não seja o socket local.

## 6. Comandos que seriam executados na etapa posterior (NÃO executados agora)

```bash
# 1. cluster efêmero
export PGDATA=/tmp/qa4b-pg PGPORT=55432 PGHOST=/tmp/qa4b-sock
mkdir -p "$PGHOST" && initdb -U postgres --no-locale --encoding=UTF8
pg_ctl -D "$PGDATA" -o "-p $PGPORT -k $PGHOST -c listen_addresses=''" -l /tmp/qa4b-pg.log start
createdb -U postgres kivo_qa4b

# 2. bootstrap de compatibilidade Supabase (arquivo novo, criado na execução)
psql -U postgres -d kivo_qa4b -v ON_ERROR_STOP=1 -f qa/qa4b/00_bootstrap_supabase_compat.sql

# 3. schema completo, ordem lexicográfica
for f in supabase/migrations/*.sql; do
  psql -U postgres -d kivo_qa4b -v ON_ERROR_STOP=1 -f "$f" || { echo "FALHA: $f"; exit 1; }
done

# 4. fixtures + matriz
psql -U postgres -d kivo_qa4b -v ON_ERROR_STOP=1 -f qa/qa4b/10_fixtures.sql
for t in qa/qa4b/tests/*.sql; do
  psql -U postgres -d kivo_qa4b -v ON_ERROR_STOP=1 -f "$t" || { echo "FALHA: $t"; exit 1; }
done

# 5. concorrência (duas sessões)
psql -U postgres -d kivo_qa4b -f qa/qa4b/conc/a_settlement.sql &
psql -U postgres -d kivo_qa4b -f qa/qa4b/conc/b_settlement.sql & wait

# 6. cleanup
pg_ctl -D "$PGDATA" stop -m immediate; rm -rf "$PGDATA" "$PGHOST"
```

Alternativa B (se autorizarem CLI + Docker): `supabase db start` / `supabase db reset --local` e a mesma matriz via `psql` na porta local — dispensa o bootstrap de compatibilidade.

## 7. Riscos, bloqueadores e autorização mínima

Riscos:
- **R1 (alto)** — divergência de ambiente: sem stack Supabase, `auth.uid()`, RLS e papéis são stubs; os blocos J/K provam o catálogo e o comportamento simulado, não o runtime real do PostgREST.
- **R2 (médio)** — as 206 migrations podem falhar em ordem limpa (só foram aplicadas incrementalmente em produção); o primeiro run pode exigir stubs adicionais. Mitigação: log por arquivo e parada no primeiro erro.
- **R3 (médio)** — ausência de pgTAP: asserções em `DO`/`RAISE`; menos legíveis, mesma força fail-closed.
- **R4 (baixo)** — `fee_config` sem linha `FREE`; o teste C.8 depende do mapeamento `feeTierForPlan`, que precisa continuar acoplado à RPC.
- **R5 (baixo)** — testes de concorrência exigem commit real, portanto banco descartável obrigatório.

Autorização mínima:
- **(A) Postgres local efêmero** — permissão para: criar arquivos novos em `qa/qa4b/**` (nenhuma alteração em `src/` ou `supabase/migrations/`), rodar `initdb`/`pg_ctl`/`psql` em `/tmp`, e opcionalmente instalar `pgtap`. Sem rede, sem Supabase, sem deploy.
- **(B) Supabase development branch** — permissão para criar a branch, aplicar as migrations pendentes **nela** e rodar consultas; produção permanece intocada. É o único caminho que valida RLS/PostgREST/grants de verdade, e o único que exige custo e credenciais.

Recomendação: (A) primeiro para as invariantes aritméticas e de atomicidade; (B) depois, apenas para os blocos J e K.

## 8. Onde registrar os resultados no checklist

`docs/MVP_LAUNCH_QA_MASTER_CHECKLIST.md`, após a §31.12 (linha ~1712), como novas subseções — sem reescrever as anteriores:

- **§31.13 — QA-4B: contrato estático (histórico)**: consolida o que hoje é regex/simulação (V6→V6.4) e marca explicitamente "NÃO transacional".
- **§31.14 — QA-4B: integração local (Postgres efêmero)**: um bloco por caso `T-4B-xx` com comando, saída e veredito PASS/FAIL, mais a nota de que `auth`/RLS são stubs.
- **§31.15 — QA-4B: branch remoto Supabase**: apenas os casos que exigem runtime real (J, K), com o id da branch e a confirmação de que produção não foi tocada.
- **§31.16 — Gap chargeback**: registro da equação (item 9), **sem decisão**.

## 9. Equação do gap chargeback (traçado, sem decisão)

Componentes presentes no schema, sem definir política:

```text
gross                      = valor bruto cobrado do comprador (payments.amount, em REAIS)
gateway_fee                = taxa do adquirente por método:
                             PIX      -> fee_config.pix_percent          (% de gross)
                             CARTÃO   -> fee_config.credit_card_percent  (% de gross)
                             BOLETO   -> fee_config.boleto_fixed_cents   (valor fixo)
kivo_fee (platform)        = fee_config.platform_percent  (% de gross)  -> ledger type 'fee'
affiliate/coprod           = split_entries (comissões), quando existirem
creator_net                = gross - gateway_fee - kivo_fee - comissões   (split_entries.creator_net)
reserve                    = round(creator_net * fee_config.reserve_percent/100), hold reserve_hold_days
chargeback_fee             = SEM COLUNA/ORIGEM no schema atual (não modelado)

Gap = gross - creator_net = gateway_fee + kivo_fee + comissões
```

Hoje `resolve_chargeback_financials` debita **apenas** `creator_net` e registra o bruto contestado como linha `chargeback` em `status='canceled'` (auditoria). Logo o `Gap` acima fica **sem alocação contábil** e o eventual `chargeback_fee` do adquirente **não tem campo**. Decisão de produto: pendente, fora deste plano.
