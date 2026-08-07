-- Maskan ERP Enterprise v1.2 Production Hardened
-- SECURITY HARDENING MIGRATION
-- Idempotent and designed for the existing Maskan ERP schema.
-- Purpose: remove anonymous data privileges, enforce RLS, harden views/RPCs,
-- and keep authenticated application access controlled by existing RLS policies.

begin;

-- 1) Critical application tables: enforce RLS and remove anonymous privileges.
do $$
declare
  t text;
  app_tables text[] := array[
    'profiles','companies','projects','parties','contracts','contract_items',
    'payment_requests','payment_request_items','payment_certificates','payments','deductions',
    'purchase_orders','purchase_order_items','warehouses','inventory_items','stock_movements',
    'approval_history','variation_orders','advances','financial_claims','document_attachments',
    'notifications','audit_logs'
  ];
begin
  foreach t in array app_tables loop
    if to_regclass(format('public.%I',t)) is not null then
      execute format('alter table public.%I enable row level security',t);
      execute format('revoke all privileges on table public.%I from anon',t);
    end if;
  end loop;
end $$;

-- 2) Authenticated users require table privileges; RLS policies remain the authorization boundary.
do $$
declare
  t text;
  app_tables text[] := array[
    'profiles','companies','projects','parties','contracts','contract_items',
    'payment_requests','payment_request_items','payment_certificates','payments','deductions',
    'purchase_orders','purchase_order_items','warehouses','inventory_items','stock_movements',
    'approval_history','variation_orders','advances','financial_claims','document_attachments',
    'notifications','audit_logs'
  ];
begin
  foreach t in array app_tables loop
    if to_regclass(format('public.%I',t)) is not null then
      execute format('grant select, insert, update, delete on table public.%I to authenticated',t);
    end if;
  end loop;
end $$;

-- Approval history and audit logs are append/read records: prevent authenticated UPDATE/DELETE at grant layer.
do $$
begin
  if to_regclass('public.approval_history') is not null then
    revoke update, delete on table public.approval_history from authenticated;
  end if;
  if to_regclass('public.audit_logs') is not null then
    revoke update, delete on table public.audit_logs from authenticated;
  end if;
end $$;

-- Notifications are read/update for clients; insertion should happen via trusted RPC/server logic.
do $$
begin
  if to_regclass('public.notifications') is not null then
    revoke insert, delete on table public.notifications from authenticated;
    grant select, update on table public.notifications to authenticated;
  end if;
end $$;

-- 3) Views: never expose to anon; use invoker security so underlying RLS is honored.
do $$
declare
  v text;
  app_views text[] := array[
    'v_contract_financial_summary','v_inventory_balances','v_project_executive_summary'
  ];
begin
  foreach v in array app_views loop
    if to_regclass(format('public.%I',v)) is not null then
      execute format('revoke all privileges on table public.%I from anon',v);
      execute format('grant select on table public.%I to authenticated',v);
      begin
        execute format('alter view public.%I set (security_invoker = true)',v);
      exception when others then
        raise notice 'Could not set security_invoker on view %: %', v, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- 4) Sequences: remove anon use; grant authenticated only where application inserts may need sequence defaults.
revoke all privileges on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;

-- 5) Sensitive RPCs: PUBLIC/anon must not execute; authenticated can execute only known app RPCs.
do $$
begin
  if to_regprocedure('public.record_approval_action(text,uuid,text,text,text,text)') is not null then
    revoke execute on function public.record_approval_action(text,uuid,text,text,text,text) from public, anon;
    grant execute on function public.record_approval_action(text,uuid,text,text,text,text) to authenticated;
  end if;
  if to_regprocedure('public.create_notification(uuid,text,text,text,text,uuid)') is not null then
    revoke execute on function public.create_notification(uuid,text,text,text,text,uuid) from public, anon;
    grant execute on function public.create_notification(uuid,text,text,text,text,uuid) to authenticated;
  end if;
end $$;

-- 6) Future objects: do not automatically expose new public-schema objects to anonymous callers.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- 7) Storage remains private and company-folder scoped. Re-assert bucket privacy if it exists.
update storage.buckets
set public = false
where id = 'maskan-erp-documents';

commit;
