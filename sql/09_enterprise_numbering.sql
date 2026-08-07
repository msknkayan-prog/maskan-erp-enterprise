-- Maskan ERP Enterprise v1.3
-- Automatic document numbering service (tenant-safe)
-- Run once in Supabase SQL Editor.

begin;

create table if not exists public.erp_sequences (
  company_id uuid not null references public.companies(id) on delete cascade,
  doc_type text not null,
  last_value bigint not null default 0 check (last_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (company_id, doc_type)
);

alter table public.erp_sequences enable row level security;

-- Sequence rows are managed through the SECURITY DEFINER RPC below.
revoke all on table public.erp_sequences from anon;
revoke all on table public.erp_sequences from authenticated;

create or replace function public.next_erp_number(
  p_company_id uuid,
  p_doc_type text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
  v_prefix text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.company_id = p_company_id
      and coalesce(p.is_active,true) = true
  ) then
    raise exception 'User is not authorized for this company';
  end if;

  v_prefix := case p_doc_type
    when 'party' then 'PTY'
    when 'project' then 'PRJ'
    when 'contract' then 'CNT'
    when 'request' then 'REQ'
    when 'certificate' then 'CERT'
    when 'payment' then 'PAY'
    when 'purchase_order' then 'PO'
    else null
  end;

  if v_prefix is null then
    raise exception 'Unsupported document type: %', p_doc_type;
  end if;

  insert into public.erp_sequences(company_id,doc_type,last_value,updated_at)
  values (p_company_id,p_doc_type,1,now())
  on conflict (company_id,doc_type)
  do update set
    last_value=public.erp_sequences.last_value+1,
    updated_at=now()
  returning last_value into v_next;

  return v_prefix || '-' || lpad(v_next::text,6,'0');
end;
$$;

revoke all on function public.next_erp_number(uuid,text) from public;
revoke all on function public.next_erp_number(uuid,text) from anon;
grant execute on function public.next_erp_number(uuid,text) to authenticated;

commit;

-- Verification (read-only)
select proname,prosecdef
from pg_proc
where proname='next_erp_number';
