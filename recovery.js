import {config} from './config.js?v=20261113';
const $=s=>document.querySelector(s),storageKey='coffee-password-recovery';
let recovery=null,busy=false,cooldownUntil=0;
function message(text){$('#recovery-status').textContent=text;}
function forget(){recovery=null;try{sessionStorage.removeItem(storageKey);}catch{}}
function saveRecovery(result){
 if(!result.access_token)throw Error('O link não trouxe uma autorização válida. Peça outro.');
 recovery={token:result.access_token,expiresAt:result.expires_at?Number(result.expires_at)*1000:Date.now()+Math.max(0,Number(result.expires_in)||3600)*1000};
 try{sessionStorage.setItem(storageKey,JSON.stringify(recovery));}catch{}
}
function showReset(){const valid=recovery?.expiresAt>Date.now();$('#recover-reset').hidden=!valid;$('#recover-request').hidden=Boolean(valid);$('#recovery-again').hidden=!valid;}
async function call(path,body,method='POST',bearer=null){
 const headers={apikey:config.supabaseKey,'Content-Type':'application/json'};if(bearer)headers.Authorization='Bearer '+bearer;
 const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+'/auth/v1'+path,{method,headers,body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok){const error=Error(response.status===429?'Calma. Até o servidor precisa de uma pausa. Aguarde um pouco antes de tentar de novo.':result?.msg||result?.message||result?.error_description||'Não foi possível concluir. Tente novamente em instantes.');error.status=response.status;throw error;}
 return result;
}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){message(e instanceof TypeError||e.name==='TimeoutError'?'A conexão tirou uma pausa para o café. Confira sua internet e tente novamente.':e.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);syncCooldown();}}
function syncCooldown(){const seconds=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000)),button=$('#recover-request button');button.disabled=busy||seconds>0;button.textContent=seconds?'Aguarde '+seconds+' s. Respira e toma um café.':'Mandar o resgate por e-mail';}
setInterval(syncCooldown,1000);
$('#recover-request').onsubmit=e=>{e.preventDefault();action(async()=>{
 if(Date.now()<cooldownUntil)return;
 if(!config.supabaseUrl||!config.supabaseKey)throw Error('O serviço de recuperação não está configurado.');
 const redirect=new URL('./recuperar.html',location.href);redirect.search='';redirect.hash='';
 await call('/recover?redirect_to='+encodeURIComponent(redirect.href),{email:e.target.elements.email.value.trim()});
 cooldownUntil=Date.now()+60000;
 message('Se esse e-mail tiver uma conta, o link de resgate vai chegar. Confira a caixa de entrada e o spam. O pombo-correio foi aposentado.');
});};
$('#recover-reset').onsubmit=e=>{e.preventDefault();action(async()=>{
 const form=e.target,password=form.elements.password.value;
 if(password.length<8)throw Error('Pelo menos 8 caracteres. Vamos colaborar com a memória e com a segurança.');
 if(password!==form.elements.confirmation.value)throw Error('As senhas não conferem. Duas iguais, por favor. Não é um teste de criatividade.');
 if(!recovery||recovery.expiresAt<=Date.now()){forget();showReset();throw Error('O link esfriou antes do café. Peça outro para continuar.');}
 try{await call('/user',{password},'PUT',recovery.token);}
 catch(e){if(e.status===401||e.status===403){forget();showReset();throw Error('Esse link venceu ou já foi usado. Peça outro — ele não é café requentado.');}throw e;}
 forget();form.reset();$('#recover-reset').hidden=true;$('#recover-request').hidden=true;$('#recovery-again').hidden=true;$('#recovery-login').hidden=false;
 try{localStorage.removeItem('coffee-session-v2');sessionStorage.removeItem('coffee-session');}catch{}
 message('Senha atualizada. Agora tente não terceirizar a memória para o café. Entre com a nova senha.');
});};
$('#recovery-again').onclick=()=>{forget();$('#recover-reset').reset();showReset();message('Vamos tentar de novo. Sem julgamento. Quase.');$('#recover-request input').focus();};
async function init(){
 $('#recovery-login').hidden=true;
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search),error=hash.get('error_description')||query.get('error_description')||hash.get('error')||query.get('error')||hash.get('error_code')||query.get('error_code');
 const type=hash.get('type')||query.get('type'),tokenHash=query.get('token_hash');
 const incoming=type==='recovery'&&hash.get('access_token')?{access_token:hash.get('access_token'),expires_in:hash.get('expires_in'),expires_at:hash.get('expires_at')}:null;
 // Remove recovery credentials from the address immediately; never store them in the normal login.
 if(location.hash||query.has('token_hash')||error)history.replaceState(null,'',location.pathname);
 if(error){forget();showReset();message('O link venceu ou já foi usado. Peça outro — senha não se recupera na força do ódio.');return;}
 try{
  if(incoming)saveRecovery(incoming);
  else if(type==='recovery'&&tokenHash)saveRecovery(await call('/verify',{token_hash:tokenHash,type:'recovery'}));
  else{try{recovery=JSON.parse(sessionStorage.getItem(storageKey));}catch{} }
  if(recovery&&recovery.expiresAt<=Date.now()){forget();message('O link esfriou antes do café. Peça outro para continuar.');}
  showReset();
 }catch{forget();showReset();message('Não foi possível validar o link. Peça outro e tente novamente.');}
}
window.addEventListener('hashchange',init);
init();
