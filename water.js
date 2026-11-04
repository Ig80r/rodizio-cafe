import {rpc, hasSession, login, logout} from './session-api.js?v=20261116';

const $ = selector => document.querySelector(selector);
let data = null;
let busy = false;
let loadedActor = null;
let attempts = {};
let orderDraft = null;
let orderVersion = null;
let orderDirty = false;
const labels = {pending: 'Aguardando aprovação', approved: 'Aprovada', rejected: 'Recusada'};
const sprites = {'🦊': 'raposa', '🐸': 'carcara', '🦥': 'sagui', '🦖': 'tatu-peba', '🐙': 'prea', '🦄': 'moco', '🐼': 'gato-do-mato', '🐧': 'mao-pelada', '🦉': 'coruja-buraqueira', '🐝': 'bem-te-vi'};

function element(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}

function person(profile) {
  const name = element('b', undefined, 'person-label');
  const image = element('img', undefined, 'avatar');
  image.alt = '';
  image.width = 36;
  image.height = 36;
  const fallback = './assets/' + (sprites[profile.icon] || 'cup') + '.svg';
  image.src = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(profile.photo || '') ? profile.photo : fallback;
  image.onerror = () => { image.onerror = null; image.src = fallback; };
  name.append(image, element('span', profile.name));
  return name;
}

function status(message) {
  $('#water-status').textContent = message;
}

function storeAttempts() {
  if (!data?.me?.id) return;
  try { sessionStorage.setItem('water-attempts:' + data.me.id, JSON.stringify(attempts)); } catch {}
}

function restoreAttempts() {
  const actor = data?.me?.id || null;
  if (loadedActor === actor) return;
  loadedActor = actor;
  attempts = {};
  if (!actor) return;
  try { attempts = JSON.parse(sessionStorage.getItem('water-attempts:' + actor)) || {}; } catch {}
  for (const [mode, selector] of [['submit', '#water-submit'], ['buy', '#water-buy']]) {
    const payload = attempts[mode]?.payload;
    if (!payload) continue;
    const form = $(selector);
    form.elements.quantity.value = payload.p_quantity;
    form.elements.note.value = payload.p_note;
    if (mode === 'buy') form.elements.buyer.value = payload.p_user;
  }
  updateVolumes();
}

async function sendOnce(mode, name, payload) {
  const signature = JSON.stringify(payload);
  if (attempts[mode] && attempts[mode].signature !== signature) {
    throw Error('Há um envio sem confirmação. Tente novamente com a quantidade e a observação anteriores.');
  }
  if (!attempts[mode]) {
    attempts[mode] = {id: crypto.randomUUID(), signature, payload, version: data.version};
    storeAttempts();
  }
  const attempt = attempts[mode];
  const body = {...attempt.payload, p_id: attempt.id};
  if (mode === 'buy') body.p_version = attempt.version;
  try {
    await rpc(name, body);
    delete attempts[mode];
    storeAttempts();
  } catch (error) {
    if (error.status && error.status < 500) {
      delete attempts[mode];
      storeAttempts();
    }
    throw error;
  }
}

function syncAccess() {
  $('#water-submit').hidden = !data?.me?.is_member;
  $('#water-own-section').hidden = !hasSession();
  $('#water-admin').hidden = !data?.admin;
  $('#water-login-toggle').hidden = hasSession();
  $('#water-logout').hidden = !hasSession();
  if (hasSession()) $('#water-login').hidden = true;
  let message = 'Entre na sua conta para solicitar cotas de água.';
  if (hasSession()) message = data?.me?.is_member
    ? 'Você participa do rodízio. Registre os garrafões que entregou para o administrador confirmar.'
    : data?.admin ? 'Você pode incluir seu próprio perfil nos participantes da água abaixo.' : 'Peça ao administrador para incluir seu perfil na fila da água.';
  $('#water-access').textContent = message;
  document.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  if (!busy) $('#water-buy button[type=submit]').disabled = !data?.queue?.length;
  syncOrderControls();
}

function renderQueue() {
  const root = $('#water-queue');
  root.replaceChildren();
  const next = data.queue[0];
  $('#water-next').textContent = next?.name || 'Quem inaugura o garrafão?';
  $('#water-people').textContent = data.queue.length;
  $('#water-bottles').textContent = Number(data.bottles).toLocaleString('pt-BR');
  $('#water-liters').textContent = Number(data.liters).toLocaleString('pt-BR') + ' L';
  for (const [index, profile] of data.queue.entries()) {
    const card = element('article', undefined, 'person');
    card.append(person(profile), element('small', index === 0 ? 'É sua vez de salvar a hidratação!' : (index + 1) + 'º na fila'));
    const ahead = profile.rounds - Math.min(...data.queue.map(item => item.rounds));
    if (ahead > 0) card.append(element('small', ahead + ' rodada(s) coberta(s)', 'water-credit'));
    if (profile.is_me) card.append(element('small', 'Você', 'water-credit'));
    root.append(card);
  }
  if (!next) root.append(element('p', 'O administrador ainda está montando a equipe da hidratação.'));
}

