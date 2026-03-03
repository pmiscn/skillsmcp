import sqlite3, json, uuid, datetime
from pathlib import Path

def populate_db():
    db_path = 'api/dev.db'
    corpus_path = 'tools/skillshub/corpus.json'
    
    if not Path(corpus_path).exists():
        print(f"Corpus not found at {corpus_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    with open(corpus_path, 'r') as f:
        corpus = json.load(f)
    
    count = 0
    # Items can be a list or a dict
    items = corpus.values() if isinstance(corpus, dict) else corpus
    
    for item in list(items)[:100]: # Populate 100 items for testing
        now = datetime.datetime.now().isoformat()
        skill_id = item.get('id') or str(uuid.uuid4())
        tags = item.get('tags', [])
        tags_str = ','.join(tags) if isinstance(tags, list) else str(tags)
        
        cursor.execute('''
            INSERT OR REPLACE INTO Skill (
                id, name, name_zh, description, description_zh, 
                tags, weight, installs, stars, skill_path, 
                createdAt, updatedAt, security_score
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            skill_id, 
            item.get('name'), 
            item.get('name_zh'), 
            item.get('description'), 
            item.get('description_zh'),
            tags_str,
            item.get('weight', 0),
            item.get('installs', 0),
            item.get('stars', 0),
            item.get('skill_path'),
            now, 
            now,
            item.get('security_score', 0)
        ))
        count += 1
    
    conn.commit()
    conn.close()
    print(f'Populated {count} skills in {db_path}')

if __name__ == '__main__':
    populate_db()
