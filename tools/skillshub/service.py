import json
import os
from fastapi import FastAPI, HTTPException, Query, Header  # type: ignore[import-not-found]
from pydantic import BaseModel  # type: ignore[import-not-found]
try:
    from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]
    HAS_SBERT = True
except Exception:
    SentenceTransformer = None
    HAS_SBERT = False
import faiss  # type: ignore[import-not-found]
import numpy as np  # type: ignore[import-not-found]
from typing import Optional, Dict, Any, Iterable, List

app = FastAPI(title='SKILLS RAG Search Service')

if not os.environ.get('SKILLSHUB_API_KEY'):
    print('[WARNING] SKILLSHUB_API_KEY not found in environment. /index/rebuild will be unavailable.')

MODEL_NAME = 'paraphrase-multilingual-MiniLM-L12-v2'
INDEX_META_PATH = 'skills_index_meta.json'
DEFAULT_ENGINE = 'auto'
DEFAULT_HYBRID_NLP_WEIGHT = 0.7
DEFAULT_FIELD_WEIGHTS = {
    'name': 0.6,
    'description': 0.3,
    'excerpt': 0.1,
}
DEFAULT_HYBRID_ALPHA_SHORT_QUERY = 0.55
DEFAULT_HYBRID_ALPHA_LONG_QUERY = 0.75
EXACT_MATCH_BONUS = 0.15


class SearchResult(BaseModel):
    id: str
    name: str
    description: str
    score: float


def _resolve_index_path(index_path: Optional[str]):
    if not index_path:
        return None
    if os.path.isabs(index_path):
        return index_path
    if os.path.exists('/data/index') and os.path.isdir('/data/index'):
        candidate = os.path.join('/data/index', os.path.basename(index_path))
        if os.path.exists(candidate):
            return candidate
    return index_path


