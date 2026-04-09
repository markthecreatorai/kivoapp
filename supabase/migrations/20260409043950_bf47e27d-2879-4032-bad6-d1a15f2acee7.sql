
CREATE OR REPLACE FUNCTION public.batch_reorder_modules(items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE course_modules AS cm
  SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE cm.id = (item->>'id')::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.batch_reorder_lessons(items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE course_lessons AS cl
  SET position = (item->>'position')::int
  FROM jsonb_array_elements(items) AS item
  WHERE cl.id = (item->>'id')::uuid;
END;
$$;
