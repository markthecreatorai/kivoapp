-- ============================================================================
-- QA-4A-V7 — Bootstrap de compatibilidade Supabase para Postgres EFÊMERO
-- ----------------------------------------------------------------------------
-- Objetivo: permitir aplicar as 206 migrations de supabase/migrations em um
-- cluster Postgres puro (initdb), sem o stack Supabase.
--
-- NÃO EXECUTAR EM PRODUÇÃO NEM EM BRANCH REMOTO. Em Supabase (local CLI ou
-- development branch) estes objetos já existem e este arquivo deve ser PULADO.
--
-- Este arquivo NÃO substitui o runtime real: auth.uid()/auth.jwt() aqui são
-- stubs alimentados por set_config, e cron/net são no-ops. Qualquer resultado
-- de RLS obtido com estes stubs deve ser rotulado como "integração local",
-- nunca como prova de runtime PostgREST.
-- ============================================================================

\set ON_ERROR_STOP on

-- ── Guarda: recusa qualquer banco que não seja explicitamente efêmero ──
DO $guard$
BEGIN
  IF current_database() NOT LIKE 'kivo_qa%' THEN
    RAISE EXCEPTION
      'BOOTSTRAP ABORTADO: banco "%" nao parece efemero (esperado kivo_qa*).',
      current_database();
  END IF;
END;
$guard$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Papéis Supabase ──
DO $roles$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role',
                           'authenticator','supabase_auth_admin',
                           'supabase_storage_admin'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT', r);
    END IF;
  END LOOP;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── Schemas ──
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS vault;

-- ── auth.users mínima (só o que as FKs do projeto exigem) ──
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Stubs de identidade: alimentados por set_config('request.jwt.claims', …) ──
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
    '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(auth.jwt() ->> 'sub', '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', current_user);
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ── storage mínima (buckets/objects), fora do escopo financeiro da 4A ──
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:GREATEST(array_length(string_to_array(name, '/'), 1) - 1, 0)];
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)];
$$;

-- ── cron / net: no-ops (agendamento e HTTP não existem no harness) ──
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY,
  jobname text UNIQUE,
  schedule text,
  command text
);

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule,
                                      command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name text) RETURNS boolean
LANGUAGE sql AS $$ DELETE FROM cron.job WHERE jobname = job_name RETURNING true; $$;

CREATE OR REPLACE FUNCTION net.http_post(
  url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint; $$;

CREATE OR REPLACE FUNCTION net.http_get(
  url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint; $$;

-- pgTAP é OPCIONAL: se a extensão existir no cluster, os testes podem usá-la.
-- A suíte deste harness NÃO depende dela (asserções em DO/RAISE).
DO $tap$
BEGIN
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pgtap;
    RAISE NOTICE 'pgtap disponivel';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pgtap NAO disponivel — suite usa asseracoes DO/RAISE';
  END;
END;
$tap$;
