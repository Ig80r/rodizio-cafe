import {rpc,hasSession,login,logout} from './session-api.js?v=20261116';
const $=selector=>document.querySelector(selector),node=(tag,text,cls)=>{const item=document.createElement(tag);if(text!==undefined)item.textContent=text;if(cls)item.className=cls;return item;};
let data=null,busy=false,period='today',pending=null,sessionChanged=false;
const topLines=['A morte veio te buscar. Ficou para o cafezinho.','Seu sangue já vem com torra média.','A cafeteira te chama de chefe. O laboratório já está preocupado.','Não é um perfil. É uma máquina de converter café em hipótese.'];
const bottomLines=['É café, galera. Não é água, não. Mas também não é peça de museu.','A xícara está limpa. O álibi também.','Veio pela ciência. Esqueceu o combustível.','A cafeteira perguntou se vocês ainda são amigos.'];
const topLine=topLines[Math.floor(Math.random()*topLines.length)],bottomLine=bottomLines[Math.floor(Math.random()*bottomLines.length)];
const number=(value,digits=0)=>Number(value).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const date=value=>new Date(value+'T12:00:00').toLocaleDateString('pt-BR');
const animals={'🦊':'raposa','🐸':'carcara','🦥':'sagui','🦖':'tatu-peba','🐙':'prea','🦄':'moco','🐼':'gato-do-mato','🐧':'mao-pelada','🦉':'coruja-buraqueira','🐝':'bem-te-vi'};
function avatar(person){const image=node('img',undefined,'cup-avatar');image.alt='';image.width=44;image.height=44;const fallback='./assets/'+(animals[person.icon]||'cup')+'.svg';image.src=person.photo&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(person.photo)?person.photo:fallback;image.onerror=()=>{image.onerror=null;image.src=fallback;};return image;}
function medal(index){const image=node('img',undefined,'cup-medal');image.src='./assets/podium-'+['gold','silver','bronze'][index]+'.svg';image.alt=['1º · Caneca de ouro','2º · Cafeteira de prata','3º · Grão de bronze'][index];image.width=40;image.height=40;return image;}
function status(text){$('#cups-status').textContent=text;}
function pendingKey(actor){return 'coffee-cup-attempt:'+actor;}
function restorePending(){
 if(pending||!data?.account_id)return;
 try{const saved=JSON.parse(sessionStorage.getItem(pendingKey(data.account_id)));if(saved?.actor===data.account_id&&typeof saved.id==='string'&&Number.isInteger(saved.delta)&&saved.delta!==0&&Math.abs(saved.delta)<=100&&/^\d{4}-\d{2}-\d{2}$/.test(saved.day))pending=saved;}catch{}
}
function storePending(){try{sessionStorage.setItem(pendingKey(pending.actor),JSON.stringify(pending));}catch{}}
function clearPending(){try{if(pending)sessionStorage.removeItem(pendingKey(pending.actor));}catch{}pending=null;}
function syncControls(){
 const allowed=Boolean(data?.can_log&&hasSession());$('#cup-form').hidden=!allowed;$('#cup-own').hidden=!allowed;$('#cup-guest').hidden=hasSession();$('#cup-logout').hidden=!hasSession();
 if(hasSession()){$('#cup-login').hidden=true;$('#cup-login-toggle').setAttribute('aria-expanded','false');}
 let accessMessage = 'Entre na sua conta. O administrador libera a participação no ranking e os comentários na Gazeta.';
 if (hasSession()) {
   accessMessage = data?.ranking_enabled === false
     ? 'Você está fora do ranking da cafeína. Peça ao administrador para incluir seu perfil.'
     : 'Para registrar café, o administrador precisa autorizar seus comentários na Gazeta.';
 }
 if (allowed) accessMessage = 'Sua xícara, sua responsabilidade estatística.';
 $('#cup-access').textContent = accessMessage;
 $('#cup-pending').hidden=!allowed||!pending;$('#cup-retry').hidden=!allowed||!pending;if(pending)$('#cup-pending').textContent='Registro sem confirmação: '+(pending.delta>0?'+':'')+pending.delta+' xícara(s), em '+date(pending.day)+'. Confirme antes de lançar outro.';
 if(data)$('#cup-own').textContent=number(data.own_today)+' xícara(s) hoje · '+number(data.own_today*.15,2)+' L estimados';
 document.querySelectorAll('button').forEach(button=>button.disabled=busy);
 if(!busy)$('#cup-remove').disabled=!allowed||!data?.own_today;
}
function render(){
 if(!data)return;syncControls();$('#cups-calendar').textContent=date(data.day)+' · Semana iniciada em '+date(data.week_start);
 $('#cups-ranking-title').textContent={today:'Ranking de hoje',week:'Ranking da semana',total:'Ranking acumulado'}[period];
 const rows=data.ranking.map((person,index)=>({...person,order:index})).sort((a,b)=>b[period]-a[period]||b.today-a.today||b.week-a.week||b.total-a.total||a.order-b.order);
 const root=$('#cups-ranking');root.replaceChildren();$('#cups-empty').hidden=Boolean(rows.length);
 rows.forEach((person,index)=>{const row=node('tr');if(index===0&&person[period]>0)row.classList.add('cup-first-row');if(person.is_me)row.classList.add('cup-own-row');
 const profile=node('th');profile.scope='row';const identity=node('div',undefined,'cup-identity');const position=node('span',undefined,'cup-podium');if(index<3)position.append(medal(index),node('small',String(index+1)+'º'));else position.append(node('span',String(index+1)+'º','cup-position'));identity.append(position,avatar(person));
 const name=node('span',person.name);for(const role of ['admin','author'])if(person['is_'+role]){const badge=node('span',undefined,'role-badge '+role+'-badge'),image=node('img');image.src='./assets/badge-'+role+'.svg';image.alt='';image.width=16;image.height=18;badge.append(image,node('span',role==='admin'?'ADMIN':'AUTOR'));name.append(badge);}if(person.is_me)name.append(node('small','Você','cup-you'));identity.append(name);profile.append(identity);row.append(profile);
 for(const key of ['today','week','total','average','liters']){const cell=node('td',number(person[key],['average','liters'].includes(key)?2:0)+(key==='liters'?' L':''));cell.dataset.label={today:'Hoje',week:'Semana',total:'Acumulado',average:'Média / dia',liters:'Litros totais'}[key];row.append(cell);}root.append(row);
 });
 const leader=$('#cup-leader');leader.replaceChildren();leader.hidden=!rows.length||rows[0][period]<=0;
 if(!leader.hidden){const content=node('div');content.append(node('span','PESQUISADOR EM COMBUSTÃO','eyebrow'),node('h3',rows[0].name),node('p',topLine));const count=node('div',undefined,'cup-leader-count');count.append(node('strong',number(rows[0][period])),node('span','xícara(s) '+{today:'hoje',week:'nesta semana',total:'no acumulado'}[period]));leader.append(medal(0),content,count);}
 const last=$('#cup-last');last.replaceChildren();last.hidden=rows.length<2||rows[0][period]<=rows.at(-1)[period];
 if(!last.hidden){last.append(node('span','☕','cup-last-icon'),node('div'));last.lastChild.append(node('span','LANTERNINHA DA CAFEÍNA','eyebrow'),node('strong',rows.at(-1).name),node('p',bottomLine));}
}
function validate(result){if(!result||!Array.isArray(result.ranking)||!result.day)throw Error('O placar respondeu de um jeito estranho. Tente atualizar.');return result;}
async function load(){data=validate(await rpc('coffee_cups_read'));restorePending();render();}
async function action(fn){if(busy)return;busy=true;syncControls();try{await fn();}catch(error){status(/coffee_cups_.*schema cache|Could not find the function.*coffee_cups_/.test(error.message)?'O placar ainda não foi inaugurado. Avise o administrador.':error instanceof TypeError||error.name==='TimeoutError'?'A conexão foi tomar café. Tente novamente; o mesmo registro não será contado duas vezes.':error.message);}finally{busy=false;syncControls();if(sessionChanged){sessionChanged=false;pending=null;action(load);}}}
async function changeCups(delta){
 if(!Number.isInteger(delta)||delta===0||Math.abs(delta)>100)throw Error('Escolha de 1 a 100 xícaras por vez.');
 if(!data?.can_log||!hasSession())throw Error('Você precisa de autorização para registrar café.');
 if(delta<0&&!pending&&-delta>data.own_today)throw Error('Você não pode remover mais xícaras do que registrou hoje.');
 if(pending&&pending.delta!==delta)throw Error('Há um registro sem confirmação. Use “Confirmar registro pendente” antes de lançar outro.');
 if(!pending){pending={id:crypto.randomUUID(),delta,day:data.day,actor:data.account_id};storePending();}
 try{data=validate(await rpc('coffee_cups_adjust',{p_id:pending.id,p_delta:delta,p_day:pending.day}));clearPending();render();status(delta<0?'Correção salva. A estatística agradece a honestidade.':'Registro confirmado. Mais um dado para a pesquisa.');}
 catch(error){if(error.status&&error.status<500){clearPending();try{await load();}catch{}}throw error;}
}
$('#cup-form').onsubmit=event=>{event.preventDefault();const quantity=Number(event.target.elements.quantity.value),remove=event.submitter?.value==='remove';action(()=>changeCups(remove?-quantity:quantity));};
$('#cup-retry').onclick=()=>{if(pending)action(()=>changeCups(pending.delta));};
$('#cup-login-toggle').onclick=()=>{const form=$('#cup-login');form.hidden=!form.hidden;$('#cup-login-toggle').setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)form.elements.email.focus();};
$('#cup-login').onsubmit=event=>{event.preventDefault();action(async()=>{await login(event.target.elements.email.value.trim(),event.target.elements.password.value);event.target.elements.password.value='';pending=null;await load();status('Bem-vindo. A cafeteira estava esperando.');});};
$('#cup-logout').onclick=()=>action(async()=>{try{await logout();}finally{pending=null;await load();status('Você saiu. A xícara fica.');}});
$('#cups-refresh').onclick=()=>action(async()=>{await load();status('Placar atualizado.');});
for(const button of document.querySelectorAll('[data-period]'))button.onclick=()=>{period=button.dataset.period;document.querySelectorAll('[data-period]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));render();};
window.addEventListener('coffee-session-changed',()=>{if(busy){sessionChanged=true;return;}pending=null;action(load);});
setInterval(()=>{if(!document.hidden&&!busy)action(load);},60000);
action(load);
