/**
 * paths.ts — central path resolution.
 *
 * The data directory (SQLite DB, curated JSONL, images, emoji, svgs) defaults
 * to <projectRoot>/data but can be overridden with the DATA_DIR env var
 * (absolute, or relative to the process working directory).
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/** Repo root (src/server/lib → three levels up). */
export const projectRoot = path.join(__dirname, '../../..');

/** Root of all vocab data. Override with DATA_DIR. */
export const dataDir = process.env['DATA_DIR']
  ? path.resolve(process.env['DATA_DIR'])
  : path.join(projectRoot, 'data');
