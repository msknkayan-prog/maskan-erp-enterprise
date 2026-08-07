-- Maskan ERP Enterprise v1.2 Production Hardened
-- READ-ONLY POST-HARDENING VERIFICATION

-- A) RLS must be enabled on all critical base tables that exist.
select
  'rls' as check_type,
  c.relname as object_name,
  case when c.relrowsecurity then 'PASS' else 'FAIL' end as status,
  'RLS=' || c.relrowsecurity::text as details
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relkind='r'
  and c.relname in (
    'profiles','companies','projects','parties','contracts','contract_items',
    'payment_requests','payment_request_items','payment_certificates','payments','deductions',
    'purchase_orders','purchase_order_items','warehouses','inventory_items','stock_movements',
    'approval_history','variation_orders','advances','financial_claims','document_attachments',
    'notifications','audit_logs'
  )

union all

-- B) No critical table/view should have direct anon privileges.
select
  'anon_privilege' as check_type,
  table_name as object_name,
  'FAIL' as status,
  string_agg(privilege_type, ',' order by privilege_type) as details
from information_schema.role_table_grants
where table_schema='public'
  and grantee='anon'
  and table_name in (
    'profiles','companies','projects','parties','contracts','contract_items',
    'payment_requests','payment_request_items','payment_certificates','payments','deductions',
    'purchase_orders','purchase_order_items','warehouses','inventory_items','stock_movements',
    'approval_history','variation_orders','advances','financial_claims','document_attachments',
    'notifications','audit_logs','v_contract_financial_summary','v_inventory_balances','v_project_executive_summary'
  )
group by table_name

union all

-- C) Critical foreign keys used by the frontend must resolve unambiguously.
select
  'fk' as check_type,
  tc.constraint_name as object_name,
  'PASS' as status,
  tc.table_name || '.' || kcu.column_name || ' -> ' || ccu.table_name || '.' || ccu.column_name as details
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name=kcu.constraint_name and tc.constraint_schema=kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name=tc.constraint_name and ccu.constraint_schema=tc.constraint_schema
where tc.constraint_schema='public'
  and tc.constraint_type='FOREIGN KEY'
  and tc.constraint_name in (
    'projects_created_by_fkey','projects_project_manager_id_fkey','approval_history_acted_by_fkey'
  )
order by check_type, object_name;

-- Any returned anon_privilege row is a failure; every existing critical table should show RLS PASS.
