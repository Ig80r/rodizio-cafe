-- Instalação para Supabase/PostgreSQL. Execute como postgres no SQL Editor.
-- Faça backup e confira funções existentes antes de instalar em um banco em uso.
begin;
create schema if not exists coffee_private;
revoke all on schema coffee_private from public, anon, authenticated;
create table if not exists coffee_private.admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists coffee_private.state(id boolean primary key default true check(id), version integer not null default 0, participants jsonb not null default '[]', queue jsonb not null default '[]');
insert into coffee_private.state(id) values(true) on conflict do nothing;
create table if not exists coffee_private.profiles(user_id uuid primary key references auth.users(id) on delete cascade, name text not null check(length(name) between 1 and 40), icon text not null check(length(icon) between 1 and 16), participant_id text unique);
create table if not exists coffee_private.requests(id uuid primary key, user_id uuid not null references auth.users(id), name text not null, icon text not null, quotas integer not null check(quotas between 1 and 100), note text not null check(length(note)<=200), status text not null default 'pending' check(status in ('pending','approved','rejected')), created_at timestamptz not null default now());
create table if not exists coffee_private.history(id uuid primary key, buyer_name text not null, buyer_icon text not null, quotas integer not null check(quotas between 1 and 100), note text not null, created_at timestamptz not null default now());
alter table coffee_private.admins enable row level security;
alter table coffee_private.state enable row level security;
alter table coffee_private.profiles enable row level security;
alter table coffee_private.requests enable row level security;
alter table coffee_private.history enable row level security;
create or replace function coffee_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from coffee_private.admins where user_id=auth.uid()) $$;
create or replace function coffee_private.require_admin() returns void language plpgsql security definer set search_path='' as $$ begin if not coffee_private.is_admin() then raise exception 'Acesso exclusivo do administrador.'; end if; end $$;
create or replace function public.coffee_read() returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object('admin',coffee_private.is_admin(),'state',(select to_jsonb(s)-'id' from coffee_private.state s),'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at desc) from coffee_private.history h),'[]'::jsonb)) $$;
create or replace function public.coffee_account() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 return jsonb_build_object('profile',(select to_jsonb(p) from coffee_private.profiles p where user_id=auth.uid()),'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from coffee_private.profiles p where coffee_private.is_admin()),'[]'::jsonb),'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from coffee_private.requests r where r.user_id=auth.uid() or coffee_private.is_admin()),'[]'::jsonb));
end $$;
create or replace function public.coffee_profile_save(p_name text,p_icon text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
 insert into coffee_private.profiles(user_id,name,icon) values(auth.uid(),trim(p_name),p_icon) on conflict(user_id) do update set name=excluded.name,icon=excluded.icon;
end $$;
create or replace function public.coffee_manage(p_version integer,p_participants jsonb,p_queue jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s coffee_private.state; p jsonb;
begin
 perform coffee_private.require_admin(); select * into s from coffee_private.state for update;
 if p_version is distinct from s.version then raise exception 'A fila mudou. Atualize antes de salvar.'; end if;
 if p_participants is null or p_queue is null or jsonb_typeof(p_participants)<>'array' or jsonb_typeof(p_queue)<>'array' then raise exception 'Participantes ou fila inválidos.'; end if;
 if jsonb_array_length(p_participants)>30 then raise exception 'Limite de 30 participantes.'; end if;
 for p in select value from jsonb_array_elements(p_participants) loop
  if coalesce(length(trim(p->>'name')),0) not between 1 and 40 or coalesce(length(p->>'icon'),0) not between 1 and 16 or coalesce(length(p->>'id'),0) not between 1 and 80 or jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception 'Participante inválido.'; end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_participants))<>jsonb_array_length(p_participants) then raise exception 'Participantes duplicados.'; end if;
 if (select count(distinct value) from jsonb_array_elements_text(p_queue))<>jsonb_array_length(p_queue) or exists(select 1 from jsonb_array_elements_text(p_queue) q where not exists(select 1 from jsonb_array_elements(p_participants) p where p->>'id'=q.value and (p->>'active')::boolean)) or jsonb_array_length(p_queue)<>(select count(*) from jsonb_array_elements(p_participants) p where (p->>'active')::boolean) then raise exception 'A fila deve conter cada participante ativo uma vez.'; end if;
 update coffee_private.state set participants=p_participants,queue=p_queue,version=version+1;
 update coffee_private.profiles pr set participant_id=null where not exists(select 1 from jsonb_array_elements(p_participants) p where p->>'id'=pr.participant_id);
