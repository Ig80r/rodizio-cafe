begin;
-- Requer 002_profiles_comments.sql; preserva páginas legadas e seus comentários.
create table if not exists coffee_private.posts (
 id text primary key check(length(id) between 1 and 80),
 title text not null check(length(trim(title)) between 1 and 120),
 quote text not null check(length(trim(quote)) between 1 and 1000),
 author text not null check(length(trim(author)) between 1 and 80),
 published_on date not null, body text not null default '' check(length(body)<=3000),
 image text, caption text not null default '' check(length(caption)<=200),
 published boolean not null default true, created_at timestamptz not null default now()
);
alter table coffee_private.posts enable row level security;
revoke all on coffee_private.posts from public,anon,authenticated;
insert into coffee_private.posts(id,title,quote,author,published_on,caption) values
 ('gazeta-001','Direto da bancada','O código não tem bug. Ele só está testando a nossa fé.','Bolsista anônimo','2026-10-31','Flagrante: mais uma tentativa de resolver tudo com café.'),
 ('gazeta-002','Mais uma tentativa','Meu experimento é reproduzível. O erro acontece toda vez.','Pesquisador sem cafeína','2026-10-31','Entre um café e um experimento.')
on conflict do nothing;
alter table coffee_private.comments drop constraint if exists comments_page_id_check;
-- FK preserves the association even when new pages are inserted ahead of old ones.
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='coffee_private.comments'::regclass and conname='comments_post_fk') then
  alter table coffee_private.comments add constraint comments_post_fk foreign key(page_id) references coffee_private.posts(id);
 end if;
end $$;
create or replace function public.coffee_posts_read() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id),'[]'::jsonb) from coffee_private.posts p where p.published or coffee_private.is_admin()
$$;
create or replace function public.coffee_post_publish(p_id text,p_title text,p_quote text,p_author text,p_date date,p_body text,p_image text,p_caption text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform coffee_private.require_admin();
 if p_image is not null and (length(p_image)>1200000 or p_image !~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$') then raise exception 'Imagem inválida ou muito grande.'; end if;
 -- Retrying the same publication ID does not duplicate it or change an existing page.
 if exists(select 1 from coffee_private.posts where id=p_id) then return; end if;
 insert into coffee_private.posts(id,title,quote,author,published_on,body,image,caption)
 values(p_id,trim(p_title),trim(p_quote),trim(p_author),p_date,coalesce(p_body,''),p_image,coalesce(p_caption,''));
end $$;
-- Existing accounts may predate the signup-name trigger. Backfill their profile at comment time.
create or replace function public.coffee_comment_add(p_id uuid,p_page text,p_body text) returns void language plpgsql security definer set search_path='' as $$
declare v_name text;
begin
 if auth.uid() is null then raise exception 'Entre para comentar.'; end if;
 if not exists(select 1 from coffee_private.posts where id=p_page and published) then raise exception 'Esta página não está publicada.'; end if;
 if length(trim(coalesce(p_body,''))) not between 1 and 500 then raise exception 'Escreva de 1 a 500 caracteres.'; end if;
 if not exists(select 1 from coffee_private.profiles where user_id=auth.uid()) then
  select left(trim(coalesce(nullif(raw_user_meta_data->>'name',''),nullif(raw_user_meta_data->>'full_name',''),'Cafeteiro')),40) into v_name from auth.users where id=auth.uid();
  insert into coffee_private.profiles(user_id,name,icon) values(auth.uid(),coalesce(nullif(v_name,''),'Cafeteiro'),'🦊') on conflict do nothing;
 end if;
 if exists(select 1 from coffee_private.comments where id=p_id and user_id=auth.uid()) then return; end if;
 insert into coffee_private.comments(id,page_id,user_id,body) values(p_id,p_page,auth.uid(),trim(p_body));
end $$;
create or replace function public.coffee_comments_read(p_page text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at,c.id),'[]'::jsonb) from (
 select c.id,c.body,c.created_at,p.name,p.icon,p.photo,(c.user_id=auth.uid() or coffee_private.is_admin()) as can_delete
 from coffee_private.comments c join coffee_private.profiles p on p.user_id=c.user_id
 join coffee_private.posts post on post.id=c.page_id and post.published
 where c.page_id=p_page order by c.created_at desc,c.id desc limit 100
 ) c
$$;
revoke all on function public.coffee_posts_read() from public,anon,authenticated;
revoke all on function public.coffee_post_publish(text,text,text,text,date,text,text,text) from public,anon,authenticated;
revoke all on function public.coffee_comment_add(uuid,text,text), public.coffee_comments_read(text) from public,anon,authenticated;
grant execute on function public.coffee_posts_read(), public.coffee_comments_read(text) to anon,authenticated;
grant execute on function public.coffee_comment_add(uuid,text,text), public.coffee_post_publish(text,text,text,text,date,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
