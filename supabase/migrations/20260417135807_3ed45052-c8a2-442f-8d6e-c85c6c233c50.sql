
CREATE TABLE IF NOT EXISTS public.product_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','phone','multiple_choice','dropdown','checkboxes','email')),
  label text NOT NULL,
  placeholder text,
  is_required boolean NOT NULL DEFAULT false,
  is_system boolean NOT NULL DEFAULT false,
  options jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pff_product ON public.product_form_fields(product_id, sort_order);

ALTER TABLE public.product_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pff_workspace_select ON public.product_form_fields;
CREATE POLICY pff_workspace_select ON public.product_form_fields
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_form_fields.product_id
      AND p.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS pff_workspace_write ON public.product_form_fields;
CREATE POLICY pff_workspace_write ON public.product_form_fields
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_form_fields.product_id
      AND p.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_form_fields.product_id
      AND p.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS pff_public_read ON public.product_form_fields;
CREATE POLICY pff_public_read ON public.product_form_fields
  FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_form_fields.product_id AND p.status = 'PUBLISHED'
    )
  );
