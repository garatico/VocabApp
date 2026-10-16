/**
 * tauri-sql-adapter.test.ts — the desktop app's reads: select_rows (column names once, rows as arrays,
 * as raw JSON bytes) turned back into the row objects src/shared/vocab/* expects, and plugin-sql's
 * select() when the command fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/plugin-sql', () => ({ default: class {} }));

const { createTauriSqlAdapter, rowsToObjects, editSnapshotName } = await import('../../src/client/tauri/sql-adapter.js');

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

describe('Tauri SQL adapter: a copy before the first edit', () => {
  beforeEach(() => { invoke.mockReset(); });

  it('saves one copy per session, before the first write and only then', async () => {
    const calls: string[] = [];
    invoke.mockImplementation(async (cmd: string) => {
      calls.push(cmd);
      return cmd === 'select_rows' ? bytes({ columns: ['n'], rows: [[1]] }) : cmd === 'snapshot_db' ? 'C:/data/copy.db' : undefined;
    });
    const db = { select: vi.fn(), execute: vi.fn().mockResolvedValue({ rowsAffected: 1, lastInsertId: 1 }) };
    const adapter = createTauriSqlAdapter(db as never, 'C:/data/vocabulary.db');

    await adapter.all('SELECT 1 AS n');
    expect(calls).toEqual(['select_rows']);   // reading never copies

    await adapter.transaction(async tx => { await tx.run('UPDATE words SET translation = ? WHERE id = ?', ['x', 1]); });
    await adapter.run('UPDATE words SET notes = ? WHERE id = ?', ['y', 1]);
    await adapter.transaction(async tx => { await tx.run('DELETE FROM word_tags WHERE word_id = ?', [1]); });

    expect(calls).toEqual(['select_rows', 'snapshot_db', 'run_sql_transaction', 'run_sql_transaction']);
    const args = invoke.mock.calls.find(c => c[0] === 'snapshot_db')![1] as { name: string; prefix: string; keep: number };
    expect(args.name.startsWith(args.prefix)).toBe(true);
    expect(args.name).toMatch(/^vocabulary\.before-edits-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.db$/);
    expect(args.keep).toBe(3);
  });

  it('still saves the edit when the copy fails', async () => {
    invoke.mockImplementation(async (cmd: string) => { if (cmd === 'snapshot_db') throw new Error('disk full'); });
    const adapter = createTauriSqlAdapter({ select: vi.fn() } as never, 'C:/data/vocabulary.db');
    await adapter.transaction(async tx => { await tx.run('UPDATE words SET notes = ?', ['z']); });
    expect(invoke.mock.calls.map(c => c[0])).toEqual(['snapshot_db', 'run_sql_transaction']);
  });

  it('names copies so they sort oldest first', () => {
    expect(editSnapshotName(new Date('2026-10-16T09:30:05.123Z'))).toBe('vocabulary.before-edits-2026-10-16T09-30-05.db');
  });
});
