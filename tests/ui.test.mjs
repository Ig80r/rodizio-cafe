import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('navegação, cadastro, login, logout e layout móvel',async()=>{
 const server=createServer(async(req,res)=>{try{const file=req.url==='/'?'index.html':req.url.slice(1);if(!['index.html','style.css','app.js','config.js'].includes(file)&&!/^assets\/[a-z-]+\.svg$/.test(file)){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.svg')?'image/svg+xml':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(new URL('../'+file,import.meta.url)));}catch{res.writeHead(500).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let logged=false,adminMode=false;
 await page.route('https://fonts.googleapis.com/**',r=>r.abort());
 await page.route('https://*.supabase.co/**',async route=>{const path=new URL(route.request().url()).pathname;let body={};
 if(path.endsWith('/token')){logged=true;body={access_token:'test-token'};}
 if(path.endsWith('/logout'))logged=false;
 if(path.endsWith('/coffee_read'))body={admin:adminMode&&logged,state:{version:0,participants:[{id:'1',name:'Ana',icon:'🦊',active:true}],queue:['1']},history:[]};
 if(path.endsWith('/coffee_account'))body={profile:{user_id:'u1',name:'Ana',icon:'🦊',participant_id:'1'},profiles:adminMode?[{user_id:'u2',name:'Cafeteiro exemplo',icon:'🐸',participant_id:null}]:[],requests:[{id:'request-example',user_id:'u1',name:'Ana',icon:'🦊',quotas:2,note:'Café para a próxima rodada (exemplo)',status:'pending',created_at:'2026-10-31T12:00:00Z'}]};
 await route.fulfill({json:body});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#next').filter({hasText:'Ana'}).waitFor();
 await page.locator('#admin-toggle').click();assert.equal(await page.locator('#overview').isVisible(),false);assert.equal(await page.locator('#login').isVisible(),true);assert.equal(await page.locator('#signup').isVisible(),false);
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH.replace('.png','-login.png'),fullPage:true});
 await page.locator('#signup-tab').click();await page.locator('#signup input[name=email]').fill('ana@example.com');await page.locator('#signup input[name=password]').fill('test-password-123');await page.locator('#signup button').click();await page.locator('#status').filter({hasText:'Cadastro enviado'}).waitFor();assert.equal(await page.locator('#login').isVisible(),true);
 await page.locator('#login input[name=email]').fill('ana@example.com');await page.locator('#login input[name=password]').fill('test-password-123');await page.locator('#login button').click();await page.locator('#member').waitFor();assert.equal(logged,true);assert.equal(await page.locator('#controls').isVisible(),false);assert.equal(await page.locator('.auth-tabs').isVisible(),false);
 if(process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH.replace('.png','-cafeteiro.png'),fullPage:true});
 await page.locator('#logout').click();await page.locator('#login').waitFor();assert.equal(logged,false);assert.equal(await page.locator('#member').isVisible(),false);assert.equal(await page.locator('#signup').isVisible(),false);
 await page.locator('#overview-tab').click();assert.match(await page.title(),/Café do LSN/);assert.equal(await page.locator('#queue .avatar').getAttribute('src'),'./assets/raposa.svg');assert.equal(await page.locator('.cafe-scene img').evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.equal(await page.locator('#mural blockquote').count(),1);for(const selector of ['.brand-logo','.top-coffee'])assert.equal(await page.locator(selector).evaluate(img=>img.complete&&img.naturalWidth>0),true);assert.match(await page.locator('.quote-credit').innerText(),/Bolsista anônimo/);await page.emulateMedia({reducedMotion:'no-preference'});
 await page.locator('#paper-turn').click();assert.match(await page.locator('#pearl-page blockquote').innerText(),/reproduzível/);assert.equal(await page.locator('#paper-page-number').innerText(),'Página 2 de 2');
 await page.locator('#paper-turn').focus();await page.keyboard.press('Enter');assert.match(await page.locator('#pearl-page blockquote').innerText(),/nossa fé/);assert.equal(await page.locator('#paper-page-number').innerText(),'Página 1 de 2');
 assert.equal(await page.locator('#scene-motion').count(),0);
 assert.equal(await page.locator('#lab-scene').getAttribute('src'),'./assets/science-lab-animated.svg');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#lab-scene').getAttribute('src')==='./assets/science-lab.svg');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('#lab-scene').getAttribute('src')==='./assets/science-lab-animated.svg');
 await page.screenshot({path:process.env.SCREENSHOT_PATH||'preview.png',fullPage:true});
 if(process.env.SCREENSHOT_PATH){for(let i=0;i<16;i++){await page.locator('.cafe-scene').screenshot({path:process.env.SCREENSHOT_PATH.replace('.png','-frame-'+i+'.png')});await page.waitForTimeout(180);}}

 for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow at '+width);const cup=await page.locator('.top-coffee').boundingBox(),photo=await page.locator('.paper-photo').boundingBox();assert.ok(cup.x>=photo.x+photo.width||cup.y>=photo.y+photo.height,'cup must not cover newspaper photo');if(width===375&&process.env.SCREENSHOT_PATH)await page.screenshot({path:process.env.SCREENSHOT_PATH.replace('.png','-mobile.png'),fullPage:true});}
 adminMode=true;
 await page.locator('#admin-toggle').click();
 await page.locator('#login input[name=email]').fill('admin@example.com');await page.locator('#login input[name=password]').fill('test-password-123');await page.locator('#login button').click();await page.locator('#controls').waitFor();
 assert.equal(await page.locator('#pending-profiles .person').count(),1);assert.equal(await page.locator('#pending-buys .person').count(),1);
 if(process.env.SCREENSHOT_PATH){await page.screenshot({path:process.env.SCREENSHOT_PATH.replace('.png','-administracao.png'),fullPage:true});await page.locator('#controls').screenshot({path:process.env.SCREENSHOT_PATH.replace('.png','-painel-admin.png')});}
 assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

