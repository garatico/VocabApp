# DEPRECATED — safe to delete this file.
#
# verb_rules.py was the Python port of the JS conjugation engine, used by
# sync_db.py to pre-compute conjugations at sync time.
#
# As of the refactor, verb-rules.js is the single conjugation engine.
# Conjugations are now computed at server load time (cached per language),
# so there is nothing for Python to compute or store.
#
# The canonical rule implementations live in:
#   backend/src/server/lib/verb-rules.js
#
# The test suite remains in:
#   backend/tests/verb-rules.test.js
