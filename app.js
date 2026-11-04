import {config} from './config.js?v=20261112';
import {formatArticle,applyArticleStyle} from './formatting.js';
const $=s=>document.querySelector(s);
const isGazette=document.body.dataset.page==='gazeta';let returnToComments=false;
const icons=['🦊','🐸','🦥','🦖','🐙','🦄','🐼','🐧','🦉','🐝'];
let authSession=readSession(),refreshPromise=null;
let token=authSession?.token||null, data=null, draft=[], busy=false, pending=null, account=null, submission=null;
const configured=Boolean(config.supabaseUrl && config.supabaseKey);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const spriteNames=['raposa','carcara','sagui','tatu-peba','prea','moco','gato-do-mato','mao-pelada','coruja-buraqueira','bem-te-vi'];
const iconLabels=['Raposa', 'Carcará', 'Sagui-de-tufo-branco', 'Tatu-peba', 'Preá', 'Mocó', 'Gato-do-mato', 'Mão-pelada', 'Coruja-buraqueira', 'Bem-te-vi'];
function avatar(icon,photo=null){const index=icons.indexOf(icon),img=el('img',undefined,'avatar');img.src='./assets/'+(spriteNames[index]||'cup')+'.svg';if(photo&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)){img.src=photo;img.classList.add('profile-picture');}img.onerror=()=>{img.onerror=null;img.src='./assets/'+(spriteNames[index]||'cup')+'.svg';img.classList.remove('profile-picture');};img.alt=iconLabels[index]||'Café';img.width=42;img.height=42;return img;}
function personLabel(icon,name,photo=null,roles=null){const label=el('b',undefined,'person-label');label.append(avatar(icon,photo),el('span',name));if(roles)appendRoleBadges(label,roles);return label;}
let profilePhoto=null;
let authMode='login';
function readSession(){try{const raw=localStorage.getItem('coffee-session-v2')||sessionStorage.getItem('coffee-session');const session=JSON.parse(raw);if(session?.token&&(session.refreshToken||session.expiresAt>Date.now()))return session;}catch{}return null;}
function clearSession(){authSession=null;try{localStorage.removeItem('coffee-session-v2');sessionStorage.removeItem('coffee-session');}catch{}}
function rememberSession(result){authSession={token:result.access_token,refreshToken:result.refresh_token||authSession?.refreshToken,expiresAt:result.expires_at?Number(result.expires_at)*1000:Date.now()+(Number(result.expires_in)||3600)*1000};token=authSession.token;try{localStorage.setItem('coffee-session-v2',JSON.stringify(authSession));sessionStorage.removeItem('coffee-session');}catch{status('Seu navegador bloqueou o armazenamento do login.');}}
function expireSession(){if(editingPost)cancelPostEditing(true);clearSession();token=null;account=null;$('#controls').hidden=true;$('#member').hidden=true;authView();}
async function renewSession(){
 if(refreshPromise)return refreshPromise;
 if(!authSession?.refreshToken)return false;
 refreshPromise=(async()=>{try{const result=await rawRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:authSession.refreshToken},null);rememberSession(result);return true;}catch(e){if(e.status===400||e.status===401){expireSession();return false;}throw e;}finally{refreshPromise=null;}})();
 return refreshPromise;
}
function status(text){$('#status').textContent=text;}
function authView(){
 $('#login').hidden=Boolean(token)||authMode!=='login';
 $('#signup').hidden=Boolean(token)||authMode!=='signup';
 $('.auth-tabs').hidden=Boolean(token);
 $('#logout').hidden=!token;syncCommentAccess();if(!token){$('#gazette-editor').hidden=true;$('#my-publications').hidden=true;$('#my-author-badge').hidden=true;}
 for(const mode of ['login','signup']){const tab=$('#'+mode+'-tab');tab.classList.toggle('selected',mode===authMode);tab.setAttribute('aria-pressed',String(mode===authMode));}
}
function showPage(member){
 $('#overview').hidden=member||isGazette;$('#history-section').hidden=member||isGazette;$('#gazette-page').hidden=member||!isGazette;$('#admin').hidden=!member;
 $('#admin-toggle').setAttribute('aria-expanded',String(member));
 for(const [id,active] of [['overview-tab',!member&&!isGazette],['gazeta-tab',!member&&isGazette],['admin-toggle',member]]){const tab=$('#'+id);tab.classList.toggle('nav-active',active);if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');}
 if(member&&!token)$('#'+authMode+' input').focus();
}

$('#login-tab').onclick=()=>{authMode='login';authView();};
$('#signup-tab').onclick=()=>{authMode='signup';authView();};
async function rawRequest(path,body,bearer){
 const headers={apikey:config.supabaseKey,'Content-Type':'application/json'};if(bearer)headers.Authorization=`Bearer ${bearer}`;
 const r=await fetch(config.supabaseUrl.replace(/\/$/,'')+path,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const result=await r.json().catch(()=>null);
 if(!r.ok){const error=Error(result?.message||result?.error_description||result?.msg||`Falha de conexão (${r.status}).`);error.status=r.status;throw error;}
 return result;
}
async function request(path,body){
 const authOperation=path.startsWith('/auth/v1/')&&!path.includes('/logout');
 if(!authOperation&&authSession?.expiresAt<Date.now()+60000){const renewed=await renewSession();if(!renewed&&authSession?.expiresAt<Date.now())expireSession();}
 try{return await rawRequest(path,body,authOperation?null:token);}catch(e){
 if(e.status===401&&!authOperation&&token){if(await renewSession())return rawRequest(path,body,token);expireSession();}
 throw e;
 }
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function load(){if(!configured)return;const fresh=await request('/rest/v1/rpc/coffee_read',{});data=fresh;account=token?await request('/rest/v1/rpc/coffee_account',{}):null;draft=structuredClone(data.state.participants);status('');render();$('#updated').textContent='Atualizado às '+new Date().toLocaleTimeString('pt-BR');await loadPosts();await loadComments();}
function ordered(){return data.state.queue.map(id=>data.state.participants.find(p=>p.id===id)).filter(Boolean);}
function render(){syncDraft();const queue=ordered(),h=data.history;$('#next').replaceChildren(...(queue[0]?[avatar(queue[0].icon,queue[0].photo),el('span',queue[0].name)]:[el('span','Garrafa em modo soneca')]));$('#people').textContent=queue.length;const total=h.reduce((s,x)=>s+x.quotas,0);$('#quotas').textContent=total;$('#weight').textContent=(total*250/1000).toLocaleString('pt-BR')+' kg';$('#queue').replaceChildren();queue.forEach((p,i)=>{const card=el('article',undefined,'person');card.append(avatar(p.icon,p.photo),el('b',p.name),el('small',i===0?'Sua missão, cafeteiro!':`${i+1}º na fila`));appendRoleBadges(card,p);$('#queue').append(card);});if(!queue.length)$('#queue').append(el('p','Nenhum participante ativo.'));
 $('#history').replaceChildren();h.forEach(x=>{const row=el('article',undefined,'history-row'),left=el('div');left.append(personLabel(x.buyer_icon,x.buyer_name),el('small',new Date(x.created_at).toLocaleString('pt-BR')));if(x.note)left.append(el('small',x.note));row.append(left,el('strong',`${x.quotas} × 250 g = ${x.quotas*250} g`));$('#history').append(row);});if(!h.length)$('#history').append(el('p','Nenhum herói por aqui. Quem traz o primeiro pacote?'));
 $('#controls').hidden=!data.admin;$('#login').hidden=Boolean(token);$('#logout').hidden=!token;syncCommentAccess();if(!token){$('#gazette-editor').hidden=true;$('#my-publications').hidden=true;$('#my-author-badge').hidden=true;}renderAccount();renderEditors();preview();}
function renderEditors(){const root=$('#editors');root.replaceChildren();draft.forEach((p,i)=>{const row=el('div',undefined,'editor');const label=el('label','Nome'),input=el('input');input.value=p.name;input.maxLength=40;input.required=true;input.oninput=()=>p.name=input.value;label.append(input);const il=el('label','Ícone'),select=el('select');[...new Set([...icons,p.icon])].forEach(icon=>{const opt=el('option',iconLabels[icons.indexOf(icon)]||'Café');opt.value=icon;select.append(opt);});select.value=p.icon;select.onchange=()=>p.icon=select.value;il.append(select);const pause=el('button',p.active?'Pausar':'Ativar');pause.onclick=()=>{p.active=!p.active;renderEditors();};const up=el('button','↑');up.setAttribute('aria-label',`Mover ${p.name} para cima`);up.onclick=()=>{if(i){[draft[i-1],draft[i]]=[draft[i],draft[i-1]];renderEditors();}};const remove=el('button','Remover');remove.onclick=()=>{if(confirm(`Remover ${p.name}? O histórico será preservado.`)){draft.splice(i,1);renderEditors();}};row.append(label,il,pause,up,remove);root.append(row);});}
function preview(){
 if(!data)return;
 const quantity=Number($('#purchase').elements.quantity.value),queue=ordered();
 const output=$('#preview');
 if(!queue.length){output.textContent='Adicione um participante ativo à fila.';return;}
 if(!Number.isInteger(quantity)||quantity<1||quantity>100){output.textContent='Informe entre 1 e 100 cotas.';return;}
 const rounds=data.state.queue_rounds;
 if(!rounds){
  output.textContent=`${quantity} cota(s) = ${quantity*250} g. Próxima pessoa: ${queue[quantity%queue.length].name}.`;
  return;
 }
 const [buyer,next]=queue;
 const buyerRound=(rounds[buyer.id]??0)+quantity;
 const upcoming=next&&(rounds[next.id]??0)<=buyerRound?next:buyer;
 output.textContent=`${quantity} cota(s) = ${quantity*250} g. Próxima pessoa: ${upcoming.name}.`;
}
$('#admin-toggle').onclick=()=>showPage(true);
$('#refresh').onclick=()=>action(load);
$('#login').onsubmit=e=>{e.preventDefault();action(async()=>{if(!configured)throw Error('Configure o Supabase em config.js primeiro.');const f=e.target;const result=await request('/auth/v1/token?grant_type=password',{email:f.elements.email.value,password:f.elements.password.value});token=result.access_token;rememberSession(result);f.elements.password.value='';authView();await load();status('Bem-vindo ao balcão!');if(returnToComments){returnToComments=false;showPage(false);$('#comment-form textarea').focus();}});};
$('#logout').onclick=()=>action(async()=>{cancelReply();if(editingPost)cancelPostEditing(true);try{await request('/auth/v1/logout',{});}finally{clearSession();token=null;account=null;authMode='login';$('#controls').hidden=true;$('#member').hidden=true;$('#signup').hidden=false;$('#login').hidden=false;$('#logout').hidden=true;authView();await load();status('Até a próxima dose!');}});
$('#purchase').elements.quantity.oninput=preview;
$('#purchase').onsubmit=e=>{e.preventDefault();action(async()=>{const f=e.target,n=Number(f.elements.quantity.value),note=f.elements.note.value.trim();const signature=JSON.stringify([data.state.version,n,note]);if(!pending||pending.signature!==signature)pending={signature,id:crypto.randomUUID()};await request('/rest/v1/rpc/coffee_buy',{p_version:data.state.version,p_id:pending.id,p_quotas:n,p_note:note});pending=null;f.reset();await load();status('Compra registrada. Fila atualizada!');});};
$('#add').onclick=()=>{if(draft.length>=30)return status('Limite de 30 participantes.');draft.push({id:crypto.randomUUID(),name:'Nova pessoa',icon:icons[draft.length%icons.length],active:true});renderEditors();};
$('#save').onclick=()=>action(async()=>{await request('/rest/v1/rpc/coffee_manage',{p_version:data.state.version,p_participants:draft,p_queue:draft.filter(p=>p.active).map(p=>p.id)});await load();status('Participantes e ordem salvos.');});
// Mantém a ordem editável sincronizada com a fila corrente após cada leitura.
function syncDraft(){const queue=data.state.queue;draft.sort((a,b)=>{const ai=queue.indexOf(a.id),bi=queue.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});}
function renderAccount(){
 authView();$('#member').hidden=!token;
 $('#gazette-editor').hidden=!canWrite();$('#my-publications').hidden=!canWrite();
 if(!account)return;
 const profile=account.profile;$('#my-author-badge').hidden=!(profile?.is_author||data?.admin);$('#my-author-badge').replaceChildren();appendRoleBadges($('#my-author-badge'),{is_author:profile?.is_author,is_admin:data?.admin});renderAuthorProfiles();renderCommentApprovals();renderUserProfiles();renderCupRankingProfiles();previewPost();profilePhoto=profile?.photo||null;renderPhotoPreview();
 $('#profile').elements.nickname.value=profile?.name||'';
 $('#profile').elements.icon.value=profile?.icon||'🦊';
 $('#member-status').textContent=(profile?.participant_id?'Rodízio: você já pode enviar compras. ':'Rodízio: aguardando vínculo a uma vaga. ')+(mayComment()?'Gazeta: comentários autorizados.':'Gazeta: aguardando autorização para comentar.');
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
$('#signup').onsubmit=e=>{e.preventDefault();action(async()=>{if(!configured)throw Error('Configure o Supabase primeiro.');const f=e.target;await request('/auth/v1/signup',{email:f.elements.email.value,password:f.elements.password.value,data:{name:f.elements.name.value.trim()}});f.elements.password.value='';authMode='login';authView();status('Cadastro enviado. Se a confirmação por e-mail estiver habilitada, confirme no e-mail recebido. Depois entre e aguarde a aprovação do administrador.');});};
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

// Stable publication IDs keep comments attached when pages are reordered.
let pearlPages=[
 {id:'gazeta-001',title:'Direto da bancada',quote:'O código não tem bug. Ele só está testando a nossa fé.',author:'Bolsista anônimo',published_on:'2026-10-31',caption:'Flagrante: mais uma tentativa de resolver tudo com café.'},
 {id:'gazeta-002',title:'Mais uma tentativa',quote:'Meu experimento é reproduzível. O erro acontece toda vez.',author:'Pesquisador sem cafeína',published_on:'2026-10-31',caption:'Entre um café e um experimento.'}
];
let pearlPage=0,postsLoaded=false;
function currentPostId(){return pearlPages[pearlPage]?.id;}
function renderPost(){
 const page=pearlPages[pearlPage];renderPostAdminActions(page);if(!page){$('#post-publisher').replaceChildren();if(isGazette){const url=new URL(location.href);url.searchParams.delete('post');history.replaceState(null,'',url);document.title='A GAZETA DO LSN • Matérias e pérolas';}return;}
 const publisher=$('#post-publisher');publisher.replaceChildren();if(page.publisher_name)publisher.append(el('span','Publicado por '+page.publisher_name));appendRoleBadges(publisher,{is_author:page.publisher_is_author,is_admin:page.publisher_is_admin});
 if(isGazette){const url=new URL(location.href);url.searchParams.set('post',page.id);history.replaceState(null,'',url);document.title=page.title+' • A GAZETA DO LSN';}
 $('#post-title').textContent=page.title;$('#post-title').hidden=false;
 $('#pearl-page blockquote').textContent='“'+page.quote+'”';
 $('.quote-credit strong').textContent='— '+page.author;
 const date=new Date(page.published_on+'T12:00:00').toLocaleDateString('pt-BR');
 $('.quote-credit span').textContent=date;
 $('.paper-dateline time').textContent=date;$('.paper-dateline time').dateTime=page.published_on;
 formatArticle($('#post-body'),page.body||'');applyArticleStyle($('#post-body'),page.body_align,page.body_font_size);$('#post-body').hidden=!page.body;
 const img=$('.paper-photo img');img.src=validPostImage(page.image)?page.image:'./assets/science-lab.svg';img.classList.toggle('publication-photo',validPostImage(page.image));img.alt=page.caption||page.title;
 $('.paper-photo figcaption').textContent=page.caption||'';
 const visible=filteredPosts(),position=visible.findIndex(p=>p.id===page.id);$('#paper-page-number').textContent=`Página ${position+1} de ${visible.length}`;
 $('#paper-turn-label').textContent=position===visible.length-1?'← Voltar à primeira':'Próxima página →';
 $('#paper-turn').setAttribute('aria-label',position===visible.length-1?'Voltar à página 1 da Gazeta':`Ir para a página ${position+2} da Gazeta`);
}
async function loadPosts(){
 if(!configured)return;
 const selected=postsLoaded?currentPostId():new URLSearchParams(location.search).get('post');
 try{const posts=await request('/rest/v1/rpc/coffee_posts_read',{});if(!Array.isArray(posts))throw Error('Resposta inválida da Gazeta.');
 postsLoaded=true;pearlPages=posts;pearlPage=Math.max(0,posts.findIndex(p=>p.id===selected));$('.gazette-reading').hidden=!posts.length;$('#posts-status').textContent=posts.length?'':'Nenhuma matéria publicada ainda.';renderPost();renderArchive();renderMyPosts();return true;}
 catch(e){$('#posts-status').textContent='Não foi possível atualizar as publicações: '+e.message;return false;}
}
$('#paper-turn').onclick=()=>{const visible=filteredPosts(),index=visible.findIndex(p=>p.id===currentPostId());selectPost(visible[(index+1)%visible.length]?.id);};

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
function mayComment(){return Boolean(token&&(data?.admin||account?.can_comment===true));}
function syncCommentAccess(){if(!$('#comment-form'))return;$('#comment-form').hidden=!mayComment();$('#comments-login').hidden=Boolean(token);$('#comments-approval').hidden=!token||mayComment();}
let commentsVersion=0,commentAttempt=null,replyTarget=null,visibleComments=[],visibleCommentsPage=null;const confirmedComments=new Map();
function cancelReply(){replyTarget=null;commentAttempt=null;$('#reply-context').hidden=true;$('#comment-form button[type=submit]').textContent='Publicar comentário';$('#comment-form textarea').placeholder='Essa merece entrar para a história…';}
function beginReply(comment){
 replyTarget={id:comment.id,name:comment.name,page:currentPostId()};commentAttempt=null;$('#reply-context').hidden=false;$('#reply-to-name').textContent='Respondendo a '+comment.name;$('#comment-form button[type=submit]').textContent='Publicar resposta';$('#comment-form textarea').placeholder='Sua resposta para '+comment.name+'…';$('#comment-form').scrollIntoView({behavior:'smooth',block:'center'});$('#comment-form textarea').focus();
}
$('#cancel-reply').onclick=cancelReply;
function renderComments(comments){
 visibleComments=comments;visibleCommentsPage=currentPostId();$('#comments-list').replaceChildren();
 const byId=new Map(comments.map(c=>[c.id,c])),children=new Map();
 for(const c of comments){const parent=c.parent_id&&byId.has(c.parent_id)?c.parent_id:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(c);}
 const pending=(children.get(null)||[]).map(c=>({c,depth:0})).reverse(),seen=new Set();
 while(pending.length){const {c,depth}=pending.pop();if(seen.has(c.id))continue;seen.add(c.id);
 const row=el('article',undefined,'gazette-comment'+(depth?' comment-reply':''));row.dataset.commentId=c.id;row.style.setProperty('--reply-depth',Math.min(depth,3));
 if(c.parent_id&&byId.has(c.parent_id))row.append(el('small','Em resposta a '+byId.get(c.parent_id).name,'reply-recipient'));
 row.append(personLabel(c.icon,c.name,c.photo,c),el('small',new Date(c.created_at).toLocaleString('pt-BR')),el('p',c.body));if(c.deleted)row.classList.add('comment-deleted');
 const actions=el('div',undefined,'comment-actions');
 if(mayComment()&&!c.deleted){const reply=el('button','Responder');reply.type='button';reply.onclick=()=>beginReply(c);actions.append(reply);}
 if(c.can_delete&&token&&!c.deleted){const remove=el('button','Excluir');remove.type='button';remove.onclick=()=>action(async()=>{if(!confirm('Excluir este comentário? As respostas serão preservadas.'))return;try{await request('/rest/v1/rpc/coffee_comment_delete',{p_id:c.id});confirmedComments.get(currentPostId())?.delete(c.id);if(replyTarget?.id===c.id)cancelReply();await loadComments();}catch(e){$('#comments-status').textContent=e.message;}});actions.append(remove);}
 row.append(actions);$('#comments-list').append(row);
 const replies=children.get(c.id)||[];for(let i=replies.length-1;i>=0;i--)pending.push({c:replies[i],depth:depth+1});
 }
 if(!comments.length)$('#comments-list').append(el('p','Nenhum comentário. Quem dá o primeiro pitaco?'));
}
async function loadComments(){
 const version=++commentsVersion,page=currentPostId();if(visibleCommentsPage!==page)renderComments([]);syncCommentAccess();$('#comments-status').textContent='Carregando comentários…';
 if(!configured){$('#comments-status').textContent='Comentários disponíveis após conectar o banco.';return false;}if(!page){renderComments([]);$('#comments-status').textContent='';return false;}
 try{
 const comments=await request('/rest/v1/rpc/coffee_comments_read',{p_page:page});if(version!==commentsVersion)return false;
 if(!Array.isArray(comments))throw Error('Resposta inválida ao buscar os comentários.');
 const saved=confirmedComments.get(page)||new Map();const byId=new Map(comments.map(c=>[c.id,c]));
 for(const [id,c] of saved){if(!byId.has(id))byId.set(id,c);else saved.delete(id);}
 renderComments([...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)));$('#comments-status').textContent='';return true;
 }catch(e){if(version===commentsVersion){const saved=confirmedComments.get(page);if(saved?.size){const merged=new Map((visibleCommentsPage===page?visibleComments:[]).map(c=>[c.id,c]));for(const [id,c] of saved)merged.set(id,c);renderComments([...merged.values()]);}$('#comments-status').textContent='Não foi possível atualizar a conversa: '+e.message;}return false;}
}
$('#comments-refresh').onclick=()=>action(async()=>{if(token){account=await request('/rest/v1/rpc/coffee_account',{});syncCommentAccess();}await loadComments();});
$('#comment-form').onsubmit=e=>{e.preventDefault();action(async()=>{const form=e.target,body=form.elements.body.value.trim(),page=currentPostId();if(!mayComment()){$('#comments-status').textContent='Aguarde a aprovação do administrador para comentar.';return;}if(!body)throw Error('Escreva um comentário.');
 const parent=replyTarget?.page===page?replyTarget.id:null;const signature=JSON.stringify([page,parent,body]);if(!commentAttempt||commentAttempt.signature!==signature)commentAttempt={signature,id:crypto.randomUUID()};
 try{const saved=await request(parent?'/rest/v1/rpc/coffee_comment_reply':'/rest/v1/rpc/coffee_comment_publish',{p_id:commentAttempt.id,p_page:page,p_body:body,...(parent?{p_parent:parent}:{})});if(!saved?.id||typeof saved.body!=='string')throw Error('O banco não confirmou o comentário. Atualize a página e tente novamente.');if(!confirmedComments.has(page))confirmedComments.set(page,new Map());confirmedComments.get(page).set(saved.id,saved);commentAttempt=null;form.reset();cancelReply();if(page===currentPostId()){renderComments([...visibleComments.filter(c=>c.id!==saved.id),saved]);const loaded=await loadComments();if(loaded)$('#comments-status').textContent='Comentário publicado!';}}catch(e){$('#comments-status').textContent='Não foi possível publicar: '+e.message;syncCommentAccess();}});};
if(!configured)loadComments();

$('#comment-signin').onclick=()=>{returnToComments=true;showPage(true);$('#admin').scrollIntoView({behavior:'smooth'});};
function validPostImage(src){return typeof src==='string'&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(src);}
let postImage=null,postAttempt=null,editingPost=null,editorBaseline=null;
const postForm=$('#post-form');
// Local calendar date, not UTC, for the publication date input.
const localNow=new Date();postForm.elements.date.value=[localNow.getFullYear(),String(localNow.getMonth()+1).padStart(2,'0'),String(localNow.getDate()).padStart(2,'0')].join('-');
editorBaseline=JSON.stringify(postPayload());
function previewPost(){
 $('#post-preview .preview-publisher').textContent=account?.profile?.name?'Publicado por '+account.profile.name:'';
 $('#post-preview h3').textContent=postForm.elements.title.value||'Título da publicação';
 $('#post-preview blockquote').textContent=postForm.elements.quote.value?'“'+postForm.elements.quote.value+'”':'Sua frase do dia aparece aqui.';
 $('#post-preview .preview-author').textContent='— '+(postForm.elements.author.value||'Autor');
 $('#post-preview time').textContent=postForm.elements.date.value?new Date(postForm.elements.date.value+'T12:00:00').toLocaleDateString('pt-BR'):'';
 formatArticle($('#post-preview .preview-body'),postForm.elements.body.value);applyArticleStyle($('#post-preview .preview-body'),postForm.elements.alignment.value,Number(postForm.elements.fontSize.value));
 const img=$('#post-preview img');img.hidden=!postImage;if(postImage)img.src=postImage;else img.removeAttribute('src');
 $('#post-preview figcaption').textContent=postForm.elements.caption.value;
}
postForm.addEventListener('input',previewPost);
$('#post-remove-image').onclick=()=>{postImage=null;$('#post-image').value='';previewPost();};
$('#post-image').onchange=()=>action(async()=>{
 const file=$('#post-image').files[0];if(!file)return;
 try{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Escolha JPG, PNG ou WebP de até 5 MB.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 const result=canvas.toDataURL('image/jpeg',.8);if(result.length>1200000)throw Error('Imagem muito detalhada. Escolha uma menor.');postImage=result;previewPost();$('#post-status').textContent='Imagem pronta para a publicação.';
 }catch(e){$('#post-image').value='';$('#post-status').textContent=e.message;}
});
function postPayload(){return {p_title:postForm.elements.title.value.trim(),p_quote:postForm.elements.quote.value.trim(),p_author:postForm.elements.author.value.trim(),p_date:postForm.elements.date.value,p_body:postForm.elements.body.value.trim(),p_image:postImage,p_caption:postForm.elements.caption.value.trim(),p_align:postForm.elements.alignment.value,p_font_size:Number(postForm.elements.fontSize.value)};}
function syncPostEditMode(){
 $('#gazette-editor > h2').textContent=editingPost?'Editar matéria':'Publicar na Gazeta';
 $('#gazette-editor > .hint').textContent=editingPost?'Faça os ajustes e confira a prévia antes de salvar.':'Prepare a página e confira a prévia antes de publicar.';
 $('#post-form button[type=submit]').textContent=editingPost?'Salvar alterações':'Publicar na Gazeta';
 $('#post-cancel-edit').hidden=!editingPost;$('#post-edit-notice').hidden=!editingPost;
 $('#post-edit-notice').textContent=editingPost?'Você está editando uma matéria já publicada. O link e os comentários serão preservados.':'';
}
function cancelPostEditing(force=false){
 if(!force&&JSON.stringify(postPayload())!==editorBaseline&&!confirm('Descartar as alterações que ainda não foram salvas?'))return;
 editingPost=null;postAttempt=null;postImage=null;postForm.reset();const now=new Date();postForm.elements.date.value=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 editorBaseline=JSON.stringify(postPayload());syncPostEditMode();previewPost();$('#post-status').textContent='';
}
function startPostEditing(post){return action(async()=>{
 if(!token||!canWrite()||!post.is_mine||!post.can_edit)return status('Somente quem publicou pode editar esta matéria.');
 if(JSON.stringify(postPayload())!==editorBaseline&&!confirm('Você tem alterações não salvas no editor. Deseja descartá-las e abrir esta matéria?'))return;
 if(!await loadPosts())throw Error('Não foi possível carregar a versão atual da matéria. Tente novamente.');
 post=pearlPages.find(item=>item.id===post.id);if(!post?.is_mine||!post?.can_edit)throw Error('Esta matéria não está disponível para edição.');
 editingPost={id:post.id,version:Number(post.edit_version)||0};postAttempt=null;postImage=validPostImage(post.image)?post.image:null;$('#post-image').value='';
 for(const [field,value] of Object.entries({title:post.title,quote:post.quote,author:post.author,date:post.published_on,body:post.body||'',caption:post.caption||'',alignment:post.body_align||'left',fontSize:post.body_font_size||18}))postForm.elements[field].value=value;
 editorBaseline=JSON.stringify(postPayload());syncPostEditMode();previewPost();$('#post-status').textContent='Matéria carregada para edição.';showPage(true);$('#gazette-editor').scrollIntoView({behavior:'smooth',block:'start'});postForm.elements.title.focus({preventScroll:true});
});}
$('#post-cancel-edit').onclick=()=>cancelPostEditing();
postForm.onsubmit=e=>{e.preventDefault();action(async()=>{
 if(!canWrite())throw Error('Você precisa da insígnia de autor para publicar.');
 const payload=postPayload();
 if(!payload.p_title||!payload.p_quote||!payload.p_author)throw Error('Preencha o título, a frase do dia e o autor.');
 try{
 if(editingPost){
 const version=await request('/rest/v1/rpc/coffee_post_update',{p_id:editingPost.id,p_version:editingPost.version,...payload});
 editingPost.version=Number(version);await loadPosts();pearlPage=Math.max(0,pearlPages.findIndex(p=>p.id===editingPost.id));$('#archive-month').value='';$('#archive-week').value='';renderPost();renderArchive();await loadComments();editorBaseline=JSON.stringify(payload);$('#post-status').textContent='Alterações salvas! A matéria já foi atualizada na Gazeta.';
 }else{
 const signature=JSON.stringify(payload);if(!postAttempt||postAttempt.signature!==signature)postAttempt={signature,id:crypto.randomUUID()};
 await request('/rest/v1/rpc/coffee_post_publish_formatted',{p_id:postAttempt.id,...payload});await loadPosts();$('#archive-month').value='';$('#archive-week').value='';$('.gazette-reading').hidden=false;pearlPage=Math.max(0,pearlPages.findIndex(p=>p.id===postAttempt.id));renderPost();renderArchive();await loadComments();postAttempt=null;editorBaseline=JSON.stringify(payload);$('#post-status').textContent='Publicado! A nova página já está na Gazeta.';
 }
 }catch(e){$('#post-status').textContent=(editingPost?'Não foi possível salvar: ':'Não foi possível publicar: ')+e.message;}
});};
previewPost();

function weekStart(dateString){const date=new Date(dateString+'T12:00:00Z');date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);return date.toISOString().slice(0,10);}
function prettyDate(date){return new Date(date+'T12:00:00').toLocaleDateString('pt-BR');}
function filteredPosts(){const month=$('#archive-month').value,week=$('#archive-week').value;return pearlPages.filter(p=>(!month||p.published_on.startsWith(month))&&(!week||weekStart(p.published_on)===week));}
function selectPost(id){if(!id)return;pearlPage=pearlPages.findIndex(p=>p.id===id);if(pearlPage<0)pearlPage=0;$('#comment-form').reset();cancelReply();renderPost();renderArchive();loadComments();}
function renderArchive(){
 const weeks=$('#archive-week'),selected=weeks.value;weeks.replaceChildren(el('option','Todas as semanas'));weeks.firstChild.value='';
 const month=$('#archive-month').value;
 for(const week of [...new Set(pearlPages.filter(p=>!month||p.published_on.startsWith(month)).map(p=>weekStart(p.published_on)))].sort().reverse()){const option=el('option','Semana de '+prettyDate(week));option.value=week;weeks.append(option);}
 weeks.value=[...weeks.options].some(o=>o.value===selected)?selected:'';
 const root=$('#archive-list');root.replaceChildren();let lastMonth='',lastWeek='';
 for(const post of filteredPosts()){
 const monthKey=post.published_on.slice(0,7),week=weekStart(post.published_on);
 if(monthKey!==lastMonth){root.append(el('h3',new Date(post.published_on+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})));lastMonth=monthKey;}
 if(week!==lastWeek){root.append(el('small','Semana de '+prettyDate(week)));lastWeek=week;}
 const button=el('button',undefined,'archive-post');button.type='button';button.append(el('span',post.title),el('small',prettyDate(post.published_on)));if(post.id===currentPostId())button.setAttribute('aria-current','page');button.onclick=()=>selectPost(post.id);root.append(button);
 }
 if(!root.children.length)root.append(el('p','Nenhuma matéria nesse período.'));
}
function filterArchive(){renderArchive();const visible=filteredPosts();if(visible.length){if(!visible.some(p=>p.id===currentPostId()))selectPost(visible[0].id);else renderPost();}$('.gazette-reading').hidden=!visible.length;}
$('#archive-month').onchange=()=>{$('#archive-week').value='';filterArchive();};$('#archive-week').onchange=filterArchive;
$('#archive-clear').onclick=()=>{$('#archive-month').value='';$('#archive-week').value='';filterArchive();};
renderArchive();showPage(new URLSearchParams(location.search).get('acesso')==='1');
if(isGazette){let polling=false;setInterval(async()=>{if(document.hidden||polling||!$('#admin').hidden)return;polling=true;try{await loadComments();}finally{polling=false;}},20000);}

if(configured){action(async()=>{try{await load();}catch(e){$('#next').textContent='Vamos preparar o café?';$('#queue').replaceChildren(el('p','Não foi possível carregar a fila. Tente atualizar em instantes.'));throw e;}});}else{data={admin:false,state:{version:0,participants:icons.slice(0,7).map((icon,i)=>({id:String(i+1),name:`Pessoa ${i+1}`,icon,active:true})),queue:['1','2','3','4','5','6','7']},history:[]};draft=structuredClone(data.state.participants);render();status('Demonstração: configure config.js e execute supabase/schema.sql para conectar o banco. Nenhuma alteração é salva neste modo.');}

function canWrite(){return Boolean(token&&(data?.admin||account?.can_publish));}
function roleBadge(role){
 const admin=role==='admin',label=admin?'ADMIN':'AUTOR',badge=el('span',undefined,'role-badge '+(admin?'admin-badge':'author-badge'));
 const icon=el('img');icon.src=admin?'./assets/badge-admin.svg':'./assets/badge-author.svg';icon.alt='';icon.width=20;icon.height=22;badge.title=admin?'Administrador do Café do LSN':'Autor da Gazeta do LSN';badge.append(icon,el('span',label));return badge;
}
function authorBadge(){return roleBadge('author');}
function appendRoleBadges(root,roles){if(roles?.is_admin)root.append(roleBadge('admin'));if(roles?.is_author)root.append(roleBadge('author'));}
function renderAuthorProfiles(){
 const root=$('#author-profiles');root.replaceChildren();if(!data?.admin)return;
 for(const profile of account?.profiles||[]){const row=el('article',undefined,'author-profile'),info=el('div');info.append(personLabel(profile.icon,profile.name,profile.photo));appendRoleBadges(info,profile);
 const button=el('button',profile.is_author?'Retirar insígnia':'Conceder insígnia de autor');button.type='button';button.onclick=()=>action(async()=>{await request('/rest/v1/rpc/coffee_author_set',{p_user:profile.user_id,p_enabled:!profile.is_author});await load();status(profile.is_author?'Insígnia retirada.':'Insígnia de autor concedida!');});row.append(info,button);root.append(row);}
 if(!root.children.length)root.append(el('p','Os perfis cadastrados aparecem aqui.'));
}
function removePost(post){return action(async()=>{
 if(!token||!post.can_delete)throw Error('Sem permissão para excluir esta matéria.');
 if(!confirm(`Excluir “${post.title}” da Gazeta?`))return;
 if(data?.admin){
 const confirmation=prompt(`Confirmação final: digite EXCLUIR para remover “${post.title}”. A matéria deixará de aparecer na Gazeta.`,'');
 if(confirmation===null)return;
 if(confirmation.trim()!=='EXCLUIR'){status('Nada foi removido. A confirmação precisa ser EXCLUIR.');return;}
 }
 await request('/rest/v1/rpc/coffee_post_delete',{p_id:post.id});
 $('#archive-month').value='';$('#archive-week').value='';cancelReply();$('#comment-form').reset();
 await loadPosts();await loadComments();status('Matéria excluída da Gazeta.');
});}
function renderPostAdminActions(post){
 const root=$('#post-admin-actions');root.replaceChildren();const edit=Boolean(token&&canWrite()&&post?.is_mine&&post?.can_edit),remove=Boolean(token&&data?.admin&&post?.can_delete);root.hidden=!edit&&!remove;if(root.hidden)return;
 if(edit){const button=el('button','Editar esta matéria');button.type='button';button.onclick=()=>startPostEditing(post);root.append(button);}
 if(remove){const button=el('button','Excluir esta matéria');button.type='button';button.className='delete-post';button.onclick=()=>removePost(post);root.append(button);}
}
function renderMyPosts(){
 const root=$('#my-posts'),admin=Boolean(data?.admin);root.replaceChildren();$('#my-publications').hidden=!canWrite();if(!canWrite())return;
 $('#my-publications h2').textContent=admin?'Matérias publicadas':'Minhas matérias';
 $('#my-publications .hint').textContent=admin?'Você pode editar suas próprias matérias e remover qualquer publicação. Para remover, confirme com EXCLUIR.':'Você pode editar ou excluir as matérias que publicou.';
 const visible=pearlPages.filter(p=>admin||p.is_mine);
 for(const post of visible){const row=el('article',undefined,'my-post-row'),info=el('div');info.append(el('strong',post.title),el('p',prettyDate(post.published_on)+(admin?' · '+(post.publisher_name||'Autor não informado'):'')));
 row.dataset.postId=post.id;
 if(post.is_mine&&post.can_edit){const edit=el('button','Editar matéria');edit.type='button';edit.onclick=()=>startPostEditing(post);row.append(edit);}
 row.prepend(info);if(post.can_delete){const button=el('button',admin?'Excluir matéria':'Excluir minha matéria');button.type='button';button.className='delete-post';button.onclick=()=>removePost(post);row.append(button);}root.append(row);}
 if(!visible.length)root.append(el('p',admin?'Nenhuma matéria publicada.':'Você ainda não publicou nenhuma matéria.'));
}

for(const button of document.querySelectorAll('[data-format]'))button.onclick=()=>{
 const input=postForm.elements.body,start=input.selectionStart,end=input.selectionEnd,selected=input.value.slice(start,end),mode=button.dataset.format;
 let value,innerStart;
 if(mode==='link'){
  const address=window.prompt('Endereço do link (https://…):','https://');if(address===null)return;
  try{const url=new URL(address.trim());if(!['https:','http:'].includes(url.protocol))throw Error();value='['+(selected||'Texto do link')+']('+url.href+')';innerStart=1;}
  catch{$('#post-status').textContent='Informe um endereço válido começando com https:// ou http://.';return;}
 }else if(mode==='unordered'||mode==='ordered'){value=(selected||'Item da lista').split('\n').map((line,i)=>(mode==='unordered'?'- ':`${i+1}. `)+line).join('\n');innerStart=mode==='unordered'?2:3;
 }else{const marker=mode==='bold'?'**':mode==='underline'?'__':'*';value=marker+(selected||'Seu texto')+marker;innerStart=marker.length;}
 if(input.value.length-(end-start)+value.length>input.maxLength){$('#post-status').textContent='A matéria atingiu o limite de caracteres.';return;}
 input.setRangeText(value,start,end,'end');input.focus();if(!selected)input.setSelectionRange(start+innerStart,start+innerStart+(mode==='link'?'Texto do link'.length:mode==='unordered'||mode==='ordered'?'Item da lista'.length:'Seu texto'.length));input.dispatchEvent(new Event('input',{bubbles:true}));
};

const supportEmail=String(config.supportEmail||'').trim();
if(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail)){const link=el('a',supportEmail,'support-email');link.href='mailto:'+supportEmail;$('#support-contact').replaceChildren(link);}


