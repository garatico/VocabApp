/**
 * build-native.ts — one command to build the offline/native targets.
 *
 *   npm run build:web        static site, no server needed
 *   npm run build:windows    Tauri .msi / .exe
 *   npm run build:android    Capacitor APK
 *   npm run build:native     both
 *   npm run native:check     report what tooling is missing, build nothing
 *
 * The pipeline for every target is the same up to packaging:
 *
 *   1. export the vocabulary to static JSON      (no server at runtime)
 *   2. stage data/ assets into public/           (images, emoji, svgs)
 *   3. vite build                                 -> dist/
 *   4. hand dist/ to Tauri or Capacitor
 *
 * Step 2 exists because Express serves those directories from data/ at
 * runtime, flattening the domain sub-folders as it goes: a request for
 * /emoji/1F600.svg is satisfied from data/emoji/<any-domain>/1F600.svg. A
 * packaged app has no Express, so the same flattening has to happen at build
 * time or every image 404s.
 *
 * Prerequisites are checked and reported before anything runs — a Rust or
 * Android SDK failure forty seconds into a build is a worse experience than
 * being told up front.
 */

import { execSync, spawnSync } from 'node:child_process';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Target = 'web' | 'windows' | 'android' | 'native' | 'check';

// ── Output helpers ────────────────────────────────────────────────────────────

const bar = '='.repeat(70);
function step(n: number, total: number, text: string): void {
  console.log(`\n${bar}\n  [${n}/${total}] ${text}\n${bar}`);
}
function ok(msg: string): void   { console.log(`  [ok]      ${msg}`); }
function warn(msg: string): void { console.log(`  [!]       ${msg}`); }
function bad(msg: string): void  { console.log(`  [MISSING] ${msg}`); }

// ── Prerequisite checks ───────────────────────────────────────────────────────

interface Tool { cmd: string; args: string[]; label: string; hint: string; }

const TOOLS: Record<'windows' | 'android', Tool[]> = {
  windows: [
    { cmd: 'cargo',  args: ['--version'], label: 'Rust (cargo)',
      hint: 'https://rustup.rs — Tauri compiles a Rust shell' },
    { cmd: 'rustc',  args: ['--version'], label: 'Rust (rustc)',
      hint: 'installed alongside cargo by rustup' },
  ],
  android: [
    { cmd: 'java',   args: ['-version'],  label: 'Java JDK 17+',
      hint: 'https://adoptium.net — Gradle needs a JDK' },
  ],
};

function have(tool: Tool): boolean {
  const r = spawnSync(tool.cmd, tool.args, { stdio: 'ignore', shell: true });
  return r.status === 0;
}

function checkTarget(target: 'windows' | 'android'): boolean {
  let allGood = true;
  for (const tool of TOOLS[target]) {
    if (have(tool)) ok(tool.label);
    else { bad(`${tool.label} — ${tool.hint}`); allGood = false; }
  }

  if (target === 'android') {
    const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
    if (sdk && fs.existsSync(sdk)) ok(`Android SDK (${sdk})`);
    else {
      bad('Android SDK — set ANDROID_HOME, or install Android Studio');
      allGood = false;
    }
  }

  const dir = path.join(root, target === 'windows' ? 'src-tauri' : 'android');
  if (fs.existsSync(dir)) ok(`${path.basename(dir)}/ scaffolding present`);
  else warn(`${path.basename(dir)}/ not initialised yet — see the note printed at the end`);

  return allGood;
}

// ── Asset staging ─────────────────────────────────────────────────────────────

/** Directories written into public/ by staging. Cleared before each run. */
const STAGED = ['images', 'emoji', 'svgs'];

function copyFlattened(fromDir: string, toDir: string): { files: number; clashes: string[] } {
  const clashes: string[] = [];
  let files = 0;
  if (!fs.existsSync(fromDir)) return { files, clashes };
  fs.mkdirSync(toDir, { recursive: true });

  // Express mounts each domain sub-folder at the same URL prefix, so the
  // flattened layout is what the client already expects.
  const entries = fs.readdirSync(fromDir, { withFileTypes: true });
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const src = path.join(dir, e.name);
      if (e.isDirectory()) { walk(src); continue; }
      const dest = path.join(toDir, e.name);
      if (fs.existsSync(dest)) { clashes.push(e.name); continue; }
      fs.copyFileSync(src, dest);
      files++;
    }
  };
  for (const e of entries) {
    const p = path.join(fromDir, e.name);
    if (e.isDirectory()) walk(p);
    else {
      const dest = path.join(toDir, e.name);
      if (fs.existsSync(dest)) clashes.push(e.name);
      else { fs.copyFileSync(p, dest); files++; }
    }
  }
  return { files, clashes };
}

