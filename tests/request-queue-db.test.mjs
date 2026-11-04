import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {PGlite}=createRequire(import.meta.url)(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('cotas cobrem rodadas inteiras em aprovações e compras manuais', async()=>{
 const db=new PGlite();
 const admin='10000000-0000-0000-0000-000000000001';
 const buyer='10000000-0000-0000-0000-000000000002';
 const request='20000000-0000-0000-0000-000000000001';
 const second='20000000-0000-0000-0000-000000000002';
 const other='10000000-0000-0000-0000-000000000003';
 const review=(id,approved,version)=>db.query('select public.coffee_review($1,$2,$3)',[id,approved,version]);
 const state=async()=>(await db.query('select public.coffee_read() as data')).rows[0].data;
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;`);
  for(const file of ['schema.sql','002_profiles_comments.sql','005_gazette_editor.sql','008_authors.sql','010_public_badges.sql','018_queue_rounds.sql']){
   await db.exec(await readFile(new URL('../supabase/'+file,import.meta.url),'utf8'));
  }
  await db.query('insert into auth.users(id) values($1),($2),($3)',[admin,buyer,other]);
  await db.query('insert into coffee_private.admins values($1)',[admin]);
  await db.query("insert into coffee_private.profiles(user_id,name,icon,participant_id) values($1,'Ana','C','a'),($2,'Bruno','C','b')",[buyer,other]);
  const participants=['a','b','c','d'].map(id=>({id,name:id.toUpperCase(),icon:'C',active:true}));
  await db.query("update coffee_private.state set participants=$1::jsonb,queue='[\"a\",\"b\",\"c\",\"d\"]' where id=true",[JSON.stringify(participants)]);
  await db.query("insert into coffee_private.requests(id,user_id,name,icon,quotas,note) values($1,$2,'Ana','C',2,'Compra'),($3,$4,'Bruno','C',1,'Compra')",[request,buyer,second,other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[buyer]);
  await db.exec('set role authenticated');
  await assert.rejects(review(request,true,0),/exclusivo do administrador/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  await assert.rejects(review(request,true,8),/fila mudou/);
  await review(request,true,0);
  await review(request,true,0);
  assert.deepEqual((await state()).state.queue,['b','c','d','a']);
  await review(second,true,1);
  const approved=await state();
  assert.deepEqual(approved.state.queue,['c','d','b','a']);
  assert.equal(approved.state.version,2);
  assert.deepEqual(approved.state.queue_rounds,{a:2,b:1});
  const manual=version=>db.query("select public.coffee_buy($1,gen_random_uuid(),1,'Compra direta')",[version]);
  await manual(2);
  await manual(3);
  assert.deepEqual((await state()).state.queue,['b','c','d','a']);
  await manual(4);
  await manual(5);
  await manual(6);
  assert.deepEqual((await state()).state.queue,['a','b','c','d']);
  const saved=await state();
  assert.equal(saved.history.length,7);
  assert.equal(saved.history.reduce((sum,entry)=>sum+entry.quotas,0),8);
  // An admin can reorder peers without erasing the rounds already paid.
  await manual(7);
  await db.query('select public.coffee_manage(8,$1::jsonb,$2::jsonb)',[JSON.stringify(participants),JSON.stringify(['a','d','c','b'])]);
  assert.deepEqual((await state()).state.queue,['d','c','b','a']);
 }finally{await db.close();}
});