def load_index_meta(meta_path: str = INDEX_META_PATH) -> Dict[str, Any]:
    candidate = _resolve_index_path(meta_path)
    if not candidate:
        return {}
    try:
        with open(candidate, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return {}


def load_index(index_path='skills.idx', meta_path='skills_meta.json'):
    # Safe load: return (None, None, []) if files missing or unreadable
    index_meta = load_index_meta()
    embedding_type = index_meta.get('embedding_type') if isinstance(index_meta, dict) else None
    sbert_index_path = None
    tfidf_index_path = None

    if isinstance(index_meta, dict) and index_meta:
        available = set(index_meta.get('available_engines') or [])
        embedding_type = index_meta.get('embedding_type')
        if 'sbert' in available or embedding_type in {'sbert', 'hybrid'}:
            sbert_index_path = index_meta.get('sbert_index_path') or index_meta.get('index_path')
        if 'tfidf' in available or embedding_type in {'tfidf', 'hybrid'}:
            tfidf_index_path = index_meta.get('tfidf_index_path') or index_meta.get('index_path')
        meta_path = index_meta.get('meta_path') or meta_path
    else:
        sbert_index_path = index_path
        tfidf_index_path = index_path

    sbert_index = None
    tfidf_index = None

    try:
        sbert_path = _resolve_index_path(sbert_index_path)
        if sbert_path and os.path.exists(sbert_path):
            sbert_index = faiss.read_index(sbert_path)
    except Exception:
        sbert_index = None

    try:
        tfidf_path = _resolve_index_path(tfidf_index_path)
        if tfidf_path and os.path.exists(tfidf_path):
            tfidf_index = faiss.read_index(tfidf_path)
        elif embedding_type == 'tfidf' and sbert_index is not None:
            tfidf_index = sbert_index
    except Exception:
        tfidf_index = None

    try:
        with open(meta_path, 'r', encoding='utf-8') as f:
            metas = json.load(f)
    except Exception:
        metas = []
    return sbert_index, tfidf_index, metas, index_meta


model = None
disable_sbert = os.environ.get('SKILLSHUB_DISABLE_SBERT') == '1'
if not disable_sbert and HAS_SBERT and SentenceTransformer is not None:
    try:
        use_gpu = os.environ.get('SKILLSHUB_USE_GPU') == '1'
        import torch  # type: ignore[import-not-found]
        if use_gpu and torch.cuda.is_available():
            device = 'cuda'
        else:
            device = 'cpu'
        print(f'[SKILLSHUB] Loading model on {device}...')
        model = SentenceTransformer(MODEL_NAME, device=device)
        print(f'[SKILLSHUB] Model loaded on {device}')
    except Exception as e:
        print(f'[SKILLSHUB] Failed to load model: {e}')
        model = None

# initial load of index (if present)
tfidf_vectorizer = None
index_meta: Dict[str, Any] = {}
sbert_index, tfidf_index, metas, index_meta = load_index()
def _maybe_enable_faiss_gpu():
    global sbert_index, tfidf_index
    use_gpu = os.environ.get('SKILLSHUB_USE_GPU') == '1'
    if not use_gpu:
        return
    try:
        # attempt to migrate CPU Faiss index to GPU if faiss-gpu present
        if hasattr(faiss, 'StandardGpuResources'):
            res = faiss.StandardGpuResources()
            if sbert_index is not None:
                try:
                    sbert_index = faiss.index_cpu_to_gpu(res, 0, sbert_index)
                    print('[SKILLSHUB] Migrated sbert_index to GPU')
                except Exception as e:
                    print(f'[SKILLSHUB] Failed moving sbert_index to GPU: {e}')
            if tfidf_index is not None:
                try:
                    tfidf_index = faiss.index_cpu_to_gpu(res, 0, tfidf_index)
                    print('[SKILLSHUB] Migrated tfidf_index to GPU')
                except Exception as e:
                    print(f'[SKILLSHUB] Failed moving tfidf_index to GPU: {e}')
    except Exception as e:
        print(f'[SKILLSHUB] Faiss GPU migration check failed: {e}')

# try to move indexes to GPU if configured
_maybe_enable_faiss_gpu()
tfidf_field_embeddings = None
sbert_field_embeddings = None


def load_tfidf_vectorizer(meta: Optional[Dict[str, Any]] = None):
    global tfidf_vectorizer
    if tfidf_vectorizer is not None:
        return tfidf_vectorizer
    try:
        import pickle

        vectorizer_path = 'tfidf_vectorizer.pkl'
        if isinstance(meta, dict):
            vectorizer_path = meta.get('tfidf_vectorizer_path') or vectorizer_path
        candidate = _resolve_index_path(vectorizer_path)
        if not candidate:
            return None
        with open(candidate, 'rb') as f:
            tfidf_vectorizer = pickle.load(f)
        return tfidf_vectorizer
    except Exception:
        return None


def load_field_embeddings():
    global tfidf_field_embeddings, sbert_field_embeddings
    if tfidf_field_embeddings is None:
        tfidf_path = None
        if isinstance(index_meta, dict):
            tfidf_path = index_meta.get('tfidf_fields_path')
        if tfidf_path:
            candidate = _resolve_index_path(tfidf_path)
            try:
                if not candidate:
                    raise RuntimeError('TF-IDF field embeddings path unavailable')
                tfidf_field_embeddings = dict(np.load(candidate))
            except Exception:
                tfidf_field_embeddings = None
    if sbert_field_embeddings is None:
        sbert_path = None
        if isinstance(index_meta, dict):
            sbert_path = index_meta.get('sbert_fields_path')
        if sbert_path:
            candidate = _resolve_index_path(sbert_path)
            try:
                if not candidate:
                    raise RuntimeError('SBERT field embeddings path unavailable')
                sbert_field_embeddings = dict(np.load(candidate))
            except Exception:
                sbert_field_embeddings = None


def _normalize_field_weights(weights: Optional[Dict[str, float]]) -> Dict[str, float]:
    base = DEFAULT_FIELD_WEIGHTS.copy()
    if isinstance(index_meta, dict) and index_meta.get('field_weights'):
        base.update(index_meta.get('field_weights') or {})
    if weights:
        base.update(weights)
    total = 0.0
    normalized = {}
    for field in DEFAULT_FIELD_WEIGHTS.keys():
        value = float(base.get(field, 0.0))
        if value < 0:
            value = 0.0
        normalized[field] = value
        total += value
    if total <= 0:
        equal = 1.0 / len(DEFAULT_FIELD_WEIGHTS)
        return {field: equal for field in DEFAULT_FIELD_WEIGHTS.keys()}
    return {field: value / total for field, value in normalized.items()}


def _normalize_scores(entries: Iterable[float]) -> List[float]:
    values = list(entries)
    if not values:
        return []
    max_val = max(values)
    min_val = min(values)
    if max_val == min_val:
        return [0.0 for _ in values]
    spread = max_val - min_val
    return [(val - min_val) / spread for val in values]


def _detect_exact_match(query: str, meta: Dict[str, Any]) -> bool:
    q = (query or '').strip().lower()
    if not q:
        return False
    name = str(meta.get('name') or '').strip().lower()
    if name == q:
        return True
    if q.replace('-', ' ') == name.replace('-', ' '):
        return True
    return False


def _query_length(query: str) -> int:
    return len((query or '').strip().split())


def _select_hybrid_alpha(query: str) -> float:
    length = _query_length(query)
    if length <= 2:
        return DEFAULT_HYBRID_ALPHA_SHORT_QUERY
    if length >= 5:
        return DEFAULT_HYBRID_ALPHA_LONG_QUERY
    span = DEFAULT_HYBRID_ALPHA_LONG_QUERY - DEFAULT_HYBRID_ALPHA_SHORT_QUERY
    return DEFAULT_HYBRID_ALPHA_SHORT_QUERY + (length - 2) * (span / 3.0)


def _tokenize_query(query: str) -> List[str]:
    return [token for token in (query or '').lower().split() if token]


def _apply_metadata_filters(rows: List[Dict[str, Any]], tags: Optional[List[str]], owner: Optional[str], source: Optional[str], requires_internet: Optional[bool]) -> List[Dict[str, Any]]:
    if not tags and not owner and not source and requires_internet is None:
        return rows
    filtered = []
    tag_set = {t.strip().lower() for t in tags or [] if t.strip()}
    owner_norm = owner.strip().lower() if owner else None
    source_norm = source.strip().lower() if source else None
    for row in rows:
        if tag_set:
            row_tags = {str(t).strip().lower() for t in row.get('tags') or []}
            if not tag_set.issubset(row_tags):
                continue
        if owner_norm:
            if str(row.get('owner') or '').strip().lower() != owner_norm:
                continue
        if source_norm:
            if str(row.get('source') or '').strip().lower() != source_norm:
                continue
        if requires_internet is not None:
            if bool(row.get('requires_internet')) != requires_internet:
                continue
        filtered.append(row)
    return filtered


@app.get('/search')
def search(
    q: str = Query(...),
    k: int = 5,
    engine: str = Query(DEFAULT_ENGINE),
    hybrid_weight: Optional[float] = Query(None),
    tags: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    requires_internet: Optional[bool] = Query(None),
    field_weights_override: Optional[str] = Query(None),
):
    if not metas or (sbert_index is None and tfidf_index is None):
        raise HTTPException(status_code=503, detail='Index not built')

    requested_engine = (engine or DEFAULT_ENGINE).lower()
    allowed_engines = {'auto', 'sbert', 'tfidf', 'hybrid'}
    if requested_engine not in allowed_engines:
        raise HTTPException(status_code=400, detail='Invalid engine')

    weight = DEFAULT_HYBRID_NLP_WEIGHT
    if hybrid_weight is not None:
        try:
            weight = float(hybrid_weight)
        except Exception:
            raise HTTPException(status_code=400, detail='Invalid hybrid_weight')
    if weight < 0 or weight > 1:
        raise HTTPException(status_code=400, detail='hybrid_weight must be between 0 and 1')

    override_weights = None
    if field_weights_override:
        try:
            override_weights = json.loads(field_weights_override)
            if not isinstance(override_weights, dict):
                raise ValueError('field_weights must be a JSON object')
        except Exception:
            raise HTTPException(status_code=400, detail='Invalid field_weights')
    normalized_field_weights = _normalize_field_weights(override_weights)

    use_engine = requested_engine
    if requested_engine == 'auto':
        if model is not None and sbert_index is not None:
            use_engine = 'sbert'
        elif tfidf_index is not None:
            use_engine = 'tfidf'
        else:
            raise HTTPException(status_code=503, detail='No available engine')
    elif requested_engine == 'sbert':
        if model is None or sbert_index is None:
            raise HTTPException(status_code=503, detail='SBERT engine not available')
    elif requested_engine == 'tfidf':
        if tfidf_index is None:
            raise HTTPException(status_code=503, detail='TF-IDF engine not available')
    elif requested_engine == 'hybrid':
        if model is None or sbert_index is None or tfidf_index is None:
            raise HTTPException(status_code=503, detail='Hybrid engine not available')

    # Encode query
    try:
        if use_engine in {'sbert', 'hybrid'} and model is not None:
            sbert_emb = model.encode([q], normalize_embeddings=True).astype('float32')
        else:
            sbert_emb = None

        if use_engine in {'tfidf', 'hybrid'}:
            vectorizer = load_tfidf_vectorizer(index_meta)
            if vectorizer is None:
                raise HTTPException(status_code=503, detail='TF-IDF vectorizer not available')
            v = vectorizer.transform([q]).toarray().astype('float32')
            norms = np.linalg.norm(v, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            tfidf_emb = (v / norms).astype('float32')
        else:
            tfidf_emb = None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Failed to encode query: {e}')

    try:
        if use_engine == 'hybrid':
            candidate_k = min(len(metas), max(k, k * 4))
            sbert_scores, sbert_indices = sbert_index.search(sbert_emb, candidate_k)
            tfidf_scores, tfidf_indices = tfidf_index.search(tfidf_emb, candidate_k)

            score_map: Dict[int, Dict[str, float]] = {}
            for score, idx in zip(sbert_scores[0], sbert_indices[0]):
                if idx < 0:
                    continue
                score_map[int(idx)] = {'sbert': float(score), 'tfidf': 0.0}
            for score, idx in zip(tfidf_scores[0], tfidf_indices[0]):
                if idx < 0:
                    continue
                entry = score_map.get(int(idx), {'sbert': 0.0, 'tfidf': 0.0})
                entry['tfidf'] = float(score)
                score_map[int(idx)] = entry

            sbert_values = [scores.get('sbert', 0.0) for scores in score_map.values()]
            tfidf_values = [scores.get('tfidf', 0.0) for scores in score_map.values()]
            sbert_norm = _normalize_scores(sbert_values)
            tfidf_norm = _normalize_scores(tfidf_values)
            alpha = _select_hybrid_alpha(q)

            combined = []
            for (idx, scores), s_norm, t_norm in zip(score_map.items(), sbert_norm, tfidf_norm):
                effective_weight = (weight + alpha) / 2.0
                combined_score = (effective_weight * s_norm) + ((1 - effective_weight) * t_norm)
                combined.append((combined_score, idx, scores, s_norm, t_norm, effective_weight))

            combined.sort(key=lambda x: x[0], reverse=True)
            candidate_ids = [item[1] for item in combined]
            candidates = [metas[idx] for idx in candidate_ids]
            candidate_rows = _apply_metadata_filters(
                candidates,
                tags.split(',') if tags else None,
                owner,
                source,
                requires_internet,
            )
            candidate_ids_filtered = {row.get('id') for row in candidate_rows}
            filtered = [
                item for item in combined if metas[item[1]].get('id') in candidate_ids_filtered
            ]

            top = filtered[:k]
            D = [[item[0] for item in top]]
            I = [[item[1] for item in top]]
            hybrid_scores = {item[1]: item[2] for item in top}
            hybrid_components = {
                item[1]: {'sbert': item[3], 'tfidf': item[4], 'effective_weight': item[5]}
                for item in top
            }
        else:
            if use_engine == 'sbert':
                candidate_k = min(len(metas), max(k, k * 3))
                D, I = sbert_index.search(sbert_emb, candidate_k)
            else:
                candidate_k = min(len(metas), max(k, k * 3))
                D, I = tfidf_index.search(tfidf_emb, candidate_k)
            hybrid_scores = {}
            hybrid_components = {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Search failed: {e}')

    results = []
    # For each candidate, compute per-field similarity to provide matched_fields evidence
    fields = ['name', 'description', 'excerpt']
    load_field_embeddings()
    for score, idx in zip(D[0], I[0]):
        if idx < 0 or idx >= len(metas):
            continue
        m = metas[idx]
        if tags or owner or source or requires_internet is not None:
            filtered = _apply_metadata_filters([m], tags.split(',') if tags else None, owner, source, requires_internet)
            if not filtered:
                continue
        field_scores = []
        try:
            if use_engine in {'sbert', 'hybrid'} and sbert_field_embeddings is not None and sbert_emb is not None:
                q_emb = sbert_emb[0]
                for f_name in fields:
                    f_embs = sbert_field_embeddings.get(f_name)
                    if f_embs is None:
                        continue
                    score_f = float(np.dot(q_emb, f_embs[idx]))
                    field_scores.append({'field': f_name, 'score': score_f})
            elif tfidf_field_embeddings is not None and tfidf_emb is not None:
                q_emb = tfidf_emb[0]
                for f_name in fields:
                    f_embs = tfidf_field_embeddings.get(f_name)
                    if f_embs is None:
                        continue
                    score_f = float(np.dot(q_emb, f_embs[idx]))
                    field_scores.append({'field': f_name, 'score': score_f})
            else:
                vectorizer = load_tfidf_vectorizer(index_meta)
                if vectorizer is None:
                    raise RuntimeError('TF-IDF vectorizer unavailable')
                q_v = vectorizer.transform([q]).toarray().astype('float32')
                q_norm = np.linalg.norm(q_v, axis=1, keepdims=True)
                q_norm[q_norm == 0] = 1.0
                q_v = q_v / q_norm
                for f_name in fields:
                    text = str(m.get(f_name, '') or '')
                    v = vectorizer.transform([text]).toarray().astype('float32')
                    v_norm = np.linalg.norm(v, axis=1, keepdims=True)
                    v_norm[v_norm == 0] = 1.0
                    v = v / v_norm
                    score_f = float(np.dot(q_v, v.T)[0][0])
                    field_scores.append({'field': f_name, 'score': score_f})
        except Exception:
            # If any per-field scoring fails, continue without it
            field_scores = []

        # pick top field as evidence and supply short snippet
        top_field = None
        if field_scores:
            top = max(field_scores, key=lambda x: x['score'])
            top_field = top['field']
            snippet = (str(m.get(top_field, '') or '')[:240])
        else:
            snippet = (str(m.get('description', '') or '')[:240])

        exact_match = _detect_exact_match(q, m)
        final_score = float(score)
        if exact_match:
            final_score += EXACT_MATCH_BONUS
        if field_scores:
            weighted_field_score = 0.0
            total_weight = 0.0
            for entry in field_scores:
                weight = normalized_field_weights.get(entry['field'], 0.0)
                weighted_field_score += entry['score'] * weight
                total_weight += weight
            if total_weight > 0:
                final_score += 0.05 * (weighted_field_score / total_weight)

        result = {
            'id': m.get('id'),
            'name': m.get('name'),
            'description': m.get('description'),
            'score': final_score,
            'matched_fields': field_scores,
            'top_field': top_field,
            'snippet': snippet,
            'tags': m.get('tags'),
            'owner': m.get('owner'),
            'contact': m.get('contact'),
            'source': m.get('source'),
            'security_score': m.get('security_score'),
            'requires_internet': m.get('requires_internet'),
        }
        if use_engine == 'hybrid' and idx in hybrid_scores:
            result['engine_scores'] = hybrid_scores[idx]
            if idx in hybrid_components:
                result['engine_score_components'] = hybrid_components[idx]
        if exact_match:
            result['exact_match'] = True
        results.append(result)
    results.sort(key=lambda r: r.get('score', 0.0), reverse=True)
    return {
        'query': q,
        'engine': use_engine,
        'hybrid_weight': weight if use_engine == 'hybrid' else None,
        'field_weights': normalized_field_weights,
        'filters': {
            'tags': tags.split(',') if tags else None,
            'owner': owner,
            'source': source,
            'requires_internet': requires_internet,
        },
        'results': results,
    }


@app.get('/skills/{skill_id}')
def get_skill(skill_id: str):
    for m in metas:
        if m['id'] == skill_id:
            return m
    raise HTTPException(status_code=404, detail='Skill not found')


def _require_api_key(x_api_key: Optional[str]):
    """Validate X-API-KEY header against environment SKILLSHUB_API_KEY."""
    env_key = os.environ.get('SKILLSHUB_API_KEY')
    if not env_key:
        raise HTTPException(status_code=503, detail='SKILLSHUB_API_KEY not configured on server')
    if not x_api_key or x_api_key != env_key:
        raise HTTPException(status_code=401, detail='Invalid API key')


@app.post('/index/rebuild')
def index_rebuild(corpus_path: str = '/tmp/skillshub_corpus.json', x_api_key: Optional[str] = Header(None)):
    # Protected endpoint to (re)build the index from corpus
    _require_api_key(x_api_key)
    # import local build_index implementation
    # Import build_index module by path to avoid package import issues in different environments
    import importlib.util
    build_path = os.path.join(os.path.dirname(__file__), 'build_index.py')
    if not os.path.exists(build_path):
        raise HTTPException(status_code=500, detail='build_index.py not found')
    spec = importlib.util.spec_from_file_location('skillshub_build', build_path)
    if spec is None:
        raise HTTPException(status_code=500, detail='Failed to create module spec for build_index')
    build_mod = importlib.util.module_from_spec(spec)
    try:
        loader = spec.loader
        if loader is None:
            raise HTTPException(status_code=500, detail='No loader for build_index spec')
        loader.exec_module(build_mod)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Cannot load build_index: {e}')

    try:
        build_mod.build_index(corpus_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Index build failed: {e}')

    # reload index and metadata
    global sbert_index, tfidf_index, metas, index_meta, tfidf_vectorizer, tfidf_field_embeddings, sbert_field_embeddings
    sbert_index, tfidf_index, metas, index_meta = load_index()
    tfidf_vectorizer = None
    tfidf_field_embeddings = None
    sbert_field_embeddings = None
    # attempt GPU migration if configured after update
    _maybe_enable_faiss_gpu()
    # attempt GPU migration if configured after initial load
    _maybe_enable_faiss_gpu()

    # load index metadata if present
    try:
        with open('skills_index_meta.json', 'r', encoding='utf-8') as f:
            meta = json.load(f)
    except Exception:
        meta = {'status': 'ok'}

    return {'status': 'rebuilt', 'meta': meta}


@app.post('/index/update')
def index_update(x_api_key: Optional[str] = Header(None)):
    _require_api_key(x_api_key)
    import importlib.util
    build_path = os.path.join(os.path.dirname(__file__), 'build_index.py')
    if not os.path.exists(build_path):
        raise HTTPException(status_code=500, detail='build_index.py not found')
    spec = importlib.util.spec_from_file_location('skillshub_build', build_path)
    if spec is None:
        raise HTTPException(status_code=500, detail='Failed to create module spec for build_index')
    build_mod = importlib.util.module_from_spec(spec)
    try:
        loader = spec.loader
        if loader is None:
            raise HTTPException(status_code=500, detail='No loader for build_index spec')
        loader.exec_module(build_mod)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Cannot load build_index: {e}')

    try:
        build_mod.update_index(model=model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Index update failed: {e}')

    global sbert_index, tfidf_index, metas, index_meta, tfidf_vectorizer, tfidf_field_embeddings, sbert_field_embeddings
    sbert_index, tfidf_index, metas, index_meta = load_index()
    tfidf_vectorizer = None
    tfidf_field_embeddings = None
    sbert_field_embeddings = None

    try:
        with open('skills_index_meta.json', 'r', encoding='utf-8') as f:
            meta = json.load(f)
    except Exception:
        meta = {'status': 'ok'}

    return {'status': 'updated', 'meta': meta}


@app.get('/index')
def index_status():
    meta = load_index_meta()
    if not meta:
        meta = {'status': 'missing'}
    return {
        'index_loaded': (sbert_index is not None or tfidf_index is not None) and bool(metas),
        'meta': meta,
    }
