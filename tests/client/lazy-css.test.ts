/**
 * lazy-css.test.ts — src/client/styles-lazy/*.css are loaded with the mode that renders their classes,
 * not with the first paint. That is only safe while nothing on the first-load path uses those classes,
 * so this fails if a lazy rule could only match something index.html or a statically-imported module
 * (the first-load graph from app.ts) creates, and if a lazy file is no longer imported by anything.
 *
 * To add styles for a lazy mode: put them in its styles-lazy file, or a public/styles/app sheet if they
 * style something the first paint shows. If this fails for a rule, it belongs in the eager sheet.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const LAZY_DIR = 'src/client/styles-lazy';
const tokensOfSelector = (sel: string): string[] => [...sel.matchAll(/[.#]([a-zA-Z_][\w-]*)/g)].map(m => m[1]);

function rulesOf(file: string): { selector: string; inKeyframes: boolean }[] {
  const out: { selector: string; inKeyframes: boolean }[] = [];
  postcss.parse(fs.readFileSync(file, 'utf8')).walkRules(r => {
    out.push({ selector: r.selector, inKeyframes: r.parent?.type === 'atrule' && /keyframes/.test((r.parent as postcss.AtRule).name) });
  });
  return out;
}

/** The modules the first paint loads: app.ts and everything it imports statically (dynamic import() is lazy). */
function eagerModules(): string[] {
  const seen = new Set<string>();
  const queue = ['src/client/app.ts'];
  const staticImport = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.pop() as string;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(staticImport)) {
      if (/^import\s+type\b/.test(m[0].trim())) continue;
      const target = path.join(path.dirname(file), m[1]).split(path.sep).join('/').replace(/\.js$/, '.ts');
      if (target.endsWith('.ts')) queue.push(target);
    }
  }
  return [...seen];
}

const eagerText = [fs.readFileSync('index.html', 'utf8'), ...eagerModules().map(f => fs.readFileSync(f, 'utf8'))].join('\n');
const usedEagerly = (token: string): boolean => new RegExp(`(?<![A-Za-z0-9_-])${token}(?![A-Za-z0-9_-])`).test(eagerText);

const lazyFiles = fs.readdirSync(LAZY_DIR).filter(f => f.endsWith('.css') && !f.endsWith('-bundle.css'));

function allTsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? allTsFiles(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []);
}

describe('lazy stylesheets', () => {
  it('finds the first-load graph and the lazy files', () => {
    expect(eagerModules().length).toBeGreaterThan(50);
    expect(eagerModules()).not.toContain('src/client/modes/my-lists-mode.ts');   // loaded on demand, never statically
    expect(lazyFiles.length).toBeGreaterThan(5);
  });

  for (const file of lazyFiles) {
    it(`${file}: no rule is about a class the first-load code or index.html uses`, () => {
      const offenders = rulesOf(path.join(LAZY_DIR, file))
        .filter(r => !r.inKeyframes)
        .filter(r => !r.selector.split(',').every(part => tokensOfSelector(part).some(t => !usedEagerly(t))))
        .map(r => r.selector.replace(/\s+/g, ' ').slice(0, 100));
      expect(offenders, 'move these back to a public/styles/app sheet').toEqual([]);
    });

    it(`${file}: is imported by at least one module (directly or through a bundle)`, () => {
      const name = file.replace(/\.css$/, '');
      const bundles = fs.readdirSync(LAZY_DIR).filter(f => f.endsWith('-bundle.css'))
        .filter(b => fs.readFileSync(path.join(LAZY_DIR, b), 'utf8').includes(`./${file}`));
      const needles = [`styles-lazy/${name}.css`, ...bundles.map(b => `styles-lazy/${b}`)];
      const importers = allTsFiles('src/client').filter(f => {
        const src = fs.readFileSync(f, 'utf8');
        return needles.some(n => src.includes(`import '`) && src.includes(n));
      });
      expect(importers.length).toBeGreaterThan(0);
    });
  }
});
