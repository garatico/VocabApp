"""
scripts/data/lib — the data pipeline's modules.

Nothing here is executable; pipeline.py one level up is the only entry point.

    config.py   languages, models, paths, frequency rank scales
    corpus.py   frequency-corpus reading, spaCy tagging, conjugation
    curated.py  the only reader and writer of the curated JSONL, plus the
                mine / dedupe / backfill / enrich logic
    db.py       schema, safe open/backup, and writes into vocabulary.db
    visuals.py  image and emoji fetching, Picture Quiz coverage report

Dependencies run one way — config is the leaf, and nothing imports pipeline.py:

    config  <-  corpus  <-  curated  <-  pipeline
    config  <-  db      <-------------- /
    config  <-  visuals <-------------/
"""
