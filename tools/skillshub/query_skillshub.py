"""Simple CLI to query local skillshub service and print ranked candidates."""
import sys
import requests

def main():
    if len(sys.argv) < 2:
        print("Usage: python query_skillshub.py 'your query'")
        sys.exit(1)
    q = sys.argv[1]
    from urllib.parse import quote_plus
    url = f"http://127.0.0.1:8001/search?q={quote_plus(q)}&k=5"
    resp = requests.get(url, timeout=10)
    resp.raise_for_status()
    payload = resp.json()
    results = payload.get('results', []) if isinstance(payload, dict) else payload
    for i, r in enumerate(results, 1):
        print(f"{i}. {r.get('name')} (id={r.get('id')}) score={r.get('score'):.4f} snippet={r.get('snippet')}")

if __name__ == '__main__':
    main()
