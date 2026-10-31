import {config} from './config.js';
const $=s=>document.querySelector(s);
const icons=['🦊','🐸','🦥','🦖','🐙','🦄','🐼','🐧','🦉','🐝'];
let token=null, data=null, draft=[], busy=false, pending=null, account=null, submission=null;
const configured=Boolean(config.supabaseUrl && config.supabaseKey);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const spriteNames=['raposa','carcara','sagui','tatu-peba','prea','moco','gato-do-mato','mao-pelada','coruja-buraqueira','bem-te-vi'];
const iconLabels=['Raposa', 'Carcará', 'Sagui-de-tufo-branco', 'Tatu-peba', 'Preá', 'Mocó', 'Gato-do-mato', 'Mão-pelada', 'Coruja-buraqueira', 'Bem-te-vi'];
function avatar(icon,photo=null){const index=icons.indexOf(icon),img=el('img',undefined,'avatar');img.src='./assets/'+(spriteNames[index]||'cup')+'.svg';if(photo&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)){img.src=photo;img.classList.add('profile-picture');}img.onerror=()=>{img.onerror=null;img.src='./assets/'+(spriteNames[index]||'cup')+'.svg';img.classList.remove('profile-picture');};img.alt=iconLabels[index]||'Café';img.width=42;img.height=42;return img;}
function personLabel(icon,name,photo=null){const label=el('b',undefined,'person-label');label.append(avatar(icon,photo),el('span',name));return label;}
let profilePhoto=null;
let authMode='login';
function status(text){$('#status').textContent=text;}
function authView(){
 $('#login').hidden=Boolean(token)||authMode!=='login';
 $('#signup').hidden=Boolean(token)||authMode!=='signup';
 $('.auth-tabs').hidden=Boolean(token);
 $('#logout').hidden=!token;syncCommentAccess();
 for(const mode of ['login','signup']){const tab=$('#'+mode+'-tab');tab.classList.toggle('selected',mode===authMode);tab.setAttribute('aria-pressed',String(mode===authMode));}
}
function showPage(member){
 $('#overview').hidden=member;$('#history-section').hidden=member;$('#admin').hidden=!member;
 $('#admin-toggle').setAttribute('aria-expanded',String(member));
 for(const [id,active] of [['overview-tab',!member],['admin-toggle',member]]){const tab=$('#'+id);tab.classList.toggle('nav-active',active);if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 if(member&&!token)$('#'+authMode+' input').focus();
}
$('#overview-tab').onclick=()=>showPage(false);
$('#login-tab').onclick=()=>{authMode='login';authView();};
$('#signup-tab').onclick=()=>{authMode='signup';authView();};
async function request(path,body){
 const headers={apikey:config.supabaseKey,'Content-Type':'application/json'};
 if(token)headers.Authorization=`Bearer ${token}`;
 const r=await fetch(config.supabaseUrl.replace(/\/$/,'')+path,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const result=await r.json().catch(()=>null);
 if(!r.ok){if(r.status===401){token=null;account=null;$('#controls').hidden=true;$('#member').hidden=true;authView();}throw Error(result?.message||result?.error_description||result?.msg||`Falha de conexão (${r.status}).`);}
 return result;
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function load(){if(!configured)return;const fresh=await request('/rest/v1/rpc/coffee_read',{});data=fresh;account=token?await request('/rest/v1/rpc/coffee_account',{}):null;draft=structuredClone(data.state.participants);status('');render();$('#updated').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');await loadComments();}
function ordered(){return data.state.queue.map(id=>data.state.participants.find(p=>p.id===id)).filter(Boolean);}
function render(){syncDraft();const queue=ordered(),h=data.history;$('#next').replaceChildren(...(queue[0]?[avatar(queue[0].icon,queue[0].photo),el('span',queue[0].name)]:[el('span','Garrafa em modo soneca')]));$('#people').textContent=queue.length;const total=h.reduce((s,x)=>s+x.quotas,0);$('#quotas').textContent=total;$('#weight').textContent=(total*250/1000).toLocaleString('pt-BR')+' kg';$('#queue').replaceChildren();queue.forEach((p,i)=>{const card=el('article',undefined,'person');card.append(avatar(p.icon,p.photo),el('b',p.name),el('small',i===0?'Sua missão, cafeteiro!':`${i+1}º na fila`));$('#queue').append(card);});if(!queue.length)$('#queue').append(el('p','Nenhum participante ativo.'));
 $('#history').replaceChildren();h.forEach(x=>{const row=el('article',undefined,'history-row'),left=el('div');left.append(personLabel(x.buyer_icon,x.buyer_name),el('small',new Date(x.created_at).toLocaleString('pt-BR')));if(x.note)left.append(el('small',x.note));row.append(left,el('strong',`${x.quotas} × 250 g = ${x.quotas*250} g`));$('#history').append(row);});if(!h.length)$('#history').append(el('p','Nenhum herói por aqui. Quem traz o primeiro pacote?'));
 $('#controls').hidden=!data.admin;$('#login').hidden=Boolean(token);$('#logout').hidden=!token;syncCommentAccess();renderAccount();renderEditors();preview();}
function renderEditors(){const root=$('#editors');root.replaceChildren();draft.forEach((p,i)=>{const row=el('div',undefined,'editor');const label=el('label','Nome'),input=el('input');input.value=p.name;input.maxLength=40;input.required=true;input.oninput=()=>p.name=input.value;label.append(input);const il=el('label','Ícone'),select=el('select');[...new Set([...icons,p.icon])].forEach(icon=>{const opt=el('option',iconLabels[icons.indexOf(icon)]||'Café');opt.value=icon;select.append(opt);});select.value=p.icon;select.onchange=()=>p.icon=select.value;il.append(select);const pause=el('button',p.active?'Pausar':'Ativar');pause.onclick=()=>{p.active=!p.active;renderEditors();};const up=el('button','↑');up.setAttribute('aria-label',`Mover ${p.name} para cima`);up.onclick=()=>{if(i){[draft[i-1],draft[i]]=[draft[i],draft[i-1]];renderEditors();}};const remove=el('button','Remover');remove.onclick=()=>{if(confirm(`Remover ${p.name}? O histórico será preservado.`)){draft.splice(i,1);renderEditors();}};row.append(label,il,pause,up,remove);root.append(row);});}
function preview(){if(!data)return;const n=Number($('#purchase').elements.quantity.value),q=ordered();$('#preview').textContent=Number.isInteger(n)&&n>0&&n<=100&&q.length?`${n} cota(s) = ${n*250} g. Próxima pessoa: ${q[n%q.length].name}.`:'Informe entre 1 e 100 cotas.';}
$('#admin-toggle').onclick=()=>showPage(true);
$('#refresh').onclick=()=>action(load);
$('#login').onsubmit=e=>{e.preventDefault();action(async()=>{if(!configured)throw Error('Configure o Supabase em config.js primeiro.');const f=e.target;const result=await request('/auth/v1/token?grant_type=password',{email:f.elements.email.value,password:f.elements.password.value});token=result.access_token;f.elements.password.value='';authView();await load();status('Bem-vindo ao balcão!');});};
$('#logout').onclick=()=>action(async()=>{try{await request('/auth/v1/logout',{});}finally{token=null;account=null;authMode='login';$('#controls').hidden=true;$('#member').hidden=true;$('#signup').hidden=false;$('#login').hidden=false;$('#logout').hidden=true;authView();await load();status('Até a próxima dose!');}});
$('#purchase').elements.quantity.oninput=preview;
$('#purchase').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target,n=Number(f.elements.quantity.value),note=f.elements.note.value.trim();const signature=JSON.stringify([data.state.version,n,note]);if(!pending||pending.signature!==signature)pending={signature,id:crypto.randomUUID()};await request('/rest/v1/rpc/coffee_buy',{p_version:data.state.version,p_id:pending.id,p_quotas:n,p_note:note});pending=null;f.reset();await load();status('Compra registrada. Fila atualizada!');});};
$('#add').onclick=()=>{if(draft.length>=30)return status('Limite de 30 participantes.');draft.push({id:crypto.randomUUID(),name:'Nova pessoa',icon:icons[draft.length%icons.length],active:true});renderEditors();};
$('#save').onclick=()=>action(async()=>{await request('/rest/v1/rpc/coffee_manage',{p_version:data.state.version,p_participants:draft,p_queue:draft.filter(p=>p.active).map(p=>p.id)});await load();status('Participantes e ordem salvos.');});
// Mantém a ordem editável sincronizada com a fila corrente após cada leitura.
function syncDraft(){const queue=data.state.queue;draft.sort((a,b)=>{const ai=queue.indexOf(a.id),bi=queue.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});}
if(configured){action(async()=>{try{await load();}catch(e){$('#next').textContent='Vamos preparar o café?';$('#queue').replaceChildren(el('p','Não foi possível carregar a fila. Tente atualizar em instantes.'));throw e;}});}else{data={admin:false,state:{version:0,participants:icons.slice(0,7).map((icon,i)=>({id:String(i+1),name:`Pessoa ${i+1}`,icon,active:true})),queue:['1','2','3','4','5','6','7']},history:[]};draft=structuredClone(data.state.participants);render();status('Demonstração: configure config.js e execute supabase/schema.sql para conectar o banco. Nenhuma alteração é salva neste modo.');}
function renderAccount(){
 authView();$('#member').hidden=!token;
 if(!account)return;
 const profile=account.profile;profilePhoto=profile?.photo||null;renderPhotoPreview();
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
 row.append(personLabel(p.icon,p.name,p.photo),select,approve);profiles.append(row);
 });
 if(!profiles.children.length)profiles.append(el('p','Nenhum perfil aguardando.'));
 const buys=$('#pending-buys');buys.replaceChildren();
 (account.requests||[]).filter(r=>r.status==='pending').forEach(r=>{const row=el('article',undefined,'person');row.append(personLabel(r.icon,`${r.name} · ${r.quotas} × 250 g = ${r.quotas*250} g`),el('p',r.note||'Sem observação'));
 for(const [approve,label] of [[true,'Confirmar compra'],[false,'Recusar']]){const b=el('button',label);b.onclick=()=>action(async()=>{if(!confirm(`${label} de ${r.name}, ${r.quotas} cota(s)?`))return;await request('/rest/v1/rpc/coffee_review',{p_id:r.id,p_approve:approve,p_version:data.state.version});await load();status(approve?'Compra confirmada e fila atualizada.':'Solicitação recusada.');});row.append(b);}buys.append(row);});
 if(!buys.children.length)buys.append(el('p','Nenhuma compra aguardando.'));
}
$('#signup').onsubmit=e=>{e.preventDefault();action(async()=>{if(!configured)throw Error('Configure o Supabase primeiro.');const f=e.target;await request('/auth/v1/signup',{email:f.elements.email.value,password:f.elements.password.value,data:{name:f.elements.name.value.trim()}});f.elements.password.value='';authMode='login';authView();status('Cadastro enviado. Se a confirmação por e-mail estiver habilitada, confirme no e-mail recebido. Depois entre e preencha seu perfil.');});};
$('#profile').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target;await request('/rest/v1/rpc/coffee_profile_update',{p_name:f.elements.nickname.value.trim(),p_icon:f.elements.icon.value,p_photo:profilePhoto});await load();status('Perfil salvo!');});};
$('#submit-buy').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target,n=Number(f.elements.quantity.value),note=f.elements.note.value.trim(),signature=JSON.stringify([n,note]);if(!submission||submission.signature!==signature)submission={signature,id:crypto.randomUUID()};await request('/rest/v1/rpc/coffee_submit',{p_id:submission.id,p_quotas:n,p_note:note});submission=null;f.reset();await load();status('Compra enviada. Aguarde a confirmação do administrador.');});};
// A confirmação de e-mail é concluída pelo Supabase. O usuário entra por senha depois.
if(location.hash.includes('access_token='))history.replaceState(null,'',location.pathname+location.search);

