const { chromium } = require('playwright');

const shots = process.env.HOME + '/karmic-audit';
require('fs').mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const report = {};

  async function visit(name, path, viewport) {
    const page = await browser.newPage({ viewport });
    // Block external font CDNs — offline env never resolves them and screenshots hang.
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 140)));
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 140)));
    await page.goto('http://localhost:3000' + path, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => errors.push('GOTO ' + e));
    await page.waitForTimeout(2500);
    const key = name + (viewport.width < 800 ? '-mobile' : '');
    try {
      // Freeze rAF-driven canvases so the compositor can produce a still frame.
      await page.evaluate(() => document.querySelectorAll('canvas').forEach((c) => c.remove()));
      await page.screenshot({ path: `${shots}/${key}.png`, timeout: 10000 });
    } catch (e) {
      report[key + '-shot'] = 'screenshot skipped: ' + String(e).slice(0, 80);
    }
    report[key] = { errors: errors.slice(0, 4), title: await page.title() };
    return page;
  }

  const desktop = { width: 1440, height: 900 };
  const mobile = { width: 390, height: 844 };

  // 1. Landing
  const land = await visit('landing', '/', desktop);
  report['landing'].h1 = await land.locator('h1').first().textContent().catch(() => null);
  await land.close();
  await visit('landing', '/', mobile).then((p) => p.close());

  // 2. Birth form
  const form = await visit('form', '/reading', desktop);
  report['form'].labels = await form.locator('label').allTextContents().catch(() => []);
  await form.close();
  await visit('form', '/', mobile).then((p) => p.close());

  // 3. Sample report — duplicate-title check
  const sample = await visit('sample', '/sample', desktop);
  const dup = await sample.evaluate(() => {
    const text = document.body.innerText;
    const count = (text.match(/Life Purpose & Soul Mission/g) || []).length;
    // find the first section card and see if an h1 with the title sits inside it
    const firstCard = document.querySelector('#section-life_purpose');
    const cardH1s = firstCard ? [...firstCard.querySelectorAll('h1')].map((h) => h.textContent.trim()) : ['CARD NOT FOUND'];
    return { titleOccurrences: count, cardH1s };
  });
  report['sample-dup-check'] = dup;
  await sample.evaluate(() => document.querySelector('#section-life_purpose')?.scrollIntoView());
  await sample.waitForTimeout(1200);
  await sample.screenshot({ path: shots + '/sample-section.png' });
  await sample.close();

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
