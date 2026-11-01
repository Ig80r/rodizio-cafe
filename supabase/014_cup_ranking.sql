-- Requer 013 e as autorizações de comentários da atualização 011.
begin;
create table if not exists coffee_private.cup_days(
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 cups integer not null check(cups>=0),
 primary key(user_id,day)
);
create table if not exists coffee_private.cup_changes(
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 day date not null,
 delta integer not null check(delta between -100 and 100 and delta<>0),
 created_at timestamptz not null default now()
);
alter table coffee_private.cup_days enable row level security;
alter table coffee_private.cup_changes enable row level security;
revoke all on coffee_private.cup_days,coffee_private.cup_changes from public,anon,authenticated;

create or replace function public.coffee_cups_read() returns jsonb
language sql stable security definer set search_path='' as $$
 with calendar as (
  select timezone('America/Sao_Paulo',now())::date as today,date_trunc('week',timezone('America/Sao_Paulo',now()))::date as week_start
 ), scores as (
  select p.name,p.icon,p.photo,coalesce(p.user_id=auth.uid(),false) as is_me,
   exists(select 1 from coffee_private.admins a where a.user_id=p.user_id) as is_admin,
   exists(select 1 from coffee_private.authors a where a.user_id=p.user_id) as is_author,
   coalesce(t.today,0) as today,coalesce(t.week,0) as week,coalesce(t.total,0) as total,
   round(coalesce(t.total,0)*0.15,2) as liters,
   case when t.first_day is null then 0::numeric else round(coalesce(t.total,0)::numeric/(c.today-t.first_day+1),2) end as average,
   t.first_day,p.user_id
  from coffee_private.profiles p cross join calendar c
  left join lateral (
   select sum(d.cups) filter(where d.day=c.today) as today,
    sum(d.cups) filter(where d.day>=c.week_start) as week,sum(d.cups) as total,min(d.day) as first_day
   from coffee_private.cup_days d where d.user_id=p.user_id and d.day<=c.today
  ) t on true
  where exists(select 1 from coffee_private.comment_permissions cp where cp.user_id=p.user_id)
     or exists(select 1 from coffee_private.admins a where a.user_id=p.user_id)
 )
 select jsonb_build_object('day',c.today,'week_start',c.week_start,'cup_ml',150,
  'can_log',coffee_private.can_comment() and exists(select 1 from coffee_private.profiles p where p.user_id=auth.uid()),
  'account_id',auth.uid(),'own_today',coalesce((select cups from coffee_private.cup_days where user_id=auth.uid() and day=c.today),0),
  'ranking',coalesce((select jsonb_agg(to_jsonb(s)-'user_id' order by s.today desc,s.week desc,s.total desc,lower(s.name),s.user_id) from scores s),'[]'::jsonb))
 from calendar c
$$;

create or replace function public.coffee_cups_adjust(p_id uuid,p_delta integer,p_day date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_day date:=timezone('America/Sao_Paulo',now())::date;v_inserted uuid;
begin
 if v_user is null then raise exception 'Entre na sua conta para registrar café.';end if;
 -- Impede que um token antigo recrie registros enquanto a conta é excluída.
 perform 1 from auth.users where id=v_user for key share;
 if not found then raise exception 'Esta conta não está mais disponível.';end if;
 if not coffee_private.can_comment() then raise exception 'O administrador precisa autorizar seus comentários na Gazeta para você registrar café.';end if;
 if not exists(select 1 from coffee_private.profiles where user_id=v_user) then raise exception 'Salve seu nome no perfil antes de registrar café.';end if;
 if p_id is null or p_day is null or p_delta is null or p_delta=0 or p_delta not between -100 and 100 then raise exception 'Escolha de 1 a 100 xícaras por alteração.';end if;
 insert into coffee_private.cup_changes(id,user_id,day,delta) values(p_id,v_user,v_day,p_delta)
 on conflict(id) do nothing returning id into v_inserted;
 if v_inserted is null then
  if not exists(select 1 from coffee_private.cup_changes where id=p_id and user_id=v_user and delta=p_delta and day=p_day) then raise exception 'Identificador de registro indisponível.';end if;
  return public.coffee_cups_read();
 end if;
 if p_day is distinct from v_day then raise exception 'O dia mudou. Atualize o placar antes de registrar o café de hoje.';end if;
 if p_delta>0 then
  insert into coffee_private.cup_days(user_id,day,cups) values(v_user,v_day,p_delta)
  on conflict(user_id,day) do update set cups=coffee_private.cup_days.cups+excluded.cups;
 else
  update coffee_private.cup_days set cups=cups+p_delta where user_id=v_user and day=v_day and cups>=-p_delta;
  if not found then raise exception 'Você não pode remover mais xícaras do que registrou hoje.';end if;
 end if;
 return public.coffee_cups_read();
end $$;
revoke all on function public.coffee_cups_read(),public.coffee_cups_adjust(uuid,integer,date) from public,anon,authenticated;
grant execute on function public.coffee_cups_read() to anon,authenticated;
grant execute on function public.coffee_cups_adjust(uuid,integer,date) to authenticated;
notify pgrst, 'reload schema';
commit;
