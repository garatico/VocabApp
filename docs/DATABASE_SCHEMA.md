# VocabApp SQLite Schema Design

## Overview
- **Single SQLite database** (`vocabulary.db`)
- **Multi-language support** via `language` column
- **Normalized relations** (foreign keys to word IDs)
- **Optimized for queries** (indexes on common filters)

## Schema

### Core Tables

```sql
-- Main vocabulary table
CREATE TABLE words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  language TEXT NOT NULL,           -- 'spanish', 'portuguese', 'italian', 'french'
  word TEXT NOT NULL,
  display TEXT,                     -- "company / business"
  pos TEXT,                         -- 'noun', 'verb', 'adj', 'adv', 'prep', etc.
  difficulty INTEGER,               -- 1-5 or NULL
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(language, word),
  CHECK(language IN ('spanish', 'portuguese', 'italian', 'french'))
);

-- Linguistic properties
CREATE TABLE word_linguistic (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL UNIQUE,
  infinitive TEXT,                  -- For conjugated forms
  reflexive BOOLEAN DEFAULT FALSE,
  gender TEXT,                      -- 'masculine', 'feminine', 'neutral'
  plural TEXT,                      -- Plural form of the word
  register TEXT,                    -- 'formal', 'informal', 'colloquial', 'neutral'
  ipa TEXT,                         -- IPA pronunciation
  syllables TEXT,                   -- JSON array or comma-separated
  conjugations TEXT,                -- JSON object or NULL
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

-- Frequency & ranking
CREATE TABLE word_frequency (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL UNIQUE,
  band TEXT,                        -- 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'
  rank INTEGER,                     -- Position in frequency list
  corpus_frequency INTEGER,         -- Occurrences in corpus (if available)
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

-- Semantic domains
CREATE TABLE word_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  domain TEXT NOT NULL,             -- 'Business', 'Medical', 'Academic', etc.
  UNIQUE(word_id, domain),
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

-- Glosses / definitions
CREATE TABLE word_glosses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  gloss TEXT NOT NULL,              -- "company", "business"
  position INTEGER DEFAULT 0,       -- Order in list
  UNIQUE(word_id, position),
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

-- Example sentences
CREATE TABLE word_examples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  example TEXT NOT NULL,            -- "Este empresa es importante."
  position INTEGER DEFAULT 0,       -- Order in list
  UNIQUE(word_id, position),
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

-- Tags / categories
CREATE TABLE word_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  tag TEXT NOT NULL,                -- "common", "slang", "archaic", etc.
  UNIQUE(word_id, tag),
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE
);

-- Word relations (normalized via word_id foreign keys)
CREATE TABLE word_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,         -- The main word
  related_word_id INTEGER NOT NULL, -- The related word (same language)
  relation_type TEXT NOT NULL,      -- 'synonym', 'antonym', 'related', 'confused_with'
  UNIQUE(word_id, related_word_id, relation_type),
  FOREIGN KEY(word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY(related_word_id) REFERENCES words(id) ON DELETE CASCADE,
  CHECK(word_id != related_word_id),
  CHECK(relation_type IN ('synonym', 'antonym', 'related', 'confused_with'))
);
```

## Indexes (Performance)

```sql
-- Fast lookups by language
CREATE INDEX idx_language ON words(language);

-- Common filters
CREATE INDEX idx_language_pos ON words(language, pos);
CREATE INDEX idx_language_difficulty ON words(language, difficulty);
CREATE INDEX idx_language_word ON words(language, word);

-- Domain search
CREATE INDEX idx_domain ON word_domains(domain);
CREATE INDEX idx_language_domain ON word_domains(word_id, domain);

-- Frequency band search
CREATE INDEX idx_frequency_band ON word_frequency(band);
CREATE INDEX idx_frequency_rank ON word_frequency(rank);

-- Full-text search (optional, for future)
-- CREATE VIRTUAL TABLE word_search USING fts5(word, display, language);
```

## Example Queries

```sql
-- Get a single word with all data
SELECT 
  w.id, w.word, w.display, w.pos, w.difficulty,
  wl.infinitive, wl.reflexive, wl.gender, wl.ipa,
  wf.band, wf.rank,
  GROUP_CONCAT(DISTINCT wd.domain) as domains,
  GROUP_CONCAT(DISTINCT wg.gloss) as glosses,
  GROUP_CONCAT(DISTINCT we.example) as examples,
  GROUP_CONCAT(DISTINCT wt.tag) as tags
FROM words w
LEFT JOIN word_linguistic wl ON w.id = wl.word_id
LEFT JOIN word_frequency wf ON w.id = wf.word_id
LEFT JOIN word_domains wd ON w.id = wd.word_id
LEFT JOIN word_glosses wg ON w.id = wg.word_id
LEFT JOIN word_examples we ON w.id = we.word_id
LEFT JOIN word_tags wt ON w.id = wt.word_id
WHERE w.language = 'spanish' AND w.word = 'empresa'
GROUP BY w.id;

-- Search by frequency band
SELECT word, display FROM words 
WHERE language = 'spanish' AND id IN (
  SELECT word_id FROM word_frequency WHERE band = 'A1'
)
ORDER BY rank
LIMIT 50;

-- Get synonyms
SELECT w2.word, w2.display
FROM word_relations wr
JOIN words w1 ON wr.word_id = w1.id
JOIN words w2 ON wr.related_word_id = w2.id
WHERE w1.language = 'spanish' AND w1.word = 'empresa' 
AND wr.relation_type = 'synonym';

-- Search by domain
SELECT word, display FROM words
WHERE language = 'spanish' AND id IN (
  SELECT word_id FROM word_domains WHERE domain = 'Business'
)
LIMIT 50;
```

## Data Types Notes

- **UNIQUE constraints**: Prevent duplicates (e.g., same synonym twice)
- **CHECK constraints**: Enforce valid values (e.g., valid relation types)
- **Foreign keys**: Link relations via word IDs (normalized)
- **TEXT for arrays**: Store as JSON or comma-separated (depends on query needs)
- **AUTOINCREMENT**: For user-facing IDs (though not strictly needed in SQLite)
- **Timestamps**: Track created/updated for audit trail

## Migration Path

1. **CSV → SQLite**: Data pipeline exports directly to DB
2. **JSON → SQLite**: One-time conversion of existing vocabulary
3. **API reads**: Query SQLite instead of loading JSON files
4. **Admin panel**: Still works with current API layer (no changes needed)

## Advantages

✅ Normalized relations (no data duplication)  
✅ Single database file (easy to backup, version control)  
✅ Language isolation (queries scoped by language column)  
✅ Efficient searches (indexes on common filters)  
✅ Scalable to 100K+ words  
✅ Foreign key integrity  
✅ ACID compliance  