function renderCommentApprovals(){
 const root=$('#comment-approval-profiles');root.replaceChildren();if(!data?.admin)return;
 for(const profile of account?.profiles||[]){const row=el('article',undefined,'author-profile'),info=el('div');info.append(personLabel(profile.icon,profile.name,profile.photo),el('small',profile.is_admin?'Administrador · comentários liberados':profile.comments_approved?'Comentários autorizados':'Aguardando autorização para comentar'));
 row.append(info);if(!profile.is_admin){const button=el('button',profile.comments_approved?'Bloquear comentários':'Autorizar comentários');button.type='button';button.onclick=()=>action(async()=>{await request('/rest/v1/rpc/coffee_comment_permission_set',{p_user:profile.user_id,p_enabled:!profile.comments_approved});await load();status(profile.comments_approved?'Comentários bloqueados para este perfil.':'Comentários autorizados para este perfil!');});row.append(button);}root.append(row);}
 if(!root.children.length)root.append(el('p','Os perfis cadastrados aparecem aqui.'));
}

function renderUserProfiles(){
 const root=$('#user-profiles');root.replaceChildren();if(!token||!data?.admin)return;
 for(const profile of account?.profiles||[]){
 const row=el('article',undefined,'user-profile'),info=el('div');row.dataset.userId=profile.user_id;
 info.append(personLabel(profile.icon,profile.name,profile.photo));appendRoleBadges(info,profile);
 info.append(el('small',profile.participant_id?'Vinculado à fila do café':'Sem vaga vinculada'));
 row.append(info);
 if(profile.user_id===account?.profile?.user_id)row.append(el('small','Sua conta · exclusão protegida'));
 else{const button=el('button','Excluir usuário');button.type='button';button.className='delete-user';button.onclick=()=>action(async()=>{
 if(!token||!data?.admin)throw Error('Acesso exclusivo do administrador.');
 if(!confirm(`Excluir a conta de “${profile.name}”? O acesso, a vaga na fila e as solicitações serão removidos. Compras e matérias serão preservadas. Comentários serão marcados como removidos, mantendo as respostas.`))return;
 const confirmation=prompt(`Confirmação final: digite EXCLUIR para apagar a conta de “${profile.name}”. A exclusão da conta é definitiva.`,'');
 if(confirmation===null)return;
 if(confirmation.trim()!=='EXCLUIR'){status('Nada foi removido. A confirmação precisa ser EXCLUIR.');return;}
 try{await request('/rest/v1/rpc/coffee_user_delete',{p_user:profile.user_id,p_confirmation:confirmation.trim()});}
 catch(e){if(e.message.includes('coffee_user_delete')&&/schema cache|Could not find/.test(e.message))throw Error('A exclusão de usuários ainda precisa ser ativada: execute supabase/013_user_deletion.sql no SQL Editor.');throw e;}
 await load();status('Conta excluída. O histórico de compras e as matérias foram preservados.');
 });row.append(button);}
 root.append(row);
 }
 if(!root.children.length)root.append(el('p','Nenhum perfil cadastrado.'));
}

$('#history-reset').onclick=()=>action(async()=>{
 if(!token||!data?.admin)throw Error('Acesso exclusivo do administrador.');
 const version=data.state.version;
 if(!confirm('Resetar todo o histórico de abastecimento? Isso apaga “Quem abasteceu” e zera os totais de cotas de energia e produtividade. A exclusão é definitiva.'))return;
 const confirmation=prompt('Confirmação final: digite RESETAR para apagar o histórico de abastecimento. A fila, os participantes e o placar de xícaras serão preservados.','');
 if(confirmation===null)return;
 if(confirmation.trim()!=='RESETAR'){status('Nada foi apagado. A confirmação precisa ser RESETAR.');return;}
 try{await request('/rest/v1/rpc/coffee_history_reset',{p_version:version,p_confirmation:confirmation.trim()});}
 catch(e){if(e.message.includes('coffee_history_reset')&&/schema cache|Could not find/.test(e.message))throw Error('O reset ainda precisa ser ativado: execute supabase/015_history_reset.sql no SQL Editor.');throw e;}
 pending=null;await load();status('Histórico de abastecimento zerado. Cotas e produtividade também. A cafeteira segue trabalhando.');
});

function renderCupRankingProfiles() {
  const root = $('#cup-ranking-profiles');
  root.replaceChildren();
  if (!data?.admin) return;

  for (const profile of account?.profiles || []) {
    const row = el('article', undefined, 'author-profile');
    row.dataset.userId = profile.user_id;
    const info = el('div');
    const enabled = profile.cup_ranking_enabled === true;
    const mayComment = profile.is_admin || profile.comments_approved;
    let description = 'Fora do ranking';
    if (enabled) description = mayComment ? 'Participando do ranking' : 'Incluído · aguardando autorização para comentar';
    info.append(personLabel(profile.icon, profile.name, profile.photo), el('small', description));

    const button = el('button', enabled ? 'Retirar do ranking' : 'Incluir no ranking');
    button.type = 'button';
    button.onclick = () => action(async () => {
      await request('/rest/v1/rpc/coffee_cup_ranking_set', {
        p_user: profile.user_id,
        p_enabled: !enabled
      });
      await load();
      status(enabled ? 'Perfil retirado do ranking. O consumo registrado ficou guardado.' : 'Perfil incluído no ranking da cafeína.');
    });
    row.append(info, button);
    root.append(row);
  }
  if (!root.children.length) root.append(el('p', 'Os perfis cadastrados aparecem aqui.'));
}
