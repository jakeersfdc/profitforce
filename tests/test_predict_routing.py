from fastapi.testclient import TestClient
from ml.api import main


class ArrayLike:
    def __init__(self, v):
        self._v = v

    def tolist(self):
        return self._v


class DummyEstimator:
    def predict(self, X):
        return ArrayLike([1 for _ in X])

    def predict_proba(self, X):
        return ArrayLike([[0.2, 0.8] for _ in X])


def test_named_model_routing():
    # ensure a named model can be used via ?model=
    main._model_cache['example'] = DummyEstimator()
    client = TestClient(main.app)
    resp = client.post('/predict?model=example', json={'features': [[1, 2, 3]]})
    assert resp.status_code == 200
    j = resp.json()
    assert j.get('model_used') == 'example'
    assert 'pred' in j


def test_experiment_routing():
    # experiment exp1 maps to model 'example' in data/experiments.json
    main._model_cache['example'] = DummyEstimator()
    client = TestClient(main.app)
    resp = client.post('/predict?experiment=exp1', json={'features': [[4, 5]]})
    assert resp.status_code == 200
    j = resp.json()
    assert j.get('model_used') == 'example'


def test_default_model_used():
    main.model = DummyEstimator()
    client = TestClient(main.app)
    resp = client.post('/predict', json={'features': [[7, 8]]})
    assert resp.status_code == 200
    j = resp.json()
    assert j.get('model_used') == 'default'
