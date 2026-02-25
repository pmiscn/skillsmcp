import json
import sys
import faiss  # type: ignore[import-not-found]
import numpy as np  # type: ignore[import-not-found]
import os
import sqlite3
from pathlib import Path
import pickle
import socket

try:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
    HAS_SBERT = True
except ImportError:
    SentenceTransformer = None
    HAS_SBERT = False

FIELD_NAMES = ("name", "description", "excerpt")
DEFAULT_FIELD_WEIGHTS = {
    "name": 0.6,
    "description": 0.3,
    "excerpt": 0.1,
}
TFIDF_MAX_FEATURES = 4096
TFIDF_NGRAM_RANGE = (1, 2)
MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'

def huggingface_reachable():
    return True

def load_corpus(corpus_path):
    if not os.path.exists(corpus_path):
        return []
    with open(corpus_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def load_from_db():
    db_path = Path("api/prisma/dev.db")
    if not db_path.exists():
        # Fallback to local if in same dir or other places
        db_path = Path("../../api/prisma/dev.db")
    
    if not db_path.exists():
        print(f"Database not found at {db_path}")
        return []

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM Skill")
    rows = cursor.fetchall()
    conn.close()
    
    corpus = []
    for row in rows:
        corpus.append({
            'id': row['id'],
            'name': row['name'],
            'name_zh': row['name_zh'],
            'description': row['description'],
            'description_zh': row['description_zh'],
            'tags': row['tags'].split(',') if row['tags'] else [],
            'path': row['skill_path'],
            'excerpt': row['description_zh'] if row['description_zh'] else row['description'],
            'owner': row['owner'],
            'contact': row['contact'],
            'source': row['source'],
            'weight': row['weight'],
            'installs': row['installs'],
            'stars': row['stars'],
            'security_score': row['security_score'],
            'security_data': row['security_data'],
        })
    return corpus

def _resolve_index_path(index_path: str):
    if os.path.exists('/data/index') and os.path.isdir('/data/index'):
        os.makedirs('/data/index', exist_ok=True)
        return os.path.join('/data/index', os.path.basename(index_path))
    return index_path


def _coalesce_text(value) -> str:
    if value is None:
        return ''
    if isinstance(value, str):
        return value.strip()
    return str(value)


def _normalize_rows(embeddings: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return embeddings / norms


def _normalize_field_weights(weights: dict) -> dict:
    normalized = {}
    total = 0.0
    for field in FIELD_NAMES:
        value = float(weights.get(field, 0.0))
        if value < 0:
            value = 0.0
        normalized[field] = value
        total += value
    if total <= 0:
        equal = 1.0 / len(FIELD_NAMES)
        return {field: equal for field in FIELD_NAMES}
    return {field: value / total for field, value in normalized.items()}


def _combine_field_embeddings(field_embeddings: dict, field_texts: dict, field_weights: dict) -> np.ndarray:
    total = None
    weight_sums = None
    for field in FIELD_NAMES:
        emb = field_embeddings.get(field)
        if emb is None:
            continue
        weight = field_weights.get(field, 0.0)
        if weight <= 0:
            continue
        mask = np.array([1.0 if (text or '').strip() else 0.0 for text in field_texts[field]], dtype=np.float32)
        mask = mask.reshape(-1, 1)
        weighted = emb * (weight * mask)
        if total is None:
            total = weighted.copy()
            weight_sums = weight * mask
        else:
            total += weighted
            weight_sums += weight * mask
    if total is None or weight_sums is None:
        return None
    weight_sums[weight_sums == 0] = 1.0
    combined = total / weight_sums
    return _normalize_rows(combined.astype('float32'))


def _build_related_path(index_path: str, suffix: str) -> str:
    base = os.path.splitext(index_path)[0]
    return f"{base}_{suffix}"


def build_index(
    corpus_path=None,
    index_path='skills.idx',
    meta_path='skills_meta.json',
    tfidf_index_path='skills_tfidf.idx',
):
    if corpus_path and corpus_path != 'db' and os.path.exists(corpus_path):
        corpus_raw = load_corpus(corpus_path)
        if isinstance(corpus_raw, dict):
            corpus = list(corpus_raw.values())
        else:
            corpus = corpus_raw
    else:
        corpus = load_from_db()
        
    if not corpus:
        print("No skills found to index.")
        return

    texts = []
    metas = []
    field_texts = {field: [] for field in FIELD_NAMES}
    field_weights = _normalize_field_weights(DEFAULT_FIELD_WEIGHTS)
    for item in corpus:
        name = ' '.join(filter(None, [
            _coalesce_text(item.get('name')),
            _coalesce_text(item.get('name_zh'))
        ]))
        description = ' '.join(filter(None, [
            _coalesce_text(item.get('description')),
            _coalesce_text(item.get('description_zh'))
        ]))
        excerpt = _coalesce_text(item.get('excerpt'))
        text = ' '.join(filter(None, [name, description, excerpt]))
        texts.append(text)
        field_texts['name'].append(name)
        field_texts['description'].append(description)
        field_texts['excerpt'].append(excerpt)
        tags = item.get('tags', [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',') if t.strip()]
        metas.append({
            'id': item.get('id'),
            'path': item.get('path') or item.get('skill_path'),
            'name': item.get('name'),
            'name_zh': item.get('name_zh'),
            'description': item.get('description'),
            'description_zh': item.get('description_zh'),
            'excerpt': item.get('excerpt'),
            'tags': tags,
            'owner': item.get('owner'),
            'contact': item.get('contact'),
            'source': item.get('source'),
            'weight': item.get('weight'),
            'installs': item.get('installs'),
            'stars': item.get('stars'),
            'security_score': item.get('security_score'),
            'security_data': item.get('security_data'),
            'requires_internet': item.get('requires_internet'),
        })

    # Build TF-IDF index (always)
    from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore[import-not-found]
    vectorizer = TfidfVectorizer(max_features=TFIDF_MAX_FEATURES, ngram_range=TFIDF_NGRAM_RANGE)
    X = vectorizer.fit_transform(texts)
    field_mats = {field: vectorizer.transform(field_texts[field]) for field in FIELD_NAMES}
    tfidf_weighted = None
    for field, mat in field_mats.items():
        weight = field_weights.get(field, 0.0)
        if tfidf_weighted is None:
            tfidf_weighted = mat.multiply(weight)
        else:
            tfidf_weighted = tfidf_weighted + mat.multiply(weight)
    if tfidf_weighted is None:
        tfidf_weighted = X
    tfidf_embeddings = _normalize_rows(tfidf_weighted.toarray().astype('float32'))
    tfidf_fields = {
        field: _normalize_rows(mat.toarray().astype('float32'))
        for field, mat in field_mats.items()
    }

    index_out = _resolve_index_path(index_path)
    tfidf_index_out = _resolve_index_path(tfidf_index_path)
    meta_out = _resolve_index_path(meta_path)
    vectorizer_out = _resolve_index_path(_build_related_path(index_out, 'tfidf_vectorizer.pkl'))
    tfidf_fields_out = _resolve_index_path(_build_related_path(index_out, 'tfidf_fields.npz'))
    sbert_fields_out = _resolve_index_path(_build_related_path(index_out, 'sbert_fields.npz'))

    # save vectorizer and TF-IDF field embeddings for query-time
    with open(vectorizer_out, 'wb') as f:
        pickle.dump(vectorizer, f)
    np.savez(tfidf_fields_out, **{field: tfidf_fields[field] for field in FIELD_NAMES})

    tfidf_index = faiss.IndexFlatIP(tfidf_embeddings.shape[1])
    tfidf_index.add(tfidf_embeddings.astype('float32'))

    # Build SBERT index if available
    sbert_embeddings = None
    sbert_fields = None
    disable_sbert = os.environ.get('SKILLSHUB_DISABLE_SBERT') == '1'
    if not disable_sbert and HAS_SBERT and SentenceTransformer is not None and huggingface_reachable():
        try:
            use_gpu = os.environ.get('SKILLSHUB_USE_GPU') == '1'
            device = 'cpu'
            if use_gpu:
                try:
                    import torch  # type: ignore[import-not-found]
                    if torch.cuda.is_available():
                        device = 'cuda'
                except Exception:
                    device = 'cpu'
            model = SentenceTransformer(MODEL_NAME, device=device)
            sbert_fields = {
                'name': model.encode(field_texts['name'], convert_to_numpy=True, normalize_embeddings=True),
                'description': model.encode(field_texts['description'], convert_to_numpy=True, normalize_embeddings=True),
                'excerpt': model.encode(field_texts['excerpt'], convert_to_numpy=True, normalize_embeddings=True),
            }
            sbert_embeddings = _combine_field_embeddings(sbert_fields, field_texts, field_weights)
        except Exception:
            sbert_embeddings = None

    if sbert_embeddings is not None:
        sbert_index = faiss.IndexFlatIP(sbert_embeddings.shape[1])
        sbert_index.add(sbert_embeddings.astype('float32'))
        faiss.write_index(sbert_index, index_out)
        faiss.write_index(tfidf_index, tfidf_index_out)
        embedding_type = 'hybrid'
        available_engines = ['tfidf', 'sbert', 'hybrid']
        sbert_index_path = index_out
        if sbert_fields:
            np.savez(sbert_fields_out, **{field: sbert_fields[field].astype('float32') for field in FIELD_NAMES})
    else:
        # Fallback: write TF-IDF index to primary index_path
        faiss.write_index(tfidf_index, index_out)
        embedding_type = 'tfidf'
        available_engines = ['tfidf']
        sbert_index_path = None
        tfidf_index_out = index_out
    with open(meta_out, 'w', encoding='utf-8') as f:
        json.dump(metas, f, ensure_ascii=False, indent=2)

    # write index metadata
    index_meta_out = (
        os.path.join('/data/index', 'skills_index_meta.json')
        if os.path.exists('/data/index')
        else 'skills_index_meta.json'
    )
    with open(index_meta_out, 'w', encoding='utf-8') as f:
        json.dump(
            {
                'embedding_type': embedding_type,
                'index_path': index_out,
                'sbert_index_path': sbert_index_path,
                'tfidf_index_path': tfidf_index_out,
                'meta_path': meta_out,
                'available_engines': available_engines,
                'hybrid_nlp_weight_default': 0.7,
                'field_weights': field_weights,
                'field_names': list(FIELD_NAMES),
                'tfidf_vectorizer_path': vectorizer_out,
                'tfidf_fields_path': tfidf_fields_out,
                'sbert_fields_path': sbert_fields_out if sbert_embeddings is not None else None,
            },
            f,
        )

    print(f'Wrote index to {index_out} and metadata to {meta_out}')


def update_index(
    index_path='skills.idx',
    meta_path='skills_meta.json',
    tfidf_index_path='skills_tfidf.idx',
    model=None,
):
    meta_out = _resolve_index_path(meta_path)
    if not os.path.exists(meta_out):
        return build_index(index_path=index_path, meta_path=meta_path, tfidf_index_path=tfidf_index_path)

    with open(meta_out, 'r', encoding='utf-8') as f:
        existing_metas = json.load(f)
    
    indexed_ids = {m['id'] for m in existing_metas}
    
    all_skills = load_from_db()
    new_skills = [s for s in all_skills if s['id'] not in indexed_ids]
    
    if not new_skills:
        return

    index_out = _resolve_index_path(index_path)
    tfidf_index_out = _resolve_index_path(tfidf_index_path)
    vectorizer_out = _resolve_index_path(_build_related_path(index_out, 'tfidf_vectorizer.pkl'))

    if not os.path.exists(index_out) or not os.path.exists(vectorizer_out):
        return build_index(index_path=index_path, meta_path=meta_path, tfidf_index_path=tfidf_index_path)

    with open(vectorizer_out, 'rb') as f:
        vectorizer = pickle.load(f)
    
    tfidf_index = faiss.read_index(tfidf_index_out if os.path.exists(tfidf_index_out) else index_out)
    
    new_texts = []
    new_field_texts = {field: [] for field in FIELD_NAMES}
    field_weights = _normalize_field_weights(DEFAULT_FIELD_WEIGHTS)
    
    for item in new_skills:
        name = _coalesce_text(item.get('name'))
        description = _coalesce_text(item.get('description'))
        excerpt = _coalesce_text(item.get('excerpt'))
        text = ' '.join(filter(None, [name, description, excerpt]))
        new_texts.append(text)
        new_field_texts['name'].append(name)
        new_field_texts['description'].append(description)
        new_field_texts['excerpt'].append(excerpt)
        
        tags = item.get('tags', [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(',') if t.strip()]
            
        existing_metas.append({
            'id': item.get('id'),
            'path': item.get('path') or item.get('skill_path'),
            'name': item.get('name'),
            'description': item.get('description'),
            'excerpt': item.get('excerpt'),
            'tags': tags,
            'owner': item.get('owner'),
            'contact': item.get('contact'),
            'source': item.get('source'),
            'weight': item.get('weight'),
            'installs': item.get('installs'),
            'stars': item.get('stars'),
            'security_score': item.get('security_score'),
            'security_data': item.get('security_data'),
            'requires_internet': item.get('requires_internet'),
        })

    new_tfidf_mat = vectorizer.transform(new_texts)
    new_field_mats = {field: vectorizer.transform(new_field_texts[field]) for field in FIELD_NAMES}
    
    tfidf_weighted = None
    for field, mat in new_field_mats.items():
        weight = field_weights.get(field, 0.0)
        if tfidf_weighted is None:
            tfidf_weighted = mat.multiply(weight)
        else:
            tfidf_weighted = tfidf_weighted + mat.multiply(weight)
    
    if tfidf_weighted is None:
        tfidf_weighted = new_tfidf_mat
        
    new_tfidf_embeddings = _normalize_rows(tfidf_weighted.toarray().astype('float32'))
    tfidf_index.add(new_tfidf_embeddings)
    faiss.write_index(tfidf_index, tfidf_index_out if os.path.exists(tfidf_index_out) else index_out)

    tfidf_fields_out = _resolve_index_path(_build_related_path(index_out, 'tfidf_fields.npz'))
    if os.path.exists(tfidf_fields_out):
        try:
            old_tfidf_fields = dict(np.load(tfidf_fields_out))
            updated_tfidf_fields = {}
            for field in FIELD_NAMES:
                new_f_mat = _normalize_rows(new_field_mats[field].toarray().astype('float32'))
                if field in old_tfidf_fields:
                    updated_tfidf_fields[field] = np.vstack([old_tfidf_fields[field], new_f_mat])
                else:
                    updated_tfidf_fields[field] = new_f_mat
            np.savez(tfidf_fields_out, **updated_tfidf_fields)
        except Exception as e:
            print(f"Failed to update TF-IDF fields: {e}")

    if os.path.exists(index_out) and HAS_SBERT and (model is not None or SentenceTransformer is not None) and huggingface_reachable():
        try:
            sbert_index = faiss.read_index(index_out)
            if model is None:
                use_gpu = os.environ.get('SKILLSHUB_USE_GPU') == '1'
                device = 'cpu'
                if use_gpu:
                    try:
                        import torch  # type: ignore[import-not-found]
                        if torch.cuda.is_available():
                            device = 'cuda'
                    except Exception:
                        device = 'cpu'
                model = SentenceTransformer(MODEL_NAME, device=device)
            
            new_sbert_fields = {
                'name': model.encode(new_field_texts['name'], convert_to_numpy=True, normalize_embeddings=True),
                'description': model.encode(new_field_texts['description'], convert_to_numpy=True, normalize_embeddings=True),
                'excerpt': model.encode(new_field_texts['excerpt'], convert_to_numpy=True, normalize_embeddings=True),
            }
            
            sbert_fields_out = _resolve_index_path(_build_related_path(index_out, 'sbert_fields.npz'))
            if os.path.exists(sbert_fields_out):
                try:
                    old_sbert_fields = dict(np.load(sbert_fields_out))
                    updated_sbert_fields = {}
                    for field in FIELD_NAMES:
                        if field in old_sbert_fields:
                            updated_sbert_fields[field] = np.vstack([old_sbert_fields[field], new_sbert_fields[field]])
                        else:
                            updated_sbert_fields[field] = new_sbert_fields[field]
                    np.savez(sbert_fields_out, **updated_sbert_fields)
                except Exception as e:
                    print(f"Failed to update SBERT fields NPZ: {e}")

            new_sbert_embeddings = _combine_field_embeddings(new_sbert_fields, new_field_texts, field_weights)
            if new_sbert_embeddings is not None:
                sbert_index.add(new_sbert_embeddings.astype('float32'))
                faiss.write_index(sbert_index, index_out)
        except Exception as e:
            print(f"Failed to update SBERT index: {e}")

    with open(meta_out, 'w', encoding='utf-8') as f:
        json.dump(existing_metas, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python build_index.py /tmp/skillshub_corpus.json')
        sys.exit(1)
    build_index(sys.argv[1])
