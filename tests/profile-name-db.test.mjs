import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {createDatabase, asUser, seedWater, USERS} = createRequire(import.meta.url)('../scripts/preview-water.cjs');

test('nome escolhido no perfil com correção administrativa e proteção contra sobrescrita', async () => {
  const db = await createDatabase();
  try {
    await seedWater(db);
    await db.exec(await readFile(new URL('../supabase/021_profile_name_moderation.sql', import.meta.url), 'utf8'));
    await db.query("UPDATE coffee_private.profiles SET participant_id='ana-slot',cup_ranking_enabled=true WHERE user_id=$1", [USERS.ana.id]);
    await db.query('INSERT INTO coffee_private.comment_permissions(user_id) VALUES($1)', [USERS.ana.id]);
    await db.exec("UPDATE coffee_private.state SET participants='[{\"id\":\"ana-slot\",\"name\":\"Nome provisório\",\"icon\":\"C\",\"active\":true}]',queue='[\"ana-slot\"]' WHERE id=true");
    const before = (await db.query('SELECT to_jsonb(p) AS profile FROM coffee_private.profiles p WHERE user_id=$1', [USERS.ana.id])).rows[0].profile;
    await asUser(db);
    await assert.rejects(db.query('SELECT public.coffee_profile_name_set($1,$2,$3)', [USERS.ana.id, 'Nome moderado', USERS.ana.name]), /permission denied/);
    await asUser(db, 'ana');
    await assert.rejects(db.query('SELECT public.coffee_profile_name_set($1,$2,$3)', [USERS.bruno.id, 'Nome moderado', USERS.bruno.name]), /exclusivo do administrador/);
    await asUser(db, 'admin');
    await assert.rejects(db.query('SELECT public.coffee_profile_name_set($1,$2,$3)', [USERS.ana.id, '  ', USERS.ana.name]), /1 a 40/);
    await db.query('SELECT public.coffee_profile_name_set($1,$2,$3)', [USERS.ana.id, '  Ana do LSN  ', USERS.ana.name]);
    await assert.rejects(db.query('SELECT public.coffee_profile_name_set($1,$2,$3)', [USERS.ana.id, 'Nome antigo sobrescrito', USERS.ana.name]), /nome deste perfil mudou/);
    assert.equal((await db.query('SELECT public.coffee_read() AS data')).rows[0].data.state.participants[0].name, 'Ana do LSN');
    assert.ok((await db.query('SELECT public.coffee_water_read() AS data')).rows[0].data.queue.some(profile => profile.name === 'Ana do LSN'));
    assert.ok((await db.query('SELECT public.coffee_cups_read() AS data')).rows[0].data.ranking.some(profile => profile.name === 'Ana do LSN'));
    await db.exec('RESET ROLE');
    const after = (await db.query('SELECT to_jsonb(p) AS profile FROM coffee_private.profiles p WHERE user_id=$1', [USERS.ana.id])).rows[0].profile;
    const {name: oldName, ...previousFields} = before;
    const {name: newName, ...currentFields} = after;
    assert.equal(newName, 'Ana do LSN');
    assert.deepEqual(currentFields, previousFields);
    await asUser(db, 'ana');
    await db.query('SELECT public.coffee_profile_update($1,$2,$3)', ['Ana escolhida por mim', before.icon, before.photo]);
    assert.equal((await db.query('SELECT public.coffee_account() AS data')).rows[0].data.profile.name, 'Ana escolhida por mim');
  } finally { await db.close(); }
});
