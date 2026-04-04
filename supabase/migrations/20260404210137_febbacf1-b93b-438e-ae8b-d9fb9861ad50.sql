-- Download audit log
CREATE TABLE public.download_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_download_logs_customer ON public.download_logs(customer_id);
CREATE INDEX idx_download_logs_product ON public.download_logs(product_id);

-- Customer can view own downloads
CREATE POLICY "Customers view own downloads"
  ON public.download_logs FOR SELECT
  TO authenticated
  USING (
    customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.email = (auth.jwt() ->> 'email')
    )
  );

-- Workspace owners can view download logs for their products
CREATE POLICY "Workspace owners view product downloads"
  ON public.download_logs FOR SELECT
  TO authenticated
  USING (
    product_id IN (
      SELECT p.id FROM products p
      WHERE p.workspace_id IN (
        SELECT wm.workspace_id FROM workspace_members wm
        WHERE wm.user_id = auth.uid()
      )
    )
  );

-- Allow inserts from authenticated users (for their own customer record)
CREATE POLICY "Customers can log own downloads"
  ON public.download_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id IN (
      SELECT c.id FROM customers c
      WHERE c.email = (auth.jwt() ->> 'email')
    )
  );