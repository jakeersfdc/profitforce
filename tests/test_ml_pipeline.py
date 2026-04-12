#!/usr/bin/env python3
"""
Comprehensive test suite for the ProfitForce ML pipeline and FastAPI inference.
Run: pytest tests/ -v
"""
import os
import sys
import json
import pytest
import numpy as np
import pandas as pd

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))


# ═══════════════════════════════════════════════════════════════════
# ML TRAINING TESTS
# ═══════════════════════════════════════════════════════════════════

class TestFeatureEngineering:
    """Test the feature computation pipeline."""

    def _make_ohlcv(self, n=200):
        """Create synthetic OHLCV data."""
        np.random.seed(42)
        dates = pd.date_range('2020-01-01', periods=n, freq='B')
        close = 100 + np.cumsum(np.random.randn(n) * 0.5)
        return pd.DataFrame({
            'Close': close,
            'Open': close - np.random.rand(n) * 0.5,
            'High': close + np.random.rand(n) * 1.0,
            'Low': close - np.random.rand(n) * 1.0,
            'Volume': np.random.randint(100000, 1000000, n),
        }, index=dates)

    def test_v2_features_shape(self):
        from ml.train import compute_features, FEATURE_COLS
        df = self._make_ohlcv(200)
        feats = compute_features(df)
        assert not feats.empty
        for col in FEATURE_COLS:
            assert col in feats.columns, f"Missing feature: {col}"
        assert feats.shape[0] > 100  # should have at least 100 rows after dropna

    def test_v2_features_no_nans(self):
        from ml.train import compute_features, FEATURE_COLS
        df = self._make_ohlcv(300)
        feats = compute_features(df)
        X = feats[FEATURE_COLS]
        assert X.isna().sum().sum() == 0, "Features should not contain NaN after dropna"

    def test_labels_binary(self):
        from ml.train import compute_features, build_labels
        df = self._make_ohlcv(200)
        feats = compute_features(df)
        labels = build_labels(feats, horizon=1, threshold=0.005)
        assert set(labels.dropna().unique()).issubset({0, 1})

    def test_predict_v1_features(self):
        from ml.predict import compute_features_v1, FEATURE_COLS_V1
        df = self._make_ohlcv(100)
        feats = compute_features_v1(df)
        for col in FEATURE_COLS_V1:
            assert col in feats.columns

    def test_predict_v2_features(self):
        from ml.predict import compute_features_v2, FEATURE_COLS_V2
        df = self._make_ohlcv(200)
        feats = compute_features_v2(df)
        for col in FEATURE_COLS_V2:
            assert col in feats.columns


class TestRecommendation:
    """Test the recommendation logic."""

    def test_buy_signal(self):
        from ml.predict import recommend_from_prob
        action, entry, stop, target, conf = recommend_from_prob(0.75, 100.0, 2.0)
        assert action == 'BUY'
        assert stop < entry
        assert target > entry
        assert conf == 0.75

    def test_sell_signal(self):
        from ml.predict import recommend_from_prob
        action, entry, stop, target, conf = recommend_from_prob(0.25, 100.0, 2.0)
        assert action == 'SELL'
        assert stop > entry
        assert target < entry

    def test_hold_signal(self):
        from ml.predict import recommend_from_prob
        action, entry, stop, target, conf = recommend_from_prob(0.5, 100.0, 2.0)
        assert action == 'HOLD'
        assert stop is None
        assert target is None

    def test_atr_based_risk(self):
        from ml.predict import recommend_from_prob
        # Higher ATR should give wider stops
        _, _, stop_low, target_low, _ = recommend_from_prob(0.7, 100.0, 1.0)
        _, _, stop_high, target_high, _ = recommend_from_prob(0.7, 100.0, 5.0)
        assert abs(100.0 - stop_high) > abs(100.0 - stop_low)
        assert abs(target_high - 100.0) > abs(target_low - 100.0)


# ═══════════════════════════════════════════════════════════════════
# FASTAPI INFERENCE TESTS
# ═══════════════════════════════════════════════════════════════════

class TestFastAPIInference:
    """Test the FastAPI inference endpoints."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient
        # Patch environment so auth is disabled
        os.environ.pop('API_TOKENS', None)
        os.environ.pop('INFERENCE_JWT_SECRET', None)
        from ml.api.main import app
        return TestClient(app)

    def test_health(self, client):
        response = client.get('/health')
        assert response.status_code == 200
        data = response.json()
        assert 'status' in data
        assert data['status'] == 'ok'

    def test_metrics(self, client):
        response = client.get('/metrics')
        assert response.status_code == 200
        assert b'inference_requests_total' in response.content

    def test_models_list(self, client):
        response = client.get('/models')
        assert response.status_code == 200
        data = response.json()
        assert 'models' in data

    def test_model_info(self, client):
        response = client.get('/model-info')
        assert response.status_code == 200
        data = response.json()
        assert 'model_loaded' in data

    def test_predict_no_model(self, client):
        """Should return 503 if no model loaded."""
        from ml.api import main as api_module
        api_module.model = None
        response = client.post('/predict', json={'features': [[1, 2, 3]]})
        # Either 503 (no model) or 500 (shape mismatch) is acceptable
        assert response.status_code in [500, 503]


# ═══════════════════════════════════════════════════════════════════
# WALK-FORWARD VALIDATION TESTS
# ═══════════════════════════════════════════════════════════════════

class TestWalkForward:
    def test_walk_forward_returns_metrics(self):
        from ml.train import walk_forward_validate, compute_features, build_labels, FEATURE_COLS
        np.random.seed(42)
        dates = pd.date_range('2020-01-01', periods=500, freq='B')
        close = 100 + np.cumsum(np.random.randn(500) * 0.5)
        df = pd.DataFrame({
            'Close': close,
            'Open': close - np.random.rand(500) * 0.5,
            'High': close + np.random.rand(500) * 1.0,
            'Low': close - np.random.rand(500) * 1.0,
            'Volume': np.random.randint(100000, 1000000, 500),
        }, index=dates)

        feats = compute_features(df)
        labels = build_labels(feats)
        data = feats.copy()
        data['label'] = labels
        data = data.dropna()

        from sklearn.preprocessing import StandardScaler
        X = data[FEATURE_COLS]
        y = data['label']
        scaler = StandardScaler()
        X_s = pd.DataFrame(scaler.fit_transform(X), columns=X.columns, index=X.index)

        result = walk_forward_validate(X_s, y, n_splits=3)
        assert 'avg_f1' in result
        assert 'avg_precision' in result
        assert 'avg_recall' in result
        assert result['n_folds'] >= 1
