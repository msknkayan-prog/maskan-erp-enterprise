-- Maskan ERP Enterprise v1.1 Production
-- READ-ONLY PRODUCTION AUDIT
-- Safe: this script contains SELECT statements only and does not modify data or schema.

-- A) Required tables and views
select
  'object_check' as section,
  x.object_name as item,
  case when to_regclass('public.' || x.object_name) is not null then 'PASS' else 'FAIL' end as status,
  coalesce(to_regclass('public.' || x.object_name)::text, 'missing') as details
from (values
  ('profiles'),('companies'),('projects'),('parties'),('contracts'),
  ('payment_requests'),('payment_certificates'),('payments'),('deductions'),
  ('purchase_orders'),('inventory_items'),('stock_movements'),('approval_history'),
  ('variation_orders'),('financial_claims'),('advances')
) as x(object_name)

union all

-- B) RLS state on critical tables
select
  'rls_check' as section,
  c.relname as item,
  case when c.relrowsecurity then 'PASS' else 'REVIEW' end as status,
  'RLS=' || c.relrowsecurity::text || ', FORCE_RLS=' || c.relforcerowsecurity::text as details
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='r'
  and c.relname in (
    'profiles','companies','projects','parties','contracts','payment_requests',
    'payment_certificates','payments','deductions','purchase_orders','inventory_items',
    'stock_movements','approval_history','variation_orders','financial_claims','advances'
  )

union all

-- C) Policy counts; zero policies on an RLS table requires review
select
  'policy_check' as section,
  c.relname as item,
  case when count(p.policyname)>0 then 'PASS' else 'REVIEW' end as status,
  'policies=' || count(p.policyname)::text as details
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
where n.nspname='public'
  and c.relkind='r'
  and c.relname in (
    'profiles','companies','projects','parties','contracts','payment_requests',
    'payment_certificates','payments','deductions','purchase_orders','inventory_items',
    'stock_movements','approval_history','variation_orders','financial_claims','advances'
  )
group by c.relname

union all

-- D) Critical foreign-key relationships used by the web app
select
  'fk_check' as section,
  expected.constraint_name as item,
  case when tc.constraint_name is not null then 'PASS' else 'FAIL' end as status,
  expected.expected_relation as details
from (values
  ('projects_project_manager_id_fkey','projects.project_manager_id -> profiles.id'),
  ('projects_created_by_fkey','projects.created_by -> profiles.id'),
  ('projects_client_id_fkey','projects.client_id -> parties.id'),
  ('projects_company_id_fkey','projects.company_id -> companies.id'),
  ('approval_history_acted_by_fkey','approval_history.acted_by -> profiles.id')
) as expected(constraint_name,expected_relation)
left join information_schema.table_constraints tc
  on tc.constraint_schema='public'
 and tc.constraint_type='FOREIGN KEY'
 and tc.constraint_name=expected.constraint_name

union all

-- E) Duplicate project/profile FK paths are expected but must be explicit in PostgREST embeds
select
  'relationship_check' as section,
  'projects_to_profiles_fk_count' as item,
  case when count(*)=2 then 'PASS' else 'REVIEW' end as status,
  'count=' || count(*)::text || ' (expected 2: created_by and project_manager_id)' as details
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name=kcu.constraint_name
 and tc.constraint_schema=kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name=tc.constraint_name
 and ccu.constraint_schema=tc.constraint_schema
where tc.constraint_schema='public'
  and tc.constraint_type='FOREIGN KEY'
  and tc.table_name='projects'
  and ccu.table_name='profiles'

union all

-- F) Anonymous/authenticated privileges on critical tables (informational)
select
  'grant_check' as section,
  table_name || ':' || grantee as item,
  'INFO' as status,
  string_agg(privilege_type, ',' order by privilege_type) as details
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('projects','contracts','payment_requests','payment_certificates','payments','purchase_orders','approval_history')
  and grantee in ('anon','authenticated')
group by table_name,grantee

order by section,item;
