from fastapi import FastAPI, HTTPException, UploadFile, File, Response, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import joblib
import boto3
from botocore.exceptions import BotoCoreError
from typing import Any, Dict
import json
import random
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
import threading
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
except Exception:
    Observer = None
    FileSystemEventHandler = None
from datetime import datetime

app = FastAPI(title='Inference API')

# Initialize Sentry if DSN provided
if os.environ.get('SENTRY_DSN'):
    sentry_sdk.init(dsn=os.environ.get('SENTRY_DSN'))
    app.add_middleware(SentryAsgiMiddleware)

MODEL_PATH = os.environ.get('MODEL_PATH', 'models/current_model.joblib')
ALLOWED_ORIGINS = os.environ.get('ALLOWED_ORIGINS', '*')
API_TOKENS = [t.strip() for t in (os.environ.get('API_TOKENS') or '').split(',') if t.strip()]
JWT_SECRET = os.environ.get('INFERENCE_JWT_SECRET')
use_jwt = bool(JWT_SECRET)
if use_jwt:
    try:
        import jwt as _jwt
    except Exception:
        _jwt = None
else:
    _jwt = None

model = None
_model_cache: Dict[str, Any] = {}
_inference_observer: Any = None


class _ModelFileHandler(FileSystemEventHandler if FileSystemEventHandler is not None else object):
    def __init__(self, target_path: str):
        self.target = os.path.abspath(target_path)

    def on_modified(self, event):
        try:
            if os.path.abspath(event.src_path) == self.target:
                load_model()
        except Exception:
            pass

    def on_created(self, event):
        try:
            if os.path.abspath(event.src_path) == self.target:
                load_model()
        except Exception:
            pass

def load_model(path=MODEL_PATH):
    global model
    if os.path.exists(path):
        model = joblib.load(path)
        return True
    return False


def load_named_model(name: str):
    if not name:
        return None
    if name in _model_cache:
        return _model_cache[name]
    candidate = os.path.join('models', name)
    if os.path.exists(candidate):
        m = joblib.load(candidate)
        _model_cache[name] = m
        return m
    candidate2 = candidate + '.joblib'
    if os.path.exists(candidate2):
        m = joblib.load(candidate2)
        _model_cache[name] = m
        return m
    return None


def load_models_by_prefix(prefix='best_'):
    out = []
    base = 'models'
    if not os.path.exists(base):
        return out
    for fn in os.listdir(base):
        if fn.startswith(prefix) and fn.endswith('.joblib'):
            try:
                p = os.path.join(base, fn)
                m = joblib.load(p)
                out.append({'name': fn, 'model': m})
            except Exception:
                continue
    return out


def check_token(request: Request):
    # simple bearer token auth for mobile/API access
    auth = request.headers.get('authorization') or request.headers.get('Authorization')
    if not API_TOKENS:
        # if no static tokens configured, allow JWT if configured
        if not use_jwt:
            return True
    if not auth:
        raise HTTPException(status_code=401, detail='missing auth')
    if not auth.lower().startswith('bearer '):
        raise HTTPException(status_code=401, detail='invalid auth')
    token = auth.split(None, 1)[1].strip()
    # check static tokens first
    if token in API_TOKENS:
        return True
    # then check JWT if enabled
    if use_jwt and _jwt:
        try:
            payload = _jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            return True
        except Exception:
            raise HTTPException(status_code=403, detail='invalid token')
    raise HTTPException(status_code=403, detail='forbidden')


def choose_model_for_experiment(exp_id: str):
    try:
        base = os.path.join(os.getcwd(), 'data', 'experiments.json')
        if not os.path.exists(base):
            return None
        with open(base, 'r') as f:
            obj = json.load(f)
        exps = obj.get('experiments', [])
        for e in exps:
            if e.get('id') == exp_id:
                models = e.get('models', [])
                weights = e.get('weights', {})
                pool = []
                for m in models:
                    w = int(weights.get(m, 0))
                    pool.extend([m] * max(0, w))
                if not pool:
                    return models[0] if models else None
                return random.choice(pool)
    except Exception:
        return None
    return None

@app.on_event('startup')
def startup():
    load_model()
    # configure CORS for mobile/web
    origins = [o.strip() for o in (ALLOWED_ORIGINS or '').split(',')] if ALLOWED_ORIGINS else ['*']
    try:
        app.add_middleware(CORSMiddleware, allow_origins=origins if origins != [''] else ['*'], allow_methods=['*'], allow_headers=['*'])
    except Exception:
        pass
    # start a file watcher to auto-reload model on change (dev convenience)
    global _inference_observer
    if Observer is not None:
        try:
            models_dir = os.path.dirname(MODEL_PATH) or '.'
            handler = _ModelFileHandler(MODEL_PATH)
            _inference_observer = Observer()
            _inference_observer.schedule(handler, models_dir, recursive=False)
            _inference_observer.daemon = True
            _inference_observer.start()
        except Exception:
            _inference_observer = None

@app.get('/health')
def health():
    return {'status': 'ok', 'model_loaded': model is not None}

# Prometheus metrics
PRED_COUNTER = Counter('inference_requests_total', 'Total inference requests')
SWAP_COUNTER = Counter('model_swaps_total', 'Total model swap operations')

