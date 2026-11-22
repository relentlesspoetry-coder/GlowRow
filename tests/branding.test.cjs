const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('the header has an embedded offline WebP and an accessible application name', () => {
  const html = readFileSync(join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
  const header = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1];
  assert.ok(header);
  const embedded = header.match(/<img class="logo" src="data:image\/webp;base64,([A-Za-z0-9+/=]+)" width="256" height="256" alt=""/)?.[1];
  assert.ok(embedded);
  const image = Buffer.from(embedded, 'base64');
  assert.equal(image.toString('ascii', 0, 4), 'RIFF');
  assert.equal(image.readUInt32LE(4) + 8, image.length);
  assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  assert.match(header, /<h1 class="brand-name">GlowRow<\/h1>/);
  assert.match(html, /img-src blob: data:; connect-src 'none';/);
});
