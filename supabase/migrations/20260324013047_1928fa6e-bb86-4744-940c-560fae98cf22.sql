
-- 1) Wallet Ledger: immutable financial entries (single source of truth)
CREATE TABLE public.wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id),
  withdrawal_id uuid, -- FK added after withdrawals table
  type text NOT NULL CHECK (type IN ('sale', 'fee', 'refund', 'withdrawal', 'adjustment')),
  amount integer NOT NULL, -- cents, positive=credit, negative=debit
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'settled', 'canceled')),
  description text,
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_ledger_workspace ON public.wallet_ledger(workspace_id);
CREATE INDEX idx_wallet_ledger_status ON public.wallet_ledger(workspace_id, status);
CREATE INDEX idx_wallet_ledger_available ON public.wallet_ledger(workspace_id, available_at) WHERE status = 'pending';

ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_ledger" ON public.wallet_ledger
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "service_insert_ledger" ON public.wallet_ledger
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- 2) Bank accounts for creators
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bank_code text NOT NULL,
  bank_name text,
  agency text NOT NULL,
  account_number text NOT NULL,
  account_type text NOT NULL DEFAULT 'checking' CHECK (account_type IN ('checking', 'savings')),
  holder_name text NOT NULL,
  holder_document text NOT NULL, -- CPF or CNPJ
  is_default boolean NOT NULL DEFAULT false,
  pix_key text,
  pix_key_type text CHECK (pix_key_type IN ('cpf', 'cnpj', 'email', 'phone', 'random') OR pix_key_type IS NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bank_accounts_workspace ON public.bank_accounts(workspace_id);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_manage_bank_accounts" ON public.bank_accounts
  FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- 3) Withdrawals
CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id),
  amount integer NOT NULL, -- cents
  fee integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL, -- amount - fee
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'paid', 'failed', 'canceled')),
  idempotency_key text UNIQUE,
  gateway_transfer_id text,
  requested_by uuid REFERENCES auth.users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_withdrawals_workspace ON public.withdrawals(workspace_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(workspace_id, status);

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_read_withdrawals" ON public.withdrawals
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "workspace_members_create_withdrawals" ON public.withdrawals
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

-- Add FK from ledger to withdrawals
ALTER TABLE public.wallet_ledger ADD CONSTRAINT wallet_ledger_withdrawal_fk
  FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawals(id);

-- 4) Function to auto-release pending ledger entries
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_workspace_id uuid)
RETURNS TABLE(available_balance bigint, pending_balance bigint, total_balance bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status = 'available' OR (status = 'pending' AND available_at <= now()) THEN amount ELSE 0 END), 0)::bigint AS available_balance,
    COALESCE(SUM(CASE WHEN status = 'pending' AND available_at > now() THEN amount ELSE 0 END), 0)::bigint AS pending_balance,
    COALESCE(SUM(CASE WHEN status IN ('pending', 'available') THEN amount ELSE 0 END), 0)::bigint AS total_balance
  FROM wallet_ledger
  WHERE workspace_id = p_workspace_id AND status != 'canceled';
$$;