async function review(request, approve) {
  if (!confirm((approve ? 'Confirmar' : 'Recusar') + ' ' + request.quantity + ' garrafão(ões) de ' + request.name + '?')) return;
  await rpc('coffee_water_review', {p_id: request.id, p_approve: approve, p_version: data.version});
  await load();
  status(approve ? 'Entrega confirmada. Rodadas contabilizadas e hidratação salva.' : 'Solicitação recusada.');
}

function orderChanged() {
  return Boolean(orderDraft && data && orderDraft.map(item => item.id).join(',') !== data.queue.map(item => item.id).join(','));
}

function syncOrderControls() {
  const changed = orderChanged();
  const stale = orderVersion !== data?.version;
  $('#water-order-save').disabled = busy || !data?.admin || !changed || stale;
  $('#water-order-discard').disabled = busy || !data?.admin || (!changed && !stale);
  for (const button of document.querySelectorAll('#water-order-list button')) {
    const position = Number(button.dataset.position);
    button.disabled = busy || position < 0 || position >= (orderDraft?.length || 0);
  }
}

function renderOrder() {
  const root = $('#water-order-list');
  root.replaceChildren();
  if (!data?.admin) { orderDraft = null; orderVersion = null; orderDirty = false; return; }
  if (!orderDraft || !orderDirty) {
    orderDraft = data.queue.slice();
    orderVersion = data.version;
  }
  for (const [index, profile] of orderDraft.entries()) {
    const row = element('div', undefined, 'water-order-row');
    row.append(element('span', (index + 1) + 'º', 'water-position'), person(profile));
    const actions = element('div', undefined, 'actions');
    for (const [offset, title] of [[-1, 'Subir'], [1, 'Descer']]) {
      const button = element('button', title);
      button.type = 'button';
      button.dataset.position = index + offset;
      button.setAttribute('aria-label', title + ' ' + profile.name);
      button.onclick = () => {
        const destination = index + offset;
        [orderDraft[index], orderDraft[destination]] = [orderDraft[destination], orderDraft[index]];
        orderDirty = orderChanged();
        renderOrder();
        syncOrderControls();
      };
      actions.append(button);
    }
    row.append(actions);
    root.append(row);
  }
  $('#water-order-note').textContent = orderVersion !== data.version
    ? 'A fila mudou durante seus ajustes. Use Descartar ajustes para carregar a versão atual.'
    : orderChanged() ? 'Após salvar, a vez será de ' + orderDraft[0].name + '.' : 'A ordem exibida está salva.';
  if (!orderDraft.length) root.append(element('p', 'Inclua participantes para organizar a fila da água.'));
}

function renderAdmin() {
  const profiles = $('#water-member-profiles');
  const pending = $('#water-pending');
  const select = $('#water-buy select');
  const previous = select.value;
  profiles.replaceChildren();
  pending.replaceChildren();
  select.replaceChildren();
  renderOrder();
  if (!data.admin) return;
  for (const profile of data.profiles) {
    const row = element('article', undefined, 'author-profile');
    row.dataset.userId = profile.id;
    const info = element('div');
    info.append(person(profile), element('small', profile.active ? 'Participa da água' : 'Fora do rodízio da água'));
    const button = element('button', profile.active ? 'Retirar da água' : 'Incluir na água');
    button.type = 'button';
    button.onclick = () => action(async () => {
      await rpc('coffee_water_member_set', {p_user: profile.id, p_enabled: !profile.active, p_version: data.version});
      await load();
      status(profile.active ? 'Participante retirado da fila da água.' : 'Participante incluído na fila da água.');
    });
    row.append(info, button);
    profiles.append(row);
  }
  if (!data.profiles.length) profiles.append(element('p', 'Os perfis cadastrados aparecem aqui.'));
  for (const profile of data.queue) {
    const option = element('option', profile.name);
    option.value = profile.id;
    select.append(option);
  }
  if (data.queue.some(profile => profile.id === previous)) select.value = previous;
  for (const request of data.requests.filter(item => item.status === 'pending')) {
    const row = element('article', undefined, 'water-request');
    row.append(element('strong', request.name), element('p', request.quantity + ' garrafão(ões) · ' + request.quantity * 20 + ' L'), element('p', request.note));
    const actions = element('div', undefined, 'actions');
    for (const [approve, title] of [[true, 'Confirmar entrega'], [false, 'Recusar']]) {
      const button = element('button', title);
      button.type = 'button';
      button.onclick = () => action(() => review(request, approve));
      actions.append(button);
    }
    row.append(actions);
    pending.append(row);
  }
  if (!pending.children.length) pending.append(element('p', 'Nenhuma entrega aguardando confirmação.'));
}