class PredictRequest(BaseModel):
    features: Any

@app.post('/predict')
def predict(request: Request, req: PredictRequest, auth=Depends(check_token)):
    PRED_COUNTER.inc()
    exp_id = request.query_params.get('experiment')
    model_name = request.query_params.get('model')

    chosen = None
    if exp_id:
        chosen = choose_model_for_experiment(exp_id)
    if model_name:
        chosen = model_name

    active = None
    if chosen:
        active = load_named_model(chosen)
    if active is None:
        if model is None:
            raise HTTPException(status_code=503, detail='model not loaded')
        active = model

    try:
        X = req.features
        estimator = active.get('model') if isinstance(active, dict) and 'model' in active else active
        if hasattr(estimator, 'predict_proba'):
            probs = estimator.predict_proba(X)
            return {'pred': estimator.predict(X).tolist(), 'proba': probs.tolist(), 'model_used': chosen or 'default'}
        return {'pred': estimator.predict(X).tolist(), 'model_used': chosen or 'default'}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post('/predict/ensemble')
def predict_ensemble(request: Request, req: PredictRequest, auth=Depends(check_token)):
    """Predict by averaging probabilities from models with prefix `best_` in the models directory.
    Request body: { features: [[...], [...]] }
    Returns averaged probabilities and model list used.
    """
    PRED_COUNTER.inc()
    # load candidate models
    candidates = load_models_by_prefix(prefix='best_')
    if not candidates:
        # fallback to single model
        if model is None:
            raise HTTPException(status_code=503, detail='no models available')
        estimator = model.get('model') if isinstance(model, dict) and 'model' in model else model
        try:
            preds = estimator.predict(req.features)
            if hasattr(estimator, 'predict_proba'):
                proba = estimator.predict_proba(req.features)[:, 1].tolist()
                return {'proba': proba, 'pred': preds.tolist(), 'models_used': ['default']}
            return {'pred': preds.tolist(), 'models_used': ['default']}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # aggregate probabilities
    probs_acc = None
    used = []
    for c in candidates:
        est = c['model'].get('model') if isinstance(c['model'], dict) and 'model' in c['model'] else c['model']
        try:
            if hasattr(est, 'predict_proba'):
                p = est.predict_proba(req.features)
                p1 = p[:, 1]
            else:
                p1 = est.predict(req.features)
            if probs_acc is None:
                probs_acc = p1.astype(float)
            else:
                probs_acc = probs_acc + p1.astype(float)
            used.append(c['name'])
        except Exception:
            continue

    if probs_acc is None:
        raise HTTPException(status_code=500, detail='no valid model predictions')

    # average
    import numpy as _np
    probs_avg = (probs_acc / float(len(used))).tolist()
    # create binary preds using 0.5 threshold
    preds_bin = [_np.array(probs_avg) > 0.5]
    return {'proba': probs_avg, 'pred': (_np.array(probs_avg) > 0.5).astype(int).tolist(), 'models_used': used}

@app.post('/model/swap')
def model_swap(bucket: str, key: str):
    # Download model from S3 and swap
    s3_client = boto3.client('s3',
                             aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
                             aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
                             region_name=os.environ.get('AWS_REGION'))
    try:
        os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
        s3_client.download_file(bucket, key, MODEL_PATH)
        loaded = load_model()
        if not loaded:
            raise HTTPException(status_code=500, detail='failed to load model after download')
        SWAP_COUNTER.inc()
        return {'ok': True, 'model': key}
    except BotoCoreError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/metrics')
def metrics():
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


@app.get('/models')
def list_models():
    base = 'models'
    out = []
    if os.path.exists(base):
        for fn in os.listdir(base):
            p = os.path.join(base, fn)
            if os.path.isfile(p):
                mtime = datetime.utcfromtimestamp(os.path.getmtime(p)).isoformat() + 'Z'
                out.append({'name': fn, 'modified': mtime})
    return {'models': out}


@app.post('/reload-local')
def reload_local():
    """Reload the local MODEL_PATH into memory and return status."""
    loaded = load_model()
    return {'ok': bool(loaded), 'model_loaded': model is not None}


@app.get('/model-info')
def model_info():
    """Return metadata about the currently loaded model (class name and sample params)."""
    info: Dict[str, Any] = {'model_loaded': model is not None, 'model_path': MODEL_PATH}
    if model is None:
        return info
    try:
        estimator = model.get('model') if isinstance(model, dict) and 'model' in model else model
        cls = estimator.__class__.__name__
        params = {}
        try:
            if hasattr(estimator, 'get_params'):
                params = estimator.get_params()
        except Exception:
            params = {}
        # include only small sample of params to avoid huge payloads
        sample = {k: params[k] for i, k in enumerate(params) if i < 6}
        info.update({'class': cls, 'params_sample': sample})
        return info
    except Exception as e:
        info['error'] = str(e)
        return info


@app.on_event('shutdown')
def _shutdown_observer():
    global _inference_observer
    try:
        if _inference_observer is not None:
            _inference_observer.stop()
            _inference_observer.join(timeout=2)
    except Exception:
        pass
