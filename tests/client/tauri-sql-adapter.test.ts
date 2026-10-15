/**
 * tauri-sql-adapter.test.ts — the desktop app's reads: select_rows (column names once, rows as arrays,
 * as raw JSON bytes) turned back into the row objects src/shared/vocab/* expects, and plugin-sql's
 * select() when the command fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: class {} }));

const { createTauriSqlAdapter, rowsToObjects } = await import('../../src/client/tauri/sql-adapter.js');

function bytes(value: unknown): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify(value)).buffer as ArrayBuffer;
}

describe('Tauri SQL adapter reads', () => {
  beforeEach(() => { invoke.mockReset(); });

  it('turns columns + row arrays back into one object per row', () => {
    expect(rowsToObjects({ columns: ['id', 'word', 'rank'], rows: [[1, 'de', 1], [2, 'la', null]] }))
      .toEqual([{ id: 1, word: 'de', rank: 1 }, { id: 2, word: 'la', rank: null }]);
  });

  it('reads through select_rows with the native ? placeholders', async () => {
    invoke.mockResolvedValue(bytes({ columns: ['word', 'gloss'], rows: [['año', 'year'], ['niño', 'child']] }));
    const db = { select: vi.fn() };
    const adapter = createTauriSqlAdapter(db as never, 'C:/data/vocabulary.db');

    const rows = await adapter.all('SELECT word, gloss FROM words WHERE language = ?', ['spanish']);
    expect(rows).toEqual([{ word: 'año', gloss: 'year' }, { word: 'niño', gloss: 'child' }]);
    expect(await adapter.get('SELECT word, gloss FROM words WHERE language = ?', ['spanish'])).toEqual({ word: 'año', gloss: 'year' });
    expect(invoke).toHaveBeenCalledWith('select_rows', {
      dbPath: 'C:/data/vocabulary.db', sql: 'SELECT word, gloss FROM words WHERE language = ?', params: ['spanish'],
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("falls back to plugin-sql's select (with $1 placeholders) when the command fails", async () => {
    invoke.mockRejectedValue(new Error('command select_rows not found'));
    const db = { select: vi.fn().mockResolvedValue([{ word: 'de' }]) };
    const adapter = createTauriSqlAdapter(db as never, 'C:/data/vocabulary.db');

    expect(await adapter.all('SELECT word FROM words WHERE language = ?', ['spanish'])).toEqual([{ word: 'de' }]);
    expect(db.select).toHaveBeenCalledWith('SELECT word FROM words WHERE language = $1', ['spanish']);
  });
});
