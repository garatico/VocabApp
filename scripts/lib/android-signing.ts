/**
 * android-signing.ts — release signing and version numbers for the Android build (build-native.ts).
 *
 * A debug APK is signed with a key Android Studio makes per machine, so an APK built on another
 * computer would not install over it, and a debug build ships with WebView debugging switched on.
 * A release APK is signed with one key that stays the same: ~/.vocabapp/vocabapp-release.jks, made
 * the first time it is needed, with its passwords in ~/.vocabapp/android-signing.properties (or the
 * file VOCABAPP_SIGNING names). Both live outside the repo. **Losing the key means an installed app
 * can no longer be updated, only uninstalled and reinstalled** — back that folder up.
 *
 * android/ is generated and gitignored, so the Gradle side is written here too: a small file the app
 * module applies, which signs release builds with that key and sets the version from the build.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const SIGNING_DIR = path.join(os.homedir(), '.vocabapp');
export const SIGNING_PROPERTIES = process.env['VOCABAPP_SIGNING'] ?? path.join(SIGNING_DIR, 'android-signing.properties');

const GRADLE_FILE = 'vocabapp-signing.gradle';

const GRADLE = `// Written by scripts/build-native.ts (scripts/lib/android-signing.ts) — edit it there.
// Signs release builds with the key named in the properties file, and takes the version from the build.
def signingProps = file(System.getenv('VOCABAPP_SIGNING') ?: "\${System.getProperty('user.home')}/.vocabapp/android-signing.properties")
android {
    defaultConfig {
        versionCode = Integer.parseInt(System.getenv('VOCABAPP_VERSION_CODE') ?: '1')
        versionName = System.getenv('VOCABAPP_VERSION_NAME') ?: '1.0'
    }
    if (signingProps.exists()) {
        def p = new Properties()
        signingProps.withInputStream { p.load(it) }
        signingConfigs {
            release {
                storeFile = file(p.getProperty('storeFile'))
                storePassword = p.getProperty('storePassword')
                keyAlias = p.getProperty('keyAlias')
                keyPassword = p.getProperty('keyPassword')
            }
        }
        buildTypes { release { signingConfig = signingConfigs.release } }
    }
}
`;

/** Writes the Gradle file and makes the app module apply it (once). */
export function writeGradleSigning(androidDir: string): void {
  const appDir = path.join(androidDir, 'app');
  fs.writeFileSync(path.join(appDir, GRADLE_FILE), GRADLE);
  const buildGradle = path.join(appDir, 'build.gradle');
  const text = fs.readFileSync(buildGradle, 'utf8');
  const line = `apply from: '${GRADLE_FILE}'`;
  if (!text.includes(line)) fs.writeFileSync(buildGradle, `${text.trimEnd()}\n\n${line}\n`);
}

/**
 * The release key, made with the JDK's keytool if there is none yet. Returns false (and says why)
 * when it cannot be made, so the caller can fall back to a debug build.
 */
export function ensureReleaseKey(log: (msg: string) => void): boolean {
  if (fs.existsSync(SIGNING_PROPERTIES)) return true;
  fs.mkdirSync(SIGNING_DIR, { recursive: true });
  const store = path.join(SIGNING_DIR, 'vocabapp-release.jks');
  if (fs.existsSync(store)) {
    log(`${store} exists but ${SIGNING_PROPERTIES} does not — not making a second key. Restore the properties file.`);
    return false;
  }
  const password = crypto.randomBytes(24).toString('base64url');
  const keytool = process.env['JAVA_HOME'] ? path.join(process.env['JAVA_HOME'], 'bin', 'keytool') : 'keytool';
  const r = spawnSync(keytool, [
    '-genkeypair', '-keystore', store, '-storetype', 'PKCS12', '-alias', 'vocabapp',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', password, '-keypass', password, '-dname', 'CN=VocabApp',
  ], { stdio: 'pipe' });
  if (r.status !== 0) {
    log(`keytool failed: ${String(r.stderr || r.error)}`);
    return false;
  }
  const forward = (p: string): string => p.replace(/\\/g, '/');   // Java properties treat \ as an escape
  fs.writeFileSync(SIGNING_PROPERTIES, [
    '# VocabApp Android release key. Keep this file and vocabapp-release.jks together and backed up:',
    '# without them an installed app cannot be updated, only reinstalled.',
    `storeFile=${forward(store)}`, `storePassword=${password}`, 'keyAlias=vocabapp', `keyPassword=${password}`, '',
  ].join('\n'), { mode: 0o600 });
  log(`made a release key: ${store} (back up ${SIGNING_DIR})`);
  return true;
}

/**
 * Each build a higher versionCode, so a new APK always installs over the last: minutes since
 * 2026-01-01, which stays below Android's limit (2,100,000,000) for about 4,000 years.
 */
export function versionCode(now = new Date()): number {
  return Math.floor((now.getTime() - Date.UTC(2026, 0, 1)) / 60_000);
}
