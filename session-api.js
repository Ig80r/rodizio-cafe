import {config} from './config.js?v=20261116';
let session=readStored(),refreshing=null;
function readStored(){try{return JSON.parse(localStorage.getItem('coffee-session-v2')||sessionStorage.getItem('coffee-session'));}catch{return null;}}
export function hasSession(){return Boolean(session?.token);}
function clear(){session=null;try{localStorage.removeItem('coffee-session-v2');sessionStorage.removeItem('coffee-session');}catch{}}
function remember(result){session={token:result.access_token,refreshToken:result.refresh_token||session?.refreshToken,expiresAt:result.expires_at?Number(result.expires_at)*1000:Date.now()+(Number(result.expires_in)||3600)*1000};try{localStorage.setItem('coffee-session-v2',JSON.stringify(session));sessionStorage.removeItem('coffee-session');}catch{}}
async function raw(path,body,bearer){
 if(!config.supabaseUrl||!config.supabaseKey)throw Error('O serviço do café ainda não está configurado.');
 const headers={apikey:config.supabaseKey,'Content-Type':'application/json'};if(bearer)headers.Authorization='Bearer '+bearer;
 const response=await fetch(config.supabaseUrl.replace(/\/$/,'')+path,{method:'POST',headers,body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(20000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok){const error=Error(result?.message||result?.error_description||result?.msg||'Não foi possível conversar com a cafeteira. Tente novamente.');error.status=response.status;throw error;}
 return result;
}
async function refresh(){
 if(refreshing)return refreshing;if(!session?.refreshToken){clear();return false;}
 refreshing=(async()=>{try{remember(await raw('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refreshToken}));return true;}catch(error){if(error.status===400||error.status===401){clear();return false;}throw error;}finally{refreshing=null;}})();return refreshing;
}
export async function rpc(name,payload={}){
 if(session&&(!session.expiresAt||session.expiresAt<Date.now()+60000))await refresh();
 try{return await raw('/rest/v1/rpc/'+name,payload,session?.token);}catch(error){if(error.status===401&&session){if(await refresh())return raw('/rest/v1/rpc/'+name,payload,session?.token);}throw error;}
}
export async function login(email,password){remember(await raw('/auth/v1/token?grant_type=password',{email,password}));}
export async function logout(){try{if(session)await raw('/auth/v1/logout',{},session.token);}finally{clear();}}
window.addEventListener('storage',event=>{if(event.key==='coffee-session-v2'){session=readStored();window.dispatchEvent(new Event('coffee-session-changed'));}});
