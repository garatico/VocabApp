/**
 * test-api.js
 *
 * Manual smoke-test for the running backend.
 * Usage: node scripts/test-api.js
 * Make sure the backend is running first: npm run dev
 */

const BASE_URL = 'http://localhost:3000';

async function request(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res  = await fetch(`${BASE_URL}${path}`, opts);
    const data = await res.json();
    return { status: res.status, ok: res.ok, data };
  } catch (err) {
    return { error: err.message };
  }
}

function check(label, condition, detail = '') {
  const icon = condition ? '✓' : '✗';
  console.log(`  ${icon} ${label}${detail ? ' — ' + detail : ''}`);
  if (!condition) process.exitCode = 1;
}

async function run() {
  console.log('\n🧪  VocabApp API smoke-test\n');

  // ── Health ───────────────────────────────────────────────────────────────
  console.log('Health');
  const health = await request('/api/health');
  if (health.error) {
    console.log(`  ✗ Could not connect: ${health.error}`);
    console.log('  Make sure the backend is running: npm run dev');
    process.exit(1);
  }
  check('200 OK',              health.status === 200);
  check('status: ok',          health.data.status === 'ok');
  check('uptime is a number',  typeof health.data.uptime === 'number');

  // ── Vocabulary ───────────────────────────────────────────────────────────
  console.log('\nGET /api/vocab/spanish');
  const spa = await request('/api/vocab/spanish');
  check('200 OK',              spa.status === 200);
  check('success: true',       spa.data.success === true);
  check('has data array',      Array.isArray(spa.data.data));
  check('word count > 0',      (spa.data.count ?? 0) > 0, `${spa.data.count} words`);
  if (spa.data.data?.[0]) {
    const w = spa.data.data[0];
    check('word has glosses',  Array.isArray(w.glosses));
    check('word has examples', Array.isArray(w.examples));
    check('word has domains',  Array.isArray(w.domains));
  }

  console.log('\nGET /api/vocab/Spanish  (case-insensitive)');
  const spaUpper = await request('/api/vocab/Spanish');
  check('200 OK',              spaUpper.status === 200);
  check('language normalised', spaUpper.data.language === 'spanish');

  console.log('\nGET /api/vocab/klingon  (unknown language → 404)');
  const bad = await request('/api/vocab/klingon');
  check('404',                 bad.status === 404);
  check('error is a string',   typeof bad.data.error === 'string');

  // ── Admin (dev-only) ─────────────────────────────────────────────────────
  console.log('\nGET /api/admin/stats');
  const stats = await request('/api/admin/stats');
  check('200 OK',              stats.status === 200);
  check('has spanish stats',   !!stats.data.stats?.spanish);

  console.log('\nPOST /api/admin/cache/clear  (single language)');
  const clear = await request('/api/admin/cache/clear', 'POST', { lang: 'spanish' });
  check('200 OK',              clear.status === 200);
  check('success: true',       clear.data.success === true);

  console.log(`\n${process.exitCode ? '❌  Some checks failed.' : '✅  All checks passed.'}\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
