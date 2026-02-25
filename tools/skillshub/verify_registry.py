import json
import hashlib
from pathlib import Path

REGISTRY_PATH = Path.home() / '.sisyphus' / 'skills' / 'registry.json'


def load_registry(path=REGISTRY_PATH):
    if not path.exists():
        raise FileNotFoundError(path)
    return json.loads(path.read_text(encoding='utf-8'))


def verify_entry(entry: dict) -> bool:
    """Verify a registry entry dict contains url and sha256 and that the file exists and matches."""
    url = entry.get('url') or entry.get('source_url')
    sha256 = entry.get('sha256')
    local_path = entry.get('local_path')
    if not local_path or not sha256:
        return False
    p = Path(local_path)
    if not p.exists():
        return False
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest() == sha256


def verify_all():
    reg = load_registry()
    results = {}
    for k, v in reg.items():
        try:
            ok = verify_entry(v)
        except Exception:
            ok = False
        results[k] = bool(ok)
    return results


if __name__ == '__main__':
    import sys
    try:
        res = verify_all()
    except Exception as e:
        print('Error verifying registry:', e)
        sys.exit(2)
    for k, ok in res.items():
        print(k, 'OK' if ok else 'MISSING/FAILED')
    sys.exit(0)
