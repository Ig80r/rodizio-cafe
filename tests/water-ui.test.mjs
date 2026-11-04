import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {startPreview, USERS} = require('../scripts/preview-water.cjs');

test('água no navegador com banco local: inclusão, solicitação, aprovação e litros', async () => {
  const {server, db} = await startPreview(0);
  let browser;
  try {
    browser = await chromium.launch({headless: true, ...(process.env.BROWSER_PATH ? {executablePath: process.env.BROWSER_PATH} : {})});
    const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
    if (!process.env.LOAD_WEB_FONTS) await context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:' + server.address().port;
    const profilePhoto = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 40; canvas.height = 40;
      const context = canvas.getContext('2d');
      context.fillStyle = '#7bb4cb'; context.fillRect(0, 0, 40, 40);
      return canvas.toDataURL('image/jpeg');
    });
    await db.query('UPDATE coffee_private.profiles SET photo=$1 WHERE user_id=$2', [profilePhoto, USERS.livia.id]);
    await page.goto(base + '/agua.html');
    await page.locator('#water-next').filter({hasText: USERS.livia.name}).waitFor();
    assert.equal(await page.locator('#water-next .avatar.profile-picture').getAttribute('src'), profilePhoto);
    assert.equal(await page.locator('#water-queue .person').first().locator(':scope > .avatar.profile-picture').getAttribute('src'), profilePhoto);
    assert.equal(await page.locator('#water-queue .person').nth(1).locator(':scope > .avatar').getAttribute('src'), './assets/carcara.svg');
    assert.equal(await page.locator('#water-admin').isVisible(), false);
    await page.locator('[data-demo-user=bia]').click();
    await page.locator('#water-access').filter({hasText: 'incluir seu perfil'}).waitFor();
    assert.equal(await page.locator('#water-submit').isVisible(), false);
    await page.locator('[data-demo-user=admin]').click();
    await page.locator('#water-admin').waitFor();
    const biaRow = page.locator('#water-member-profiles [data-user-id="' + USERS.bia.id + '"]');
    await biaRow.getByRole('button', {name: 'Incluir na água'}).click();
    await page.locator('#water-status').filter({hasText: 'Participante incluído'}).waitFor();
    await page.locator('[data-demo-user=bia]').click();
    await page.locator('#water-submit').waitFor();
    await page.locator('#water-submit input[name=quantity]').fill('2');
    await page.locator('#water-submit input[name=quantity]').dispatchEvent('input');
    assert.match(await page.locator('#water-submit .water-volume').innerText(), /40 litros/);
    await page.locator('#water-submit input[name=note]').fill('Entrega de teste da Bia');
    await page.locator('#water-submit button').click();
    await page.locator('#water-status').filter({hasText: 'Solicitação enviada'}).waitFor();
    assert.equal(await page.locator('#water-bottles').innerText(), '3');
    await page.locator('[data-demo-user=admin]').click();
    const pending = page.locator('#water-pending .water-request').filter({hasText: 'Entrega de teste da Bia'});
    await pending.waitFor();
    page.once('dialog', dialog => dialog.accept());
    await pending.getByRole('button', {name: 'Confirmar entrega'}).click();
    await page.locator('#water-status').filter({hasText: 'Entrega confirmada'}).waitFor();
    assert.equal(await page.locator('#water-bottles').innerText(), '5');
    assert.equal(await page.locator('#water-liters').innerText(), '100 L');
    await page.locator('#water-history').filter({hasText: 'Entrega de teste da Bia'}).waitFor();
    await biaRow.getByRole('button', {name: 'Retirar da água'}).click();
    await page.locator('#water-status').filter({hasText: 'Participante retirado'}).waitFor();
    assert.equal(await page.locator('#water-bottles').innerText(), '5');
    await page.locator('#water-buy select').selectOption(USERS.ana.id);
    await page.locator('#water-buy input[name=quantity]').fill('1');
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#water-buy button').click();
    await page.locator('#water-status').filter({hasText: 'Entrega registrada'}).waitFor();
    assert.equal(await page.locator('#water-liters').innerText(), '120 L');
    const litersBeforeOrder = await page.locator('#water-liters').innerText();
    await page.getByRole('button', {name: 'Subir ' + USERS.ana.name, exact: true}).click();
    await page.getByRole('button', {name: 'Subir ' + USERS.ana.name, exact: true}).click();
    assert.match(await page.locator('#water-order-note').innerText(), /Após salvar/);
    assert.match(await page.locator('#water-next').innerText(), /Lívia/);
    await page.locator('#water-order-save').click();
    await page.locator('#water-status').filter({hasText: 'Ordem da água salva'}).waitFor();
    assert.equal(await page.locator('#water-next').innerText(), USERS.ana.name);
    assert.equal(await page.locator('#water-liters').innerText(), litersBeforeOrder);
    await page.getByRole('button', {name: 'Descer ' + USERS.ana.name, exact: true}).click();
    await page.locator('#water-order-discard').click();
    assert.match(await page.locator('#water-order-list .water-order-row').first().innerText(), /Ana da bancada/);
    assert.equal(await page.locator('#water-order-save').isDisabled(), true);
    if (process.env.WATER_SCREENSHOT) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path: process.env.WATER_SCREENSHOT, fullPage: true});
    }
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({width, height: 1100});
      const overflow = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(item => item.getBoundingClientRect().right > innerWidth + 1).map(item => ({tag:item.tagName,id:item.id,cls:item.className,width:item.getBoundingClientRect().width,right:item.getBoundingClientRect().right})).slice(-15));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'água overflow ' + width + JSON.stringify(overflow));
      if (width === 390 && process.env.WATER_SCREENSHOT) await page.screenshot({path: process.env.WATER_SCREENSHOT.replace('.png', '-celular.png'), fullPage: true});
    }
    await page.goto(base + '/index.html');
    await page.locator('.water-entry a').waitFor();
    await page.locator('.water-entry a').click();
    await page.locator('#water-admin').waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await db.close();
  }
});
