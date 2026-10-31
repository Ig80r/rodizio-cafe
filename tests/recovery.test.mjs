import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('recuperação por e-mail, troca, confirmação, recarga e links inválidos',async()=>{
 const server=createServer(async(req,res)=>{try{const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';if(!['index.html','gazeta.html','recuperar.html','app.js','formatting.js','recovery.js','config.js','style.css'].includes(file)&&!/^assets\/[a-z-]+\.svg$/.test(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(await readFile(new URL('../'+file,import.meta.url)));}catch{res.writeHead(500).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage();page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));let recoverCalls=0,userCalls=0,invalid=false,lastPassword=null;
 await context.route('https://fonts.googleapis.com/**',r=>r.abort());
 await context.route('https://*.supabase.co/**',async route=>{const request=route.request(),url=new URL(request.url());
 if(url.pathname.endsWith('/recover')){recoverCalls++;assert.match(url.searchParams.get('redirect_to'),/\/recuperar\.html$/);assert.equal(request.postDataJSON().email,'ana@example.com');await route.fulfill({json:{}});return;}
 if(url.pathname.endsWith('/user')){userCalls++;assert.equal(request.method(),'PUT');assert.equal(request.headers().authorization,'Bearer recovery-test');if(invalid){await route.fulfill({status:401,json:{msg:'Invalid token'}});return;}lastPassword=request.postDataJSON().password;await route.fulfill({json:{id:'u1'}});return;}
 await route.fulfill({json:{}});
 });
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/recuperar.html');await page.locator('#recover-request input').fill('ana@example.com');await page.locator('#recover-request button').click();await page.locator('#recovery-status').filter({hasText:'Se esse e-mail tiver uma conta'}).waitFor();assert.equal(recoverCalls,1);assert.equal(await page.locator('#recover-request button').isDisabled(),true);
 const fragment='#type=recovery&access_token=recovery-test&refresh_token=do-not-store&expires_in=3600';
 await page.goto(base+'/recuperar.html'+fragment);await page.locator('#recover-reset').waitFor();assert.doesNotMatch(page.url(),/recovery-test|do-not-store/);assert.equal(await page.evaluate(()=>localStorage.getItem('coffee-password-recovery')),null);
 await page.reload();await page.locator('#recover-reset').waitFor();await page.locator('#recover-reset input[name=password]').fill('Cafe123');assert.equal(await page.locator('#recover-reset input[name=password]').evaluate(i=>i.validity.tooShort),true);assert.equal(userCalls,0);
 await page.locator('#recover-reset input[name=password]').fill('Cafe1234');await page.locator('#recover-reset input[name=confirmation]').fill('Diferente');await page.locator('#recover-reset button').click();await page.locator('#recovery-status').filter({hasText:'não conferem'}).waitFor();assert.equal(userCalls,0);
 await page.evaluate(()=>localStorage.setItem('coffee-session-v2','old-session'));await page.locator('#recover-reset input[name=confirmation]').fill('Cafe1234');await page.locator('#recover-reset button').click();await page.locator('#recovery-login').waitFor();assert.equal(lastPassword,'Cafe1234');assert.equal(await page.evaluate(()=>sessionStorage.getItem('coffee-password-recovery')),null);assert.equal(await page.evaluate(()=>localStorage.getItem('coffee-session-v2')),null);
 await page.reload();assert.equal(await page.locator('#recover-reset').isVisible(),false);
 invalid=true;await page.goto(base+'/recuperar.html'+fragment);await page.locator('#recover-reset').waitFor();await page.locator('#recover-reset input[name=password]').fill('Cafe5678');await page.locator('#recover-reset input[name=confirmation]').fill('Cafe5678');await page.locator('#recover-reset button').click();await page.locator('#recovery-status').filter({hasText:'venceu ou já foi usado'}).waitFor();assert.equal(await page.locator('#recover-reset').isVisible(),false);assert.equal(await page.evaluate(()=>sessionStorage.getItem('coffee-password-recovery')),null);
 await page.goto(base+'/recuperar.html#type=recovery&access_token=recovery-test&expires_at=1');await page.locator('#recovery-status').filter({hasText:'esfriou'}).waitFor();assert.equal(await page.locator('#recover-reset').isVisible(),false);
 await page.goto(base+'/recuperar.html?error_code=otp_expired');await page.locator('#recovery-status').filter({hasText:'venceu ou já foi usado'}).waitFor();assert.doesNotMatch(page.url(),/error_code/);
 // Fallback for projects that still redirect recovery e-mails to the home page.
 await page.goto(base+'/index.html'+fragment);await page.waitForURL(/recuperar\.html$/);await page.locator('#recover-reset').waitFor();assert.doesNotMatch(page.url(),/access_token/);
 if(process.env.RECOVERY_SCREENSHOT)await page.screenshot({path:process.env.RECOVERY_SCREENSHOT,fullPage:true});
 for(const width of [375,1100]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