// Animation runs automatically, with the system motion preference respected.
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
function syncSceneMotion(){
 $('#lab-scene').src=motionPreference.matches?'./assets/science-lab.svg':'./assets/science-lab-animated.svg';
}
syncSceneMotion();
motionPreference.addEventListener('change',syncSceneMotion);

// Two clearly fictional sample pages. Edit these entries when real pearls arrive.
const pearlPages=[
 {quote:'“O código não tem bug. Ele só está testando a nossa fé.”',author:'— Bolsista anônimo',date:'31/10/2026 · entre um café e um commit'},
 {quote:'“Meu experimento é reproduzível. O erro acontece toda vez.”',author:'— Pesquisador sem cafeína',date:'31/10/2026 · depois da terceira tentativa'}
];
let pearlPage=0;
$('#paper-turn').onclick=()=>{
 pearlPage=1-pearlPage;
 const page=pearlPages[pearlPage];loadComments();
 $('#pearl-page blockquote').textContent=page.quote;
 $('.quote-credit strong').textContent=page.author;
 $('.quote-credit span').textContent=page.date;
 $('#paper-page-number').textContent=`Página ${pearlPage+1} de ${pearlPages.length}`;
 $('#paper-turn-label').textContent=pearlPage?'← Voltar à primeira':'Próxima página →';
 $('#paper-turn').setAttribute('aria-label',pearlPage?'Voltar à página 1 da Gazeta':'Ir para a página 2 da Gazeta');
};