end $$;
create or replace function public.coffee_member_approve(p_user uuid,p_slot text,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare s coffee_private.state;
begin
 perform coffee_private.require_admin();select * into s from coffee_private.state for update;
 if s.version is distinct from p_version then raise exception 'A fila mudou. Atualize a página.'; end if;
 if not exists(select 1 from jsonb_array_elements(s.participants) p where p->>'id'=p_slot) then raise exception 'Vaga inexistente.'; end if;
 update coffee_private.profiles set participant_id=p_slot where user_id=p_user;
 if not found then raise exception 'Perfil inexistente.'; end if;
 update coffee_private.state set version=version+1;
end $$;
create or replace function public.coffee_submit(p_id uuid,p_quotas integer,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare p coffee_private.profiles;
begin
 select * into p from coffee_private.profiles where user_id=auth.uid();
 if p.participant_id is null then raise exception 'Seu perfil precisa ser aprovado.'; end if;
 if exists(select 1 from coffee_private.requests where id=p_id and user_id=auth.uid() and quotas=p_quotas and note=coalesce(p_note,'')) then return; end if;
 insert into coffee_private.requests(id,user_id,name,icon,quotas,note) values(p_id,auth.uid(),p.name,p.icon,p_quotas,coalesce(p_note,''));
end $$;
-- A mesma transação registra a compra e avança a fila; IDs impedem duplicatas.
create or replace function coffee_private.record_buy(p_version integer,p_id uuid,p_quotas integer,p_note text,p_name text default null,p_icon text default null) returns void language plpgsql security definer set search_path='' as $$
declare s coffee_private.state; buyer jsonb; n integer;
begin
 select * into s from coffee_private.state for update;
 if exists(select 1 from coffee_private.history where id=p_id) then return; end if;
 if s.version is distinct from p_version then raise exception 'A fila mudou. Atualize a página.'; end if;
 n:=jsonb_array_length(s.queue);
 if n=0 then raise exception 'Adicione participantes ativos à fila.'; end if;
 if p_quotas is null or p_quotas not between 1 and 100 or length(coalesce(p_note,''))>200 then raise exception 'Compra inválida.'; end if;
 select p into buyer from jsonb_array_elements(s.participants) p where p->>'id'=s.queue->>0;
 insert into coffee_private.history(id,buyer_name,buyer_icon,quotas,note) values(p_id,coalesce(p_name,buyer->>'name'),coalesce(p_icon,buyer->>'icon'),p_quotas,coalesce(p_note,''));
 update coffee_private.state set queue=(select jsonb_agg(s.queue->((i+p_quotas)%n) order by i) from generate_series(0,n-1) i),version=version+1;
end $$;
create or replace function public.coffee_buy(p_version integer,p_id uuid,p_quotas integer,p_note text) returns void language plpgsql security definer set search_path='' as $$
begin perform coffee_private.require_admin();perform coffee_private.record_buy(p_version,p_id,p_quotas,p_note);end $$;
create or replace function public.coffee_review(p_id uuid,p_approve boolean,p_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r coffee_private.requests;
begin
 perform coffee_private.require_admin();
 select * into r from coffee_private.requests where id=p_id for update;
 if not found then raise exception 'Solicitação inexistente.'; end if;
 if r.status<>'pending' then return; end if;
 if p_approve is null then raise exception 'Informe a decisão.'; end if;
 if p_approve then perform coffee_private.record_buy(p_version,r.id,r.quotas,r.note,r.name,r.icon);end if;
 update coffee_private.requests set status=case when p_approve then 'approved' else 'rejected' end where id=p_id;
end $$;
revoke all on all tables in schema coffee_private from public,anon,authenticated;
revoke all on all functions in schema coffee_private from public,anon,authenticated;
-- Remova o EXECUTE padrão de PUBLIC apenas das funções desta aplicação.
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('coffee_read','coffee_account','coffee_profile_save','coffee_manage','coffee_member_approve','coffee_submit','coffee_buy','coffee_review') loop
 execute format('revoke all on function %s from public, anon, authenticated',f);
 execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
grant execute on function public.coffee_read() to anon;
commit;
