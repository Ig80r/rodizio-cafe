const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const USERS = {
  admin: {id: '30000000-0000-0000-0000-000000000001', name: 'Igor · administrador', email: 'admin@teste.local', icon: '🦖'},
  ana: {id: '30000000-0000-0000-0000-000000000002', name: 'Ana da bancada', email: 'ana@teste.local', icon: '🦊'},
  bruno: {id: '30000000-0000-0000-0000-000000000003', name: 'Bruno das equações', email: 'bruno@teste.local', icon: '🐸'},
  livia: {id: '30000000-0000-0000-0000-000000000004', name: 'Lívia dos experimentos', email: 'livia@teste.local', icon: '🦉'},
  bia: {id: '30000000-0000-0000-0000-000000000005', name: 'Bia · fora da água', email: 'bia@teste.local', icon: '🐝'}
};

async function createDatabase() {
  const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_user_meta_data jsonb NOT NULL DEFAULT '{}');
    CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
  `);
  const migrations = ['schema.sql', '002_profiles_comments.sql', '005_gazette_editor.sql',
    '006_gazette_comments.sql', '008_authors.sql', '009_article_formatting.sql',
    '010_public_badges.sql', '011_member_approval.sql', '012_comment_threads.sql',
    '013_user_deletion.sql', '014_cup_ranking.sql', '015_history_reset.sql',
    '016_post_editing.sql', '018_queue_rounds.sql', '019_cup_ranking_members.sql', '020_water_rotation.sql'];
  for (const file of migrations) await db.exec(await fs.readFile(path.join(ROOT, 'supabase', file), 'utf8'));
  for (const user of Object.values(USERS)) {
    await db.query('INSERT INTO auth.users VALUES($1,$2)', [user.id, {name: user.name}]);
    await db.query('UPDATE coffee_private.profiles SET icon=$1 WHERE user_id=$2', [user.icon, user.id]);
  }
  await db.query('INSERT INTO coffee_private.admins VALUES($1)', [USERS.admin.id]);
  await db.query('INSERT INTO coffee_private.comment_permissions(user_id) VALUES($1)', [USERS.bia.id]);
  return db;
}

async function asUser(db, key) {
  await db.exec('RESET ROLE');
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [USERS[key]?.id || '']);
  await db.exec('SET ROLE ' + (USERS[key] ? 'authenticated' : 'anon'));
}

async function seedWater(db) {
  await db.exec('RESET ROLE');
  await db.exec(`DELETE FROM coffee_private.water_requests; DELETE FROM coffee_private.water_history;
    DELETE FROM coffee_private.water_members; UPDATE coffee_private.water_state SET version=0,next_order=0 WHERE id=true;`);
  await asUser(db, 'admin');
  for (const [index, key] of ['ana', 'bruno', 'livia'].entries()) {
    await db.query('SELECT public.coffee_water_member_set($1,true,$2)', [USERS[key].id, index]);
  }
  await db.query("SELECT public.coffee_water_buy('40000000-0000-0000-0000-000000000001',$1,2,'Dois garrafões para adiantar a pesquisa',3)", [USERS.ana.id]);
  await db.query("SELECT public.coffee_water_buy('40000000-0000-0000-0000-000000000002',$1,1,'Garrafão deixado na copa',4)", [USERS.bruno.id]);
  await asUser(db, 'livia');
  await db.query("SELECT public.coffee_water_submit('40000000-0000-0000-0000-000000000003',1,'Já deixei o garrafão ao lado do bebedouro')");
  await db.exec('RESET ROLE');
}

function demoBanner() {
  return `<div class="water-demo-banner" role="region" aria-label="Controles da prévia"><strong>PRÉVIA LOCAL · DADOS DE EXEMPLO</strong><br>
  Alterne as contas para testar o rodízio. A senha das contas de teste é <strong>cafe1234</strong>.
  <div class="actions" style="margin-top:10px"><button type="button" data-demo-user="admin">Testar como administrador</button><button type="button" data-demo-user="ana">Testar como Ana</button><button type="button" data-demo-user="bia">Testar sem participação</button><button type="button" id="demo-reset">Recomeçar o teste</button></div></div>`;
}

async function startPreview(port = 4174) {
  const db = await createDatabase();
  await seedWater(db);
  let queue = Promise.resolve();
  const serialize = task => {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  };
  const allowed = new Set(['coffee_water_read', 'coffee_water_submit', 'coffee_water_member_set',
    'coffee_water_buy', 'coffee_water_review', 'coffee_cups_read', 'coffee_read', 'coffee_account', 'coffee_posts_read', 'coffee_comments_read']);
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const send = (status, body) => {
      response.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
      response.end(JSON.stringify(body));
    };
    try {
      if (url.pathname.startsWith('/__demo/')) {
        let body = '';
        for await (const chunk of request) body += chunk;
        const payload = body ? JSON.parse(body) : {};
        if (request.method !== 'POST') return send(405, {message: 'Use POST.'});
        if (url.pathname === '/__demo/reset') {
          await serialize(() => seedWater(db));
          return send(200, {});
        }
        if (url.pathname === '/__demo/auth/v1/token') {
          const key = url.searchParams.get('grant_type') === 'refresh_token'
            ? payload.refresh_token?.replace('preview-refresh-', '')
            : Object.keys(USERS).find(name => USERS[name].email === payload.email && payload.password === 'cafe1234');
          if (!USERS[key]) return send(400, {message: 'Use uma conta de teste e a senha cafe1234.'});
          return send(200, {access_token: 'preview-token-' + key, refresh_token: 'preview-refresh-' + key, expires_in: 3600});
        }
        if (url.pathname === '/__demo/auth/v1/logout') return send(200, {});
        const name = url.pathname.split('/').at(-1);
        if (!allowed.has(name)) return send(400, {message: 'Esta prévia permite testar o plantão da água.'});
        const key = request.headers.authorization?.replace('Bearer preview-token-', '');
        const entries = Object.entries(payload);
        if (entries.some(([parameter]) => !/^p_[a-z_]+$/.test(parameter))) return send(400, {message: 'Parâmetro inválido.'});
        const argumentsSql = entries.map(([parameter], index) => parameter + ' => $' + (index + 1)).join(',');
        const result = await serialize(async () => {
          await asUser(db, key);
          return db.query('SELECT public.' + name + '(' + argumentsSql + ') AS result', entries.map(([, value]) => value));
        });
        return send(200, result.rows[0].result ?? null);
      }
      const file = url.pathname === '/' ? 'agua.html' : decodeURIComponent(url.pathname.slice(1));
      if (!/^[a-z-]+\.(html|js|css)$/.test(file) && !/^assets\/[a-z-]+\.(svg|png)$/.test(file)) return send(404, {});
      if (file === 'config.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end('export const config=' + JSON.stringify({supabaseUrl: 'http://127.0.0.1:' + server.address().port + '/__demo', supabaseKey: 'preview-local', supportEmail: ''}) + ';');
        return;
      }
      if (file === 'water-demo-controls.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(`import {login} from './session-api.js?v=20261116';
          for(const button of document.querySelectorAll('[data-demo-user]')) button.onclick=async()=>{await login(button.dataset.demoUser+'@teste.local','cafe1234');location.reload();};
          document.querySelector('#demo-reset').onclick=async()=>{await fetch('/__demo/reset',{method:'POST'});location.reload();};`);
        return;
      }
      let content = await fs.readFile(path.join(ROOT, file));
      if (file.endsWith('.html')) {
        content = content.toString().replace(/<main([^>]*)>/, '$&' + demoBanner());
        content = content.replace('</body>', '<script type="module" src="./water-demo-controls.js"></script></body>');
      }
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'text/html');
      response.setHeader('Cache-Control', 'no-store');
      response.end(content);
    } catch (error) {
      send(error.code === '42501' ? 403 : 400, {message: error.message});
    }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  console.log('Prévia da água em http://127.0.0.1:' + server.address().port + '/agua.html');
  return {server, db};
}

module.exports = {createDatabase, asUser, seedWater, startPreview, USERS};
if (require.main === module) startPreview(Number(process.env.WATER_PREVIEW_PORT) || 4174).catch(error => {console.error(error); process.exitCode = 1;});
