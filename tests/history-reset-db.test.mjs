import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('reset de abastecimento: autorização, confirmação, concorrência e preservação das demais tabelas',async()=>{
 const db=new PGlite(),admin='10000000-0000-0000-0000-000000000001',user='10000000-0000-0000-0000-000000000002',request='20000000-0000-0000-0000-000000000001',next='20000000-0000-0000-0000-000000000002';
 async function as(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
 const reset=(version,confirmation='RESETAR')=>db.query('select public.coffee_history_reset($1,$2)',[version,confirmation]);
 const snapshot=async()=>{const data={};for(const table of ['profiles','admins','requests','authors','comment_permissions','comments','posts','cup_days','cup_changes'])data[table]=(await db.query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as data from coffee_private.${table} t`)).rows[0].data;return data;};
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
 for(const file of ['schema.sql','002_profiles_comments.sql','005_gazette_editor.sql','006_gazette_comments.sql','008_authors.sql','009_article_formatting.sql','010_public_badges.sql','011_member_approval.sql','012_comment_threads.sql','013_user_deletion.sql','014_cup_ranking.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1,$2),($3,$4)',[admin,{name:'Admin'},user,{name:'Cafeteiro'}]);await db.query('insert into coffee_private.admins values($1)',[admin]);await db.query('insert into coffee_private.authors(user_id) values($1)',[user]);await db.query('insert into coffee_private.comment_permissions(user_id) values($1)',[user]);
 await db.query("update coffee_private.state set participants='[{\"id\":\"a\",\"name\":\"Admin\",\"icon\":\"C\",\"active\":true},{\"id\":\"b\",\"name\":\"Cafeteiro\",\"icon\":\"C\",\"active\":true}]',queue='[\"b\",\"a\"]' where id=true");
 await db.query("insert into coffee_private.requests(id,user_id,name,icon,quotas,note,status) values($1,$2,'Cafeteiro','C',2,'Compra anterior','approved'),($3,$2,'Cafeteiro','C',1,'Compra pendente','pending')",[request,user,next]);
 await db.query("insert into coffee_private.history(id,buyer_name,buyer_icon,quotas,note) values($1,'Cafeteiro','C',2,'Compra anterior')",[request]);
 await db.query("insert into coffee_private.comments(id,page_id,user_id,body) values($1,'gazeta-001',$2,'Comentário preservado')",[request,user]);
 await db.query("insert into coffee_private.cup_days values($1,timezone('America/Sao_Paulo',now())::date,8)",[user]);await db.query("insert into coffee_private.cup_changes(id,user_id,day,delta) values($1,$2,timezone('America/Sao_Paulo',now())::date,8)",[request,user]);
 const preserved=await snapshot(),initialState=(await db.query('select * from coffee_private.state where id=true')).rows[0];
 // Installing (or reinstalling) the feature never resets existing history.
 for(let i=0;i<2;i++)await db.exec(await readFile(new URL('../supabase/015_history_reset.sql',import.meta.url),'utf8'));
 assert.equal((await db.query('select count(*)::int as n from coffee_private.history')).rows[0].n,1);
 await as(null,'anon');await assert.rejects(reset(0),/permission denied/);await as(user);await assert.rejects(reset(0),/exclusivo do administrador/);
 await as(admin);await assert.rejects(reset(0,'EXCLUIR'),/digitando RESETAR/);await assert.rejects(reset(null),/dados mudaram/);await assert.rejects(reset(3),/dados mudaram/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from coffee_private.history')).rows[0].n,1);
 await as(admin);await reset(0);const overview=(await db.query('select public.coffee_read() as data')).rows[0].data;assert.deepEqual(overview.history,[]);assert.deepEqual(overview.state.queue,initialState.queue);assert.deepEqual(overview.state.participants,initialState.participants);assert.equal(overview.state.version,1);
 await db.exec('reset role');assert.deepEqual(await snapshot(),preserved,'only history and the concurrency version change');
 await as(admin);await assert.rejects(db.query("select public.coffee_buy(0,$1,2,'Tentativa antiga')",[request]),/fila mudou/);
 await db.query("select public.coffee_buy(1,$1,1,'Nova compra após reset')",[next]);await assert.rejects(reset(0),/dados mudaram/);await assert.rejects(reset(1),/dados mudaram/);
 // An already approved request cannot recreate an erased history record.
 await db.query('select public.coffee_review($1,true,2)',[request]);await db.exec('reset role');const history=(await db.query('select * from coffee_private.history')).rows;assert.equal(history.length,1);assert.equal(history[0].note,'Nova compra após reset');
 await as(admin);await reset(2);await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from coffee_private.history')).rows[0].n,0);assert.deepEqual(await snapshot(),preserved);
 }finally{await db.close();}
});
