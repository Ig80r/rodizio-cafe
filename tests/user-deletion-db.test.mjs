import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
test('exclusão real em PostgreSQL: autorização, transação, fila e respostas preservadas',async()=>{
 const db=new PGlite();
 const admin='10000000-0000-0000-0000-000000000001',member='10000000-0000-0000-0000-000000000002',other='10000000-0000-0000-0000-000000000003';
 const root='20000000-0000-0000-0000-000000000001',reply='20000000-0000-0000-0000-000000000002';
 const asUser=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
 const remove=(id,confirmation='EXCLUIR')=>db.query('select public.coffee_user_delete($1::uuid,$2::text)',[id,confirmation]);
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;`);
 for(const file of ['schema.sql','002_profiles_comments.sql','005_gazette_editor.sql','006_gazette_comments.sql','008_authors.sql','009_article_formatting.sql','010_public_badges.sql','011_member_approval.sql','012_comment_threads.sql','013_user_deletion.sql','013_user_deletion.sql']){
  try{await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));}catch(error){throw Error(file+': '+error.message,{cause:error});}
 }
 await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,'{\"name\":\"Admin\"}'),($2,'{\"name\":\"Membro\"}'),($3,'{\"name\":\"Outro\"}')",[admin,member,other]);
 await db.query('insert into coffee_private.admins(user_id) values($1)',[admin]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[root,member]);
 await db.query("update coffee_private.state set participants='[{\"id\":\"a\",\"name\":\"Admin\",\"active\":true},{\"id\":\"m\",\"name\":\"Membro\",\"active\":true},{\"id\":\"o\",\"name\":\"Outro\",\"active\":true}]',queue='[\"o\",\"m\",\"a\"]' where id=true");
 await db.query("update coffee_private.profiles set participant_id='m' where user_id=$1",[member]);
 await db.query('insert into coffee_private.authors(user_id,granted_by) values($1,$2)',[member,admin]);
 await db.query('insert into coffee_private.comment_permissions(user_id,granted_by) values($1,$2)',[member,admin]);
 await db.query("insert into coffee_private.requests(id,user_id,name,icon,quotas,note) values($1,$2,'Membro','C',2,'Compra')",[root,member]);
 await db.query("insert into coffee_private.history(id,buyer_name,buyer_icon,quotas,note) values($1,'Membro','C',2,'Compra confirmada')",[root]);
 await db.query("update coffee_private.posts set created_by=$1 where id='gazeta-001'",[member]);
 await db.query("insert into coffee_private.comments(id,page_id,user_id,body) values($1,'gazeta-001',$2,'Comentário original')",[root,member]);
 await db.query("insert into coffee_private.comments(id,page_id,user_id,body,parent_id) values($1,'gazeta-001',$2,'Resposta preservada',$3)",[reply,other,root]);
 await asUser(null,'anon');await assert.rejects(remove(member),/permission denied/);
 await asUser(other);await assert.rejects(remove(member),/exclusivo do administrador/);
 await asUser(admin);await assert.rejects(remove(admin),/própria conta/);await assert.rejects(remove(member,'excluir'),/digitando EXCLUIR/);await assert.rejects(remove(null),/Informe a conta/);
 await assert.rejects(remove('10000000-0000-0000-0000-000000000099'),/Conta não encontrada/);
 // Any unexpected foreign key rolls back the entire operation, including queue and comments.
 await db.exec('reset role;create table public.deletion_blocker(user_id uuid references auth.users(id));');await db.query('insert into public.deletion_blocker values($1)',[member]);
 await asUser(admin);await assert.rejects(remove(member),/foreign key/);await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int as n from coffee_private.requests where user_id=$1',[member])).rows[0].n,1);
 assert.equal((await db.query('select deleted_at from coffee_private.comments where id=$1',[root])).rows[0].deleted_at,null);
 assert.equal((await db.query('select version from coffee_private.state where id=true')).rows[0].version,0);
 await db.exec('delete from public.deletion_blocker');await asUser(admin);await remove(member);await db.exec('reset role');
 for(const table of ['auth.users','auth.sessions','coffee_private.profiles','coffee_private.authors','coffee_private.comment_permissions','coffee_private.requests']){
 const column=table==='auth.users'?'id':'user_id';assert.equal((await db.query(`select count(*)::int as n from ${table} where ${column}=$1`,[member])).rows[0].n,0,table);
 }
 const state=(await db.query('select * from coffee_private.state where id=true')).rows[0];assert.equal(state.version,1);assert.deepEqual(state.queue,['o','a']);assert.deepEqual(state.participants.map(p=>p.id),['a','o']);
 assert.equal((await db.query('select count(*)::int as n from coffee_private.history')).rows[0].n,1);
 const post=(await db.query("select created_by,published from coffee_private.posts where id='gazeta-001'")).rows[0];assert.equal(post.created_by,null);assert.equal(post.published,true);
 const original=(await db.query('select * from coffee_private.comments where id=$1',[root])).rows[0];assert.equal(original.user_id,null);assert.ok(original.deleted_at);assert.equal(original.body,'Comentário removido.');
 assert.equal((await db.query('select parent_id from coffee_private.comments where id=$1',[reply])).rows[0].parent_id,root);
 await asUser(null,'anon');const comments=(await db.query("select public.coffee_comments_read('gazeta-001') as comments")).rows[0].comments;assert.equal(comments.length,2);assert.equal(comments.find(c=>c.id===root).deleted,true);assert.equal(comments.find(c=>c.id===reply).body,'Resposta preservada');
 // Even an outstanding JWT cannot recover publication/comment privileges after account deletion.
 await asUser(member);const account=(await db.query('select public.coffee_account() as account')).rows[0].account;assert.equal(account.can_comment,false);assert.equal(account.can_publish,false);assert.equal(account.profile,null);
 await asUser(admin);await remove(other);await db.exec('reset role');assert.equal((await db.query('select version from coffee_private.state where id=true')).rows[0].version,1,'unlinked account does not change queue version');
 }finally{await db.close();}
});