function renderPhotoPreview(){const img=avatar($('#profile').elements.icon.value,profilePhoto);img.alt='Sua foto de perfil';$('#photo-preview').replaceChildren(img);}
$('#profile').elements.icon.addEventListener('change',renderPhotoPreview);
$('#remove-photo').onclick=()=>{profilePhoto=null;$('#profile-photo').value='';renderPhotoPreview();};
$('#profile-photo').onchange=()=>action(async()=>{
 const file=$('#profile-photo').files[0];if(!file)return;
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){$('#profile-photo').value='';throw Error('Escolha JPG, PNG ou WebP de até 5 MB.');}
 const bitmap=await createImageBitmap(file).catch(()=>{throw Error('Não foi possível abrir essa imagem.');});
 const canvas=document.createElement('canvas');canvas.width=canvas.height=320;const ctx=canvas.getContext('2d');
 const side=Math.min(bitmap.width,bitmap.height);ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,320,320);bitmap.close();
 const photo=canvas.toDataURL('image/jpeg',.8);if(photo.length>150000)throw Error('Escolha uma foto menor ou com menos detalhes.');
 profilePhoto=photo;renderPhotoPreview();status('Foto escolhida. Clique em Salvar meu perfil para aplicar.');
});
$('#submit-buy').elements.quantity.addEventListener('input',()=>{const n=Number($('#submit-buy').elements.quantity.value);$('#quota-total').textContent=Number.isInteger(n)&&n>=1&&n<=100?`${n} cota(s) = ${n*250} g`:'Informe entre 1 e 100 cotas.';});
function syncCommentAccess(){if(!$('#comment-form'))return;$('#comment-form').hidden=!token;$('#comments-login').hidden=Boolean(token);}
let commentsVersion=0,commentAttempt=null;
async function loadComments(){
 const version=++commentsVersion,page='gazeta-00'+(pearlPage+1);syncCommentAccess();$('#comments-list').replaceChildren();$('#comments-status').textContent='Carregando comentários…';
 if(!configured){$('#comments-status').textContent='Comentários disponíveis após conectar o banco.';return;}
 try{
 const comments=await request('/rest/v1/rpc/coffee_comments_read',{p_page:page});if(version!==commentsVersion)return;
 $('#comments-status').textContent='';
 for(const c of comments||[]){const row=el('article',undefined,'gazette-comment');row.append(personLabel(c.icon,c.name,c.photo),el('small',new Date(c.created_at).toLocaleString('pt-BR')),el('p',c.body));
 if(c.can_delete){const remove=el('button','Excluir');remove.type='button';remove.onclick=()=>action(async()=>{if(!confirm('Excluir este comentário?'))return;await request('/rest/v1/rpc/coffee_comment_delete',{p_id:c.id});await loadComments();});row.append(remove);}
 $('#comments-list').append(row);}
 if(!comments?.length)$('#comments-list').append(el('p','Nenhum comentário. Quem dá o primeiro pitaco?'));
 }catch(e){if(version===commentsVersion)$('#comments-status').textContent='Não foi possível carregar os comentários. Tente atualizar.';}
}
$('#comments-refresh').onclick=()=>loadComments();
$('#comment-form').onsubmit=e=>{e.preventDefault();action(async()=>{const form=e.target,body=form.elements.body.value.trim(),page='gazeta-00'+(pearlPage+1);if(!body)throw Error('Escreva um comentário.');
 const signature=JSON.stringify([page,body]);if(!commentAttempt||commentAttempt.signature!==signature)commentAttempt={signature,id:crypto.randomUUID()};
 await request('/rest/v1/rpc/coffee_comment_add',{p_id:commentAttempt.id,p_page:page,p_body:body});commentAttempt=null;form.reset();await loadComments();status('Comentário publicado!');});};
if(!configured)loadComments();
