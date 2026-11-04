import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('placar em PostgreSQL: permissão, totais, média, idempotência e correção sem negativos',async()=>{
 const db=new PGlite(),admin='10000000-0000-0000-0000-000000000001',ana='10000000-0000-0000-0000-000000000002',bia='10000000-0000-0000-0000-000000000003',blocked='10000000-0000-0000-0000-000000000004';
 let sequence=0;const id=()=>`20000000-0000-0000-0000-${String(++sequence).padStart(12,'0')}`;
 async function as(user,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);await db.exec('set role '+role);}
 const read=async()=>(await db.query('select public.coffee_cups_read() as data')).rows[0].data;
 const adjust=async(key,delta,day)=>(await db.query('select public.coffee_cups_adjust($1,$2,$3)',[key,delta,day])).rows[0].coffee_cups_adjust;
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');create table auth.sessions(id uuid primary key,user_id uuid references auth.users on delete cascade);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;`);
 for(const file of ['schema.sql','002_profiles_comments.sql','005_gazette_editor.sql','006_gazette_comments.sql','008_authors.sql','009_article_formatting.sql','010_public_badges.sql','011_member_approval.sql','012_comment_threads.sql','013_user_deletion.sql','014_cup_ranking.sql','014_cup_ranking.sql'])await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
 for(const [user,name] of [[admin,'Admin'],[ana,'Ana'],[bia,'Bia'],[blocked,'Sem aval']])await db.query('insert into auth.users values($1,$2)',[user,{name}]);
 await db.query('insert into coffee_private.admins values($1)',[admin]);await db.query('insert into coffee_private.comment_permissions(user_id) values($1),($2)',[ana,bia]);await db.query('insert into coffee_private.authors(user_id) values($1)',[blocked]);
 const dates=(await db.query("select timezone('America/Sao_Paulo',now())::date::text as today,date_trunc('week',timezone('America/Sao_Paulo',now()))::date::text as monday,(timezone('America/Sao_Paulo',now())::date-1)::text as yesterday")).rows[0];
 await db.query("insert into coffee_private.cup_days values($1,$2::date,3),($1,date_trunc('week',$2::date)::date-1,10),($1,$2::date-20,5),($3,$2::date,5)",[ana,dates.today,bia]);
 await db.exec(await readFile(new URL('../supabase/019_cup_ranking_members.sql',import.meta.url),'utf8'));
 await as(ana);await assert.rejects(db.query('select public.coffee_cup_ranking_set($1,false)',[bia]),/exclusivo do administrador/);
 await as(admin);await db.query('select public.coffee_cup_ranking_set($1,false)',[ana]);
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/019_cup_ranking_members.sql',import.meta.url),'utf8'));
 await as(ana);assert.equal((await read()).ranking_enabled,false);assert.equal((await read()).can_log,false);assert.equal((await read()).ranking.some(p=>p.name==='Ana'),false);await assert.rejects(adjust(id(),1,dates.today),/incluir você no ranking/);
 assert.equal((await db.query('select public.coffee_account() as account')).rows[0].account.can_comment,true);
 await as(admin);await db.query('select public.coffee_cup_ranking_set($1,true)',[ana]);await db.query('select public.coffee_cup_ranking_set($1,true)',[blocked]);
 await db.exec('reset role');const newcomer='10000000-0000-0000-0000-000000000005';await db.query('insert into auth.users values($1,$2)',[newcomer,{name:'Novo perfil'}]);await db.query('insert into coffee_private.comment_permissions(user_id) values($1)',[newcomer]);await db.exec(await readFile(new URL('../supabase/019_cup_ranking_members.sql',import.meta.url),'utf8'));
 await as(newcomer);assert.equal((await read()).can_log,false);assert.equal((await read()).ranking_enabled,false);
 await as(null,'anon');const publicData=await read();assert.equal(publicData.day,dates.today);assert.equal(publicData.week_start,dates.monday);assert.equal(publicData.can_log,false);assert.equal(publicData.account_id,null);assert.equal(publicData.ranking.length,3);assert.equal(publicData.ranking[0].name,'Bia');assert.equal(publicData.ranking.some(p=>'user_id' in p),false);
 const score=publicData.ranking.find(p=>p.name==='Ana');assert.deepEqual([score.today,score.week,score.total,score.liters,score.average],[3,3,18,2.7,.86]);
 await assert.rejects(adjust(id(),1,dates.today),/permission denied/);await assert.rejects(db.query('select * from coffee_private.cup_days'),/permission denied/);
 await as(blocked);assert.equal((await read()).can_log,false);await assert.rejects(adjust(id(),1,dates.today),/autorizar seus comentários/);
 await as(ana);assert.equal((await read()).can_log,true,'allowed without participant slot');const addId=id();let data=await adjust(addId,2,dates.today);assert.equal(data.own_today,5);assert.equal(data.ranking[0].name,'Ana');assert.equal(data.ranking.find(p=>p.name==='Ana').is_me,true);
 data=await adjust(addId,2,dates.today);assert.equal(data.own_today,5,'same ID does not count twice');await assert.rejects(adjust(addId,3,dates.today),/Identificador/);
 await as(bia);await assert.rejects(adjust(addId,2,dates.today),/Identificador/);assert.equal((await read()).own_today,5,'cannot alter another account');
 await as(ana);const minusId=id();data=await adjust(minusId,-3,dates.today);assert.equal(data.own_today,2);await adjust(minusId,-3,dates.today);assert.equal((await read()).own_today,2);
 await assert.rejects(adjust(id(),-3,dates.today),/mais xícaras/);await assert.rejects(adjust(id(),0,dates.today),/1 a 100/);await assert.rejects(adjust(id(),101,dates.today),/1 a 100/);await assert.rejects(adjust(id(),1,dates.yesterday),/dia mudou/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int as n from coffee_private.cup_changes')).rows[0].n,2,'failed mutations roll back idempotency markers');const oldId=id();await db.query('insert into coffee_private.cup_changes(id,user_id,day,delta) values($1,$2,$3,1)',[oldId,ana,dates.yesterday]);
 await db.query('insert into coffee_private.cup_days(user_id,day,cups) values($1,$2,1) on conflict(user_id,day) do update set cups=coffee_private.cup_days.cups+1',[ana,dates.yesterday]);
 await as(ana);assert.equal((await adjust(oldId,1,dates.yesterday)).own_today,2,'confirmed previous-day retry does not move coffee into today');await db.exec('reset role');
 await db.query('delete from coffee_private.comment_permissions where user_id=$1',[ana]);
 await as(ana);assert.equal((await read()).can_log,false);assert.equal((await read()).ranking.some(p=>p.name==='Ana'),false);await assert.rejects(adjust(id(),1,dates.today),/autorizar seus comentários/);
 await db.exec('reset role');await db.query('insert into coffee_private.comment_permissions(user_id) values($1)',[ana]);await as(ana);assert.equal((await read()).own_today,2);await adjust(id(),-2,dates.today);assert.equal((await read()).own_today,0);
 await as(admin);assert.equal((await adjust(id(),1,dates.today)).own_today,1,'administrator has same implicit permission as comments');await db.query("select public.coffee_user_delete($1,'EXCLUIR')",[ana]);await db.exec('reset role');
 for(const table of ['cup_days','cup_changes'])assert.equal((await db.query(`select count(*)::int as n from coffee_private.${table} where user_id=$1`,[ana])).rows[0].n,0);
 await as(ana);await assert.rejects(adjust(id(),1,dates.today),/conta não está mais disponível/);
 }finally{await db.close();}
});
