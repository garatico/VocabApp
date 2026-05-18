/**
 * SVG Loader - Filesystem-based SVG detection
 *
 * Looks for SVG files in data/svgs/[language]/[word].svg
 * Returns URLs for words that have corresponding SVG files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.join(__dirname, '../../../..');

/**
 * Check if an SVG file exists for a given word
 * @param {string} language - Language code (spanish, portuguese, etc.)
 * @param {string} word - Word key (e.g., "manzana")
 * @returns {boolean} True if SVG exists
 */
export function hasSvg(language, word) {
  if (!language || !word) return false;

  const svgPath = path.join(appRoot, 'data', 'svgs', language.toLowerCase(), `${word}.svg`);

  try {
    return fs.existsSync(svgPath);
  } catch {
    return false;
  }
}

/**
 * Get the URL path for an SVG file
 * @param {string} language - Language code
 * @param {string} word - Word key
 * @returns {string|null} URL path or null if doesn't exist
 */
export function getSvgUrl(language, word) {
  if (!hasSvg(language, word)) return null;
  return `/svgs/${language.toLowerCase()}/${word}.svg`;
}

/**
 * Ensure SVG directories exist
 */
export function ensureSvgDirs() {
  const svgsRoot = path.join(appRoot, 'data', 'svgs');
  const languages = ['spanish', 'portuguese', 'italian', 'french'];

  try {
    if (!fs.existsSync(svgsRoot)) {
      fs.mkdirSync(svgsRoot, { recursive: true });
      console.log(`Created SVG directory: ${svgsRoot}`);
    }

    languages.forEach(lang => {
      const langDir = path.join(svgsRoot, lang);
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
        console.log(`Created SVG directory: ${langDir}`);
      }
    });

    return true;
  } catch (err) {
    console.error('Error creating SVG directories:', err.message);
    return false;
  }
}

/**
 * Get count of SVGs per language
 */
export function getSvgStats() {
  const stats = {};
  const languages = ['spanish', 'portuguese', 'italian', 'french'];

  languages.forEach(lang => {
    const langDir = path.join(appRoot, 'data', 'svgs', lang);
    try {
      const files = fs.existsSync(langDir)
        ? fs.readdirSync(langDir).filter(f => f.endsWith('.svg')).length
        : 0;
      stats[lang] = files;
    } catch {
      stats[lang] = 0;
    }
  });

  return stats;
}

export default { hasSvg, getSvgUrl, ensureSvgDirs, getSvgStats };
