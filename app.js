import {config} from './config.js';
const $=s=>document.querySelector(s);
const icons=['🦊','🐸','🦥','🦖','🐙','🦄','🐼','🐧','🦉','🐝'];
let token=null, data=null, draft=[], busy=false, pending=null, account=null, submission=null;
const configured=Boolean(config.supabaseUrl && config.supabaseKey);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function status(text){$('#status').textContent=text;}
async function request(path,body){
 const headers={apikey:config.supabaseKey,'Content-Type':'application/json'};
 if(token)headers.Authorization=`Bearer ${token}`;
 const r=await fetch(config.supabaseUrl.replace(/\/$/,'')+path,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const result=await r.json().catch(()=>null);
 if(!r.ok){if(r.status===401){token=null;$('#controls').hidden=true;$('#member').hidden=true;$('#signup').hidden=false;$('#login').hidden=false;}throw Error(result?.message||result?.error_description||result?.msg||`Falha de conexão (${r.status}).`);}
 return result;
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function load(){if(!configured)return;const fresh=await request('/rest/v1/rpc/coffee_read',{});data=fresh;account=token?await request('/rest/v1/rpc/coffee_account',{}):null;draft=structuredClone(data.state.participants);status('');render();$('#updated').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');}
function ordered(){return data.state.queue.map(id=>data.state.participants.find(p=>p.id===id)).filter(Boolean);}
function render(){syncDraft();const queue=ordered(),h=data.history;$('#next').textContent=queue[0]?`${queue[0].icon} ${queue[0].name}`:'Fila em pausa';$('#people').textContent=queue.length;const total=h.reduce((s,x)=>s+x.quotas,0);$('#quotas').textContent=total;$('#weight').textContent=(total*250/1000).toLocaleString('pt-BR')+' kg';$('#queue').replaceChildren();queue.forEach((p,i)=>{const card=el('article',undefined,'person');card.append(el('span',p.icon,'avatar'),el('b',p.name),el('small',i===0?'É a sua vez!':`${i+1}º na fila`));$('#queue').append(card);});if(!queue.length)$('#queue').append(el('p','Nenhum participante ativo.'));
 $('#history').replaceChildren();h.forEach(x=>{const row=el('article',undefined,'history-row'),left=el('div');left.append(el('b',`${x.buyer_icon} ${x.buyer_name}`),el('small',new Date(x.created_at).toLocaleString('pt-BR')));if(x.note)left.append(el('small',x.note));row.append(left,el('strong',`${x.quotas} × 250 g = ${x.quotas*250} g`));$('#history').append(row);});if(!h.length)$('#history').append(el('p','O primeiro cafezinho ainda vai entrar para a história.'));
 $('#controls').hidden=!data.admin;$('#login').hidden=Boolean(token);$('#logout').hidden=!token;renderAccount();renderEditors();preview();}
function renderEditors(){const root=$('#editors');root.replaceChildren();draft.forEach((p,i)=>{const row=el('div',undefined,'editor');const label=el('label','Nome'),input=el('input');input.value=p.name;input.maxLength=40;input.required=true;input.oninput=()=>p.name=input.value;label.append(input);const il=el('label','Ícone'),select=el('select');[...new Set([...icons,p.icon])].forEach(icon=>{const opt=el('option',icon);opt.value=icon;select.append(opt);});select.value=p.icon;select.onchange=()=>p.icon=select.value;il.append(select);const pause=el('button',p.active?'Pausar':'Ativar');pause.onclick=()=>{p.active=!p.active;renderEditors();};const up=el('button','↑');up.setAttribute('aria-label',`Mover ${p.name} para cima`);up.onclick=()=>{if(i){[draft[i-1],draft[i]]=[draft[i],draft[i-1]];renderEditors();}};const remove=el('button','Remover');remove.onclick=()=>{if(confirm(`Remover ${p.name}? O histórico será preservado.`)){draft.splice(i,1);renderEditors();}};row.append(label,il,pause,up,remove);root.append(row);});}
function preview(){if(!data)return;const n=Number($('#purchase').elements.quantity.value),q=ordered();$('#preview').textContent=Number.isInteger(n)&&n>0&&n<=100&&q.length?`${n} cota(s) = ${n*250} g. Próxima pessoa: ${q[n%q.length].name}.`:'Informe entre 1 e 100 cotas.';}
$('#admin-toggle').onclick=()=>{$('#admin').hidden=!$('#admin').hidden;if(!$('#admin').hidden)$('#admin').scrollIntoView({behavior:'smooth'});};
$('#refresh').onclick=()=>action(load);
$('#login').onsubmit=e=>{e.preventDefault();action(async()=>{if(!configured)throw Error('Configure o Supabase em config.js primeiro.');const f=e.target;const result=await request('/auth/v1/token?grant_type=password',{email:f.elements.email.value,password:f.elements.password.value});token=result.access_token;f.elements.password.value='';await load();});};
$('#logout').onclick=()=>action(async()=>{try{await request('/auth/v1/logout',{});}finally{token=null;$('#controls').hidden=true;$('#member').hidden=true;$('#signup').hidden=false;$('#login').hidden=false;$('#logout').hidden=true;await load();}});
$('#purchase').elements.quantity.oninput=preview;
$('#purchase').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target,n=Number(f.elements.quantity.value),note=f.elements.note.value.trim();const signature=JSON.stringify([data.state.version,n,note]);if(!pending||pending.signature!==signature)pending={signature,id:crypto.randomUUID()};await request('/rest/v1/rpc/coffee_buy',{p_version:data.state.version,p_id:pending.id,p_quotas:n,p_note:note});pending=null;f.reset();await load();status('Compra registrada. Fila atualizada!');});};
$('#add').onclick=()=>{if(draft.length>=30)return status('Limite de 30 participantes.');draft.push({id:crypto.randomUUID(),name:'Nova pessoa',icon:icons[draft.length%icons.length],active:true});renderEditors();};
$('#save').onclick=()=>action(async()=>{await request('/rest/v1/rpc/coffee_manage',{p_version:data.state.version,p_participants:draft,p_queue:draft.filter(p=>p.active).map(p=>p.id)});await load();status('Participantes e ordem salvos.');});
// Mantém a ordem editável sincronizada com a fila corrente após cada leitura.
function syncDraft(){const queue=data.state.queue;draft.sort((a,b)=>{const ai=queue.indexOf(a.id),bi=queue.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});}
if(configured){action(load);}else{data={admin:false,state:{version:0,participants:icons.slice(0,7).map((icon,i)=>({id:String(i+1),name:`Pessoa ${i+1}`,icon,active:true})),queue:['1','2','3','4','5','6','7']},history:[]};draft=structuredClone(data.state.participants);render();status('Demonstração: configure config.js e execute supabase/schema.sql para conectar o banco. Nenhuma alteração é salva neste modo.');}
function renderAccount(){
 $('#signup').hidden=Boolean(token);$('#member').hidden=!token;
 if(!account)return;
 const profile=account.profile;
 $('#profile').elements.nickname.value=profile?.name||'';
 $('#profile').elements.icon.value=profile?.icon||'🦊';
 $('#member-status').textContent=profile?.participant_id?'Perfil aprovado! Você já pode enviar compras.':'Salve seu perfil e aguarde o administrador vincular sua conta a uma vaga.';
 $('#submit-buy').hidden=!profile?.participant_id;
 const labels={pending:'Aguardando aprovação',approved:'Aprovada',rejected:'Recusada'};
 const mine=$('#my-requests');mine.replaceChildren();
 (account.requests||[]).filter(r=>r.user_id===profile?.user_id).forEach(r=>mine.append(el('p',`${r.quotas} × 250 g · ${labels[r.status]} · ${new Date(r.created_at).toLocaleString('pt-BR')}`)));
 if(!mine.children.length)mine.append(el('p','Nenhuma solicitação enviada.'));
 const profiles=$('#pending-profiles');profiles.replaceChildren();
 (account.profiles||[]).filter(p=>!p.participant_id).forEach(p=>{
 const row=el('article',undefined,'person'),select=el('select');select.setAttribute('aria-label',`Vaga para ${p.name}`);
 data.state.participants.filter(p=>!account.profiles.some(a=>a.participant_id===p.id)).forEach(slot=>{const o=el('option',slot.name);o.value=slot.id;select.append(o);});
 const approve=el('button','Aprovar nesta vaga');approve.onclick=()=>action(async()=>{if(!select.value)throw Error('Não há vaga livre. Adicione uma vaga no editor.');await request('/rest/v1/rpc/coffee_member_approve',{p_user:p.user_id,p_slot:select.value,p_version:data.state.version});await load();status('Perfil aprovado.');});
 row.append(el('b',`${p.icon} ${p.name}`),select,approve);profiles.append(row);
 });
 if(!profiles.children.length)profiles.append(el('p','Nenhum perfil aguardando.'));
 const buys=$('#pending-buys');buys.replaceChildren();
 (account.requests||[]).filter(r=>r.status==='pending').forEach(r=>{const row=el('article',undefined,'person');row.append(el('b',`${r.icon} ${r.name} · ${r.quotas} × 250 g = ${r.quotas*250} g`),el('p',r.note||'Sem observação'));
 for(const [approve,label] of [[true,'Confirmar compra'],[false,'Recusar']]){const b=el('button',label);b.onclick=()=>action(async()=>{if(!confirm(`${label} de ${r.name}, ${r.quotas} cota(s)?`))return;await request('/rest/v1/rpc/coffee_review',{p_id:r.id,p_approve:approve,p_version:data.state.version});await load();status(approve?'Compra confirmada e fila atualizada.':'Solicitação recusada.');});row.append(b);}buys.append(row);});
 if(!buys.children.length)buys.append(el('p','Nenhuma compra aguardando.'));
}
$('#signup').onsubmit=e=>{e.preventDefault();action(async()=>{if(!configured)throw Error('Configure o Supabase primeiro.');const f=e.target;await request('/auth/v1/signup',{email:f.elements.email.value,password:f.elements.password.value});f.elements.password.value='';status('Cadastro enviado. Se a confirmação por e-mail estiver habilitada, confirme no e-mail recebido. Depois entre e preencha seu perfil.');});};
$('#profile').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target;await request('/rest/v1/rpc/coffee_profile_save',{p_name:f.elements.nickname.value.trim(),p_icon:f.elements.icon.value});await load();status('Perfil salvo!');});};
$('#submit-buy').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target,n=Number(f.elements.quantity.value),note=f.elements.note.value.trim(),signature=JSON.stringify([n,note]);if(!submission||submission.signature!==signature)submission={signature,id:crypto.randomUUID()};await request('/rest/v1/rpc/coffee_submit',{p_id:submission.id,p_quotas:n,p_note:note});submission=null;f.reset();await load();status('Compra enviada. Aguarde a confirmação do administrador.');});};
// A confirmação de e-mail é concluída pelo Supabase. O usuário entra por senha depois.
if(location.hash.includes('access_token='))history.replaceState(null,'',location.pathname+location.search);
