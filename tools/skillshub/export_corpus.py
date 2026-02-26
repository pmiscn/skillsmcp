#!/usr/bin/env python3
"""Export corpus JSON from the local SQLite DB used by Skillshub.

Writes to /tmp/skillshub_corpus.json by default so the service rebuild endpoint
can consume it using the default path.
"""
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))

def main(out_path='/tmp/skillshub_corpus.json'):
    try:
        import build_index
    except Exception as e:
        print(f'Failed to import build_index: {e}')
        raise

    corpus = build_index.load_from_db()
    if not corpus:
        print('No corpus exported (DB empty or not found)')
    else:
        p = Path(out_path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with p.open('w', encoding='utf-8') as f:
            json.dump(corpus, f, ensure_ascii=False, indent=2)
        print(f'Wrote corpus with {len(corpus)} entries to {out_path}')

if __name__ == '__main__':
    main()