function stageAssets(): void {
  const dataDir   = path.join(root, 'data');
  const publicDir = path.join(root, 'public');
  let total = 0;

  for (const name of STAGED) {
    const dest = path.join(publicDir, name);
    fs.rmSync(dest, { recursive: true, force: true });
    const { files, clashes } = copyFlattened(path.join(dataDir, name), dest);
    total += files;
    console.log(`  ${name.padEnd(8)} ${String(files).padStart(4)} files -> public/${name}/`);
    if (clashes.length) {
      warn(`${clashes.length} name clash(es) in ${name}, first kept: `
         + clashes.slice(0, 5).join(', '));
    }
  }
  const mb = dirSize(publicDir) / 1048576;
  console.log(`  ${total} files staged, public/ now ${mb.toFixed(1)} MB`);
}

function dirSize(dir: string): number {
  let bytes = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    bytes += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return bytes;
}

// ── Steps ─────────────────────────────────────────────────────────────────────

function run(cmd: string, label: string): void {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit' });
  } catch {
    console.error(`\n  ${label} failed. See the output above.`);
    process.exit(1);
  }
}

function buildWeb(stepNo: number, total: number): void {
  step(stepNo, total, 'Export vocabulary to static JSON');
  run('npm run export:vocab', 'Vocabulary export');

  step(stepNo + 1, total, 'Stage data/ assets into public/');
  stageAssets();

  step(stepNo + 2, total, 'Build the web bundle');
  run('npx vite build', 'Vite build');
  console.log(`\n  dist/ is ${(dirSize(path.join(root, 'dist')) / 1048576).toFixed(1)} MB`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const target = (process.argv[2] ?? 'check') as Target;

if (target === 'check') {
  console.log(`\n${bar}\n  Native build prerequisites\n${bar}`);
  console.log('\n  Windows (Tauri)');
  const win = checkTarget('windows');
  console.log('\n  Android (Capacitor)');
  const droid = checkTarget('android');
  console.log(`\n${bar}`);
  console.log(win   ? '  Windows: ready' : '  Windows: install the items above');
  console.log(droid ? '  Android: ready' : '  Android: install the items above');
  console.log(bar);
  process.exit(0);
}

if (target === 'web') {
  buildWeb(1, 3);
  console.log('\n  Done. dist/ can be served by any static host, or opened via the Express server.');
  process.exit(0);
}

if (target === 'windows' || target === 'native') {
  console.log(`\n${bar}\n  WINDOWS (Tauri)\n${bar}`);
  if (!checkTarget('windows')) {
    console.error('\n  Missing prerequisites — see above. Nothing was built.');
    process.exit(1);
  }
  buildWeb(1, 4);
  step(4, 4, 'Package with Tauri');
  if (!fs.existsSync(path.join(root, 'src-tauri'))) {
    // Flag names differ between Tauri 1 and 2 (--dist-dir vs --frontend-dist),
    // so point at the interactive init rather than guessing the version.
    console.error(
      '  src-tauri/ is missing. Initialise it once:\n\n'
      + '    npm i -D @tauri-apps/cli\n'
      + '    npx tauri init\n\n'
      + '  Answer:\n'
      + '    App name ................. VocabApp\n'
      + '    Window title ............. VocabApp\n'
      + '    Web assets (frontend) .... ../dist\n'
      + '    Dev server URL ........... http://localhost:5173\n'
      + '    Frontend dev command ..... npm run dev:fe\n'
      + '    Frontend build command ... (leave blank)\n\n'
      + '  Leave the build command blank: this script already builds the web\n'
      + '  assets before calling tauri, and setting it would do that twice.',
    );
    process.exit(1);
  }
  run('npx tauri build', 'Tauri build');
  console.log('\n  Installer: src-tauri/target/release/bundle/');
}

if (target === 'android' || target === 'native') {
  console.log(`\n${bar}\n  ANDROID (Capacitor)\n${bar}`);
  if (!checkTarget('android')) {
    console.error('\n  Missing prerequisites — see above. Nothing was built.');
    process.exit(1);
  }
  if (target === 'android') buildWeb(1, 4);
  step(4, 4, 'Sync and assemble the APK');
  if (!fs.existsSync(path.join(root, 'android'))) {
    console.error(
      '  android/ is missing. Initialise it once:\n\n'
      + '    npm i -D @capacitor/cli\n'
      + '    npm i @capacitor/core @capacitor/android\n'
      + '    npx cap init VocabApp com.vocabapp.app --web-dir dist\n'
      + '    npx cap add android',
    );
    process.exit(1);
  }
  run('npx cap sync android', 'Capacitor sync');
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  run(`cd android && ${gradlew} assembleDebug`, 'Gradle build');
  console.log('\n  APK: android/app/build/outputs/apk/debug/app-debug.apk');
}
