-- Maskan ERP Enterprise v1.1 Production
-- READ-ONLY verification queries. Safe to run in Supabase SQL Editor.

-- 1) Confirm expected foreign keys used by PostgREST embeds.
select
  tc.table_name,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
 and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_schema = 'public'
  and tc.constraint_type = 'FOREIGN KEY'
  and tc.table_name in ('projects','approval_history','advances','financial_claims')
order by tc.table_name, tc.constraint_name;

-- Expected critical relationships:
-- projects_project_manager_id_fkey : projects.project_manager_id -> profiles.id
-- projects_created_by_fkey         : projects.created_by -> profiles.id
-- approval_history_acted_by_fkey   : approval_history.acted_by -> profiles.id
-- advances_employee_id_fkey        : advances.employee_id -> profiles.id

-- 2) RLS status for operational tables.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname='public'
  and tablename in (
    'profiles','projects','parties','contracts','payment_requests',
    'payment_certificates','payments','purchase_orders','inventory_items',
    'stock_movements','approval_history','variation_orders','financial_claims','advances'
  )
order by tablename;

-- 3) Basic row counts for smoke testing.
select 'profiles' table_name, count(*) row_count from public.profiles
union all select 'projects', count(*) from public.projects
union all select 'parties', count(*) from public.parties
union all select 'contracts', count(*) from public.contracts
union all select 'payment_requests', count(*) from public.payment_requests
union all select 'payment_certificates', count(*) from public.payment_certificates
union all select 'payments', count(*) from public.payments;