function renderHistory() {
  const history = $('#water-history');
  history.replaceChildren();
  for (const record of data.history) {
    const row = element('article', undefined, 'history-row');
    const info = element('div');
    info.append(person(record), element('small', new Date(record.created_at).toLocaleString('pt-BR')));
    if (record.note) info.append(element('small', record.note));
    row.append(info, element('strong', record.quantity + ' garrafão(ões) · ' + record.quantity * 20 + ' L'));
    history.append(row);
  }
  if (!history.children.length) history.append(element('p', 'Nenhum garrafão registrado. O primeiro herói ainda está a caminho.'));
  const own = $('#water-own-requests');
  own.replaceChildren();
  for (const request of data.requests.filter(item => item.user_id === data.me?.id)) {
    own.append(element('p', request.quantity + ' garrafão(ões) · ' + labels[request.status]));
  }
  if (!own.children.length) own.append(element('p', 'Você ainda não enviou solicitações de água.'));
}

async function load() {
  const result = await rpc('coffee_water_read');
  if (!result || !Array.isArray(result.queue)) throw Error('Não foi possível carregar a fila da água.');
  data = result;
  renderQueue();
  renderAdmin();
  renderHistory();
  restoreAttempts();
  syncAccess();
}

async function action(task) {
  if (busy) return;
  busy = true;
  syncAccess();
  try { await task(); }
  catch (error) {
    let message = error.message;
    if (/coffee_water_.*schema cache|Could not find the function.*coffee_water_/.test(message)) message = 'O plantão da água ainda precisa ser ativado pelo administrador.';
    if (error instanceof TypeError || error.name === 'TimeoutError') message = 'A conexão foi beber água. Tente novamente com os mesmos dados.';
    status(message);
  } finally {
    busy = false;
    syncAccess();
  }
}

function quantity(form) {
  const value = Number(form.elements.quantity.value);
  if (!Number.isInteger(value) || value < 1 || value > 100) throw Error('Informe de 1 a 100 garrafões.');
  return value;
}

function updateVolumes() {
  for (const selector of ['#water-submit', '#water-buy']) {
    const form = $(selector);
    const value = Number(form.elements.quantity.value);
    form.querySelector('.water-volume').textContent = Number.isInteger(value) && value > 0 ? value + ' garrafão(ões) = ' + value * 20 + ' litros' : '1 garrafão = 20 litros';
  }
}

$('#water-submit').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const form = event.target;
    await sendOnce('submit', 'coffee_water_submit', {p_quantity: quantity(form), p_note: form.elements.note.value.trim()});
    form.reset();
    updateVolumes();
    await load();
    status('Solicitação enviada. O administrador já pode confirmar a entrega.');
  });
};
$('#water-buy').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const form = event.target;
    const amount = quantity(form);
    const buyer = form.elements.buyer;
    if (!buyer.value) throw Error('Inclua pelo menos um participante na fila da água.');
    if (!confirm('Registrar ' + amount + ' garrafão(ões) de ' + buyer.selectedOptions[0].textContent + '?')) return;
    await sendOnce('buy', 'coffee_water_buy', {p_user: buyer.value, p_quantity: amount, p_note: form.elements.note.value.trim()});
    form.reset();
    updateVolumes();
    await load();
    status('Entrega registrada. O laboratório respira aliviado.');
  });
};
$('#water-login-toggle').onclick = () => {
  $('#water-login').hidden = !$('#water-login').hidden;
  if (!$('#water-login').hidden) $('#water-login input').focus();
};
$('#water-login').onsubmit = event => {
  event.preventDefault();
  action(async () => {
    const form = event.target;
    await login(form.elements.email.value.trim(), form.elements.password.value);
    form.elements.password.value = '';
    orderDraft = null;
    orderDirty = false;
    await load();
    status('Bem-vindo ao plantão da hidratação.');
    if (location.hash === '#water-admin' && data.admin) $('#water-admin').scrollIntoView({behavior: 'smooth'});
  });
};
$('#water-logout').onclick = () => action(async () => {
  try { await logout(); }
  finally { await load(); }
});
$('#water-order-save').onclick = () => action(async () => {
  if (!data?.admin || !orderChanged()) return;
  await rpc('coffee_water_queue_set', {p_order: orderDraft.map(profile => profile.id), p_version: orderVersion});
  orderDraft = null;
  orderDirty = false;
  await load();
  status('Ordem da água salva. A próxima pessoa já foi atualizada.');
});
$('#water-order-discard').onclick = () => { orderDraft = null; orderDirty = false; renderOrder(); syncOrderControls(); };
$('#water-refresh').onclick = () => action(load);
for (const form of [$('#water-submit'), $('#water-buy')]) form.elements.quantity.oninput = updateVolumes;
window.addEventListener('coffee-session-changed', () => { if (!busy) action(load); });
updateVolumes();
action(load);
