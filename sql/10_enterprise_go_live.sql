-- Maskan ERP Enterprise v1.4
-- Final go-live controls: audit trail + budget control + contract alerts
-- Run once in Supabase SQL Editor. Safe: creates new ERP objects and triggers only.

begin;

create table if not exists public.erp_audit_log (
  id bigserial primary key,
  company_id uuid null references public.companies(id) on delete set null,
  table_name text not null,
  record_id text null,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data jsonb null,
  new_data jsonb null,
  changed_by uuid null,
  changed_at timestamptz not null default now()
);

create index if not exists ix_erp_audit_log_company_date
  on public.erp_audit_log(company_id,changed_at desc);
create index if not exists ix_erp_audit_log_table_record
  on public.erp_audit_log(table_name,record_id);

alter table public.erp_audit_log enable row level security;
revoke all on table public.erp_audit_log from anon;
revoke insert,update,delete,truncate,references,trigger on table public.erp_audit_log from authenticated;
grant select on table public.erp_audit_log to authenticated;

-- Tenant-scoped audit read policy.
drop policy if exists erp_audit_read_company on public.erp_audit_log;
create policy erp_audit_read_company on public.erp_audit_log
for select to authenticated
using (
  company_id is null or exists (
    select 1 from public.profiles p
    where p.id=auth.uid()
      and p.company_id=erp_audit_log.company_id
      and coalesce(p.is_active,true)=true
  )
);

create or replace function public.erp_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  j_old jsonb;
  j_new jsonb;
  cid uuid;
  rid text;
begin
  if TG_OP='DELETE' then
    j_old=to_jsonb(OLD); j_new=null;
  elsif TG_OP='INSERT' then
    j_old=null; j_new=to_jsonb(NEW);
  else
    j_old=to_jsonb(OLD); j_new=to_jsonb(NEW);
  end if;

  begin
    cid=coalesce((j_new->>'company_id')::uuid,(j_old->>'company_id')::uuid);
  exception when others then cid=null;
  end;
  rid=coalesce(j_new->>'id',j_old->>'id');

  insert into public.erp_audit_log(company_id,table_name,record_id,action,old_data,new_data,changed_by)
  values(cid,TG_TABLE_NAME,rid,TG_OP,j_old,j_new,auth.uid());

  return coalesce(NEW,OLD);
end;
$$;

revoke all on function public.erp_audit_trigger() from public,anon,authenticated;

-- Attach audit triggers to operational tables when present.
do $$
declare
  t text;
  tables text[]:=array[
    'projects','parties','contracts','payment_requests','payment_certificates','payments',
    'deductions','advances','purchase_orders','stock_movements','variation_orders',
    'financial_claims','document_attachments','profiles'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_erp_audit on public.%I',t);
      execute format('create trigger trg_erp_audit after insert or update or delete on public.%I for each row execute function public.erp_audit_trigger()',t);
    end if;
  end loop;
end $$;

-- Budget versus commitments/paid view.
create or replace view public.v_erp_budget_control as
select
  p.id as project_id,
  p.company_id,
  p.project_code,
  p.project_name_ar,
  coalesce(p.contract_value,0)::numeric as contract_value,
  coalesce(p.budget_value,0)::numeric as budget_value,
  coalesce(p.completion_percentage,0)::numeric as completion_percentage,
  coalesce((select sum(py.amount) from public.payments py where py.project_id=p.id),0)::numeric as paid_amount,
  coalesce((select sum(po.total_amount) from public.purchase_orders po where po.project_id=p.id and coalesce(po.status,'') not in ('cancelled','rejected')),0)::numeric as purchase_commitments,
  (coalesce(p.budget_value,0)
   - coalesce((select sum(py.amount) from public.payments py where py.project_id=p.id),0)
   - coalesce((select sum(po.total_amount) from public.purchase_orders po where po.project_id=p.id and coalesce(po.status,'') not in ('cancelled','rejected')),0))::numeric as budget_remaining
from public.projects p;

grant select on public.v_erp_budget_control to authenticated;

-- Contract expiry / overdue alerts.
create or replace view public.v_erp_contract_alerts as
select
  c.id as contract_id,
  c.company_id,
  c.contract_number,
  c.title,
  c.project_id,
  c.end_date,
  c.status,
  case
    when c.end_date is null then 'no_date'
    when c.end_date < current_date then 'expired'
    when c.end_date <= current_date + 30 then 'expires_30d'
    when c.end_date <= current_date + 60 then 'expires_60d'
    else 'ok'
  end as alert_level,
  case when c.end_date is null then null else (c.end_date-current_date) end as days_remaining
from public.contracts c
where coalesce(c.status,'') not in ('cancelled','completed');

grant select on public.v_erp_contract_alerts to authenticated;

commit;

-- Verification
select 'erp_audit_log' as object_name, to_regclass('public.erp_audit_log') is not null as ready
union all select 'v_erp_budget_control', to_regclass('public.v_erp_budget_control') is not null
union all select 'v_erp_contract_alerts', to_regclass('public.v_erp_contract_alerts') is not null
union all select 'next_erp_number', exists(select 1 from pg_proc where proname='next_erp_number');