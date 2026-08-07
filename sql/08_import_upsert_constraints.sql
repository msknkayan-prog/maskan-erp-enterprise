-- Maskan ERP Enterprise v1.2.1
-- Production import UPSERT support
-- Adds tenant-safe UNIQUE indexes required by Supabase/PostgREST ON CONFLICT.
-- IMPORTANT: This script does not delete or merge data.

begin;

-- Preflight: stop with a clear error if duplicate business keys already exist
-- within the same company. Resolve duplicates manually before rerunning.
do $$
declare
  dup text;
begin
  select string_agg(msg, E'\n') into dup
  from (
    select 'parties(company_id,party_code): '||company_id::text||' / '||party_code||' x'||count(*) as msg
    from public.parties where company_id is not null and party_code is not null
    group by company_id,party_code having count(*)>1
    union all
    select 'projects(company_id,project_code): '||company_id::text||' / '||project_code||' x'||count(*)
    from public.projects where company_id is not null and project_code is not null
    group by company_id,project_code having count(*)>1
    union all
    select 'contracts(company_id,contract_number): '||company_id::text||' / '||contract_number||' x'||count(*)
    from public.contracts where company_id is not null and contract_number is not null
    group by company_id,contract_number having count(*)>1
    union all
    select 'payment_requests(company_id,request_number): '||company_id::text||' / '||request_number||' x'||count(*)
    from public.payment_requests where company_id is not null and request_number is not null
    group by company_id,request_number having count(*)>1
    union all
    select 'payment_certificates(company_id,certificate_number): '||company_id::text||' / '||certificate_number||' x'||count(*)
    from public.payment_certificates where company_id is not null and certificate_number is not null
    group by company_id,certificate_number having count(*)>1
    union all
    select 'payments(company_id,payment_number): '||company_id::text||' / '||payment_number||' x'||count(*)
    from public.payments where company_id is not null and payment_number is not null
    group by company_id,payment_number having count(*)>1
    union all
    select 'purchase_orders(company_id,po_number): '||company_id::text||' / '||po_number||' x'||count(*)
    from public.purchase_orders where company_id is not null and po_number is not null
    group by company_id,po_number having count(*)>1
  ) d;

  if dup is not null then
    raise exception 'Duplicate import keys found. Resolve these before creating unique indexes:%', E'\n'||dup;
  end if;
end $$;

create unique index if not exists ux_parties_company_party_code
  on public.parties(company_id, party_code);

create unique index if not exists ux_projects_company_project_code
  on public.projects(company_id, project_code);

create unique index if not exists ux_contracts_company_contract_number
  on public.contracts(company_id, contract_number);

create unique index if not exists ux_payment_requests_company_request_number
  on public.payment_requests(company_id, request_number);

create unique index if not exists ux_payment_certificates_company_certificate_number
  on public.payment_certificates(company_id, certificate_number);

create unique index if not exists ux_payments_company_payment_number
  on public.payments(company_id, payment_number);

create unique index if not exists ux_purchase_orders_company_po_number
  on public.purchase_orders(company_id, po_number);

commit;

-- Verification
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname='public'
  and indexname in (
    'ux_parties_company_party_code',
    'ux_projects_company_project_code',
    'ux_contracts_company_contract_number',
    'ux_payment_requests_company_request_number',
    'ux_payment_certificates_company_certificate_number',
    'ux_payments_company_payment_number',
    'ux_purchase_orders_company_po_number'
  )
order by tablename,indexname;
