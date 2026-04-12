#!/usr/bin/env python3
"""
Evaluate saved joblib models in `ml/models/` and pick the best ones.
Supports both v1 (6-feature) and v2 (30+-feature ensemble) models.

Produces `models/best_<symbol>.joblib` copies and updates `models/current_model.joblib`
to the top-performing model.

Run: python ml/evaluate_models.py --top 3
"""
import argparse
import os
import warnings
import joblib
import json
import shutil
from datetime import datetime
import pandas as pd
import numpy as np
import yfinance as yf
from ta.momentum import RSIIndicator, StochasticOscillator, WilliamsRIndicator
from ta.trend import MACD, ADXIndicator, CCIIndicator, EMAIndicator
from ta.volatility import BollingerBands, AverageTrueRange
from ta.volume import OnBalanceVolumeIndicator
from sklearn.metrics import f1_score, precision_recall_fscore_support, accuracy_score

warnings.filterwarnings('ignore')

FEATURE_COLS_V2 = [
    'sma5', 'sma10', 'sma20', 'sma50', 'ema12', 'ema26',
    'rsi14', 'rsi7',
    'macd', 'macd_signal', 'macd_hist',
    'bb_upper', 'bb_lower', 'bb_width', 'bb_pct',
    'atr14',
    'adx14', 'cci20',
    'stoch_k', 'stoch_d', 'williams_r',
    'obv_slope',
    'volatility', 'volatility20',
    'ma_diff', 'ma_diff_10_50',
    'return1', 'return3', 'return5',
    'volume_ratio',
    'close_to_sma20', 'close_to_sma50',
    'high_low_range',
]

FEATURE_COLS_V1 = ['sma5', 'sma20', 'rsi14', 'volatility', 'ma_diff', 'return1']


def compute_features_v2(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for col in ['Close', 'Open', 'High', 'Low', 'Volume']:
        if col in df.columns:
            df[col.lower()] = df[col]

    c = df['close']
    h = df.get('high', c)
    l = df.get('low', c)
    v = df.get('volume', pd.Series(0, index=df.index))

    df['sma5'] = c.rolling(5).mean()
    df['sma10'] = c.rolling(10).mean()
    df['sma20'] = c.rolling(20).mean()
    df['sma50'] = c.rolling(50).mean()
    df['ema12'] = EMAIndicator(c, window=12).ema_indicator()
    df['ema26'] = EMAIndicator(c, window=26).ema_indicator()
    df['rsi14'] = RSIIndicator(c, window=14).rsi()
    df['rsi7'] = RSIIndicator(c, window=7).rsi()

    macd = MACD(c, window_slow=26, window_fast=12, window_sign=9)
    df['macd'] = macd.macd()
    df['macd_signal'] = macd.macd_signal()
    df['macd_hist'] = macd.macd_diff()

    bb = BollingerBands(c, window=20, window_dev=2)
    df['bb_upper'] = bb.bollinger_hband()
    df['bb_lower'] = bb.bollinger_lband()
    df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / (c + 1e-9)
    df['bb_pct'] = bb.bollinger_pband()

    df['atr14'] = AverageTrueRange(h, l, c, window=14).average_true_range()
    df['adx14'] = ADXIndicator(h, l, c, window=14).adx()
    df['cci20'] = CCIIndicator(h, l, c, window=20).cci()

    stoch = StochasticOscillator(h, l, c, window=14, smooth_window=3)
    df['stoch_k'] = stoch.stoch()
    df['stoch_d'] = stoch.stoch_signal()
    df['williams_r'] = WilliamsRIndicator(h, l, c, lbp=14).williams_r()

    try:
        df['obv_slope'] = OnBalanceVolumeIndicator(c, v).on_balance_volume().pct_change(5)
    except Exception:
        df['obv_slope'] = 0

    df['return1'] = c.pct_change(1)
    df['return3'] = c.pct_change(3)
    df['return5'] = c.pct_change(5)
    df['volatility'] = df['return1'].rolling(10).std()
    df['volatility20'] = df['return1'].rolling(20).std()
    df['ma_diff'] = (df['sma5'] - df['sma20']) / (df['sma20'] + 1e-9)
    df['ma_diff_10_50'] = (df['sma10'] - df['sma50']) / (df['sma50'] + 1e-9)
    df['volume_ratio'] = v / (v.rolling(20).mean() + 1)
    df['close_to_sma20'] = (c - df['sma20']) / (df['sma20'] + 1e-9)
    df['close_to_sma50'] = (c - df['sma50']) / (df['sma50'] + 1e-9)
    df['high_low_range'] = (h - l) / (c + 1e-9)

    df = df.dropna()
    return df


def compute_features_v1(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df['close'] = df['Close']
    df['return1'] = df['close'].pct_change()
    df['sma5'] = df['close'].rolling(5).mean()
    df['sma20'] = df['close'].rolling(20).mean()
    df['rsi14'] = RSIIndicator(df['close'], window=14).rsi()
    df['volatility'] = df['return1'].rolling(10).std()
    df['ma_diff'] = (df['sma5'] - df['sma20']) / (df['sma20'] + 1e-9)
    df = df.dropna()
    return df


def build_labels(df: pd.DataFrame, horizon=1):
    future = df['close'].shift(-horizon)
    ret = (future - df['close']) / df['close']
    return (ret > 0.005).astype(int)


def evaluate_model(model_path, symbol, start='2018-01-01', end=None):
    end = end or datetime.today().strftime('%Y-%m-%d')
    print(f'Evaluating {symbol} using {model_path}')
    df = yf.download(symbol, start=start, end=end, progress=False)
    if df is None or df.shape[0] < 100:
        print(f'  insufficient data for {symbol}')
        return None

    # Load model bundle
    try:
        bundle = joblib.load(model_path)
        model = bundle.get('model') if isinstance(bundle, dict) else bundle
        version = bundle.get('version', '1.0') if isinstance(bundle, dict) else '1.0'
        scaler = bundle.get('scaler') if isinstance(bundle, dict) else None
        columns = bundle.get('columns') if isinstance(bundle, dict) else FEATURE_COLS_V1
    except Exception as e:
        print(f'  failed to load model {model_path}: {e}')
        return None

    is_v2 = version >= '2.0' or len(columns) > 10

    if is_v2:
        feats = compute_features_v2(df)
        feature_cols = FEATURE_COLS_V2
    else:
        feats = compute_features_v1(df)
        feature_cols = FEATURE_COLS_V1

    if feats.empty:
        print(f'  no features for {symbol}')
        return None

    labels = build_labels(feats, horizon=1)
    data = feats.copy()
    data['label'] = labels
    data = data.dropna()
    if data.empty:
        print(f'  no labeled data for {symbol}')
        return None

    X = data[feature_cols]
    y = data['label']

    # Apply scaler if present
    if scaler is not None:
        X = pd.DataFrame(scaler.transform(X), columns=X.columns, index=X.index)

    try:
        preds = model.predict(X)
        if hasattr(model, 'predict_proba'):
            probs = model.predict_proba(X)[:, 1]
        else:
            probs = preds.astype(float)
    except Exception as e:
        print(f'  model predict failed: {e}')
        return None

    precision, recall, f1, _ = precision_recall_fscore_support(y, preds, average='binary', zero_division=0)
    acc = accuracy_score(y, preds)

    stored_metrics = bundle.get('metrics', {}) if isinstance(bundle, dict) else {}

    return {
        'symbol': symbol,
        'path': model_path,
        'version': version,
        'precision': round(float(precision), 4),
        'recall': round(float(recall), 4),
        'f1': round(float(f1), 4),
        'accuracy': round(float(acc), 4),
        'stored_metrics': stored_metrics,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--top', type=int, default=3)
    p.add_argument('--models-dir', default=os.path.join('ml', 'models'))
    p.add_argument('--out-dir', default='models')
    args = p.parse_args()

    models_dir = args.models_dir
    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    candidates = [f for f in os.listdir(models_dir) if f.endswith('.joblib')]
    results = []
    for f in candidates:
        pathf = os.path.join(models_dir, f)
        # derive symbol (may include .NS)
        sym = f.replace('.joblib', '')
        if not sym.endswith('.NS'):
            sym = sym + '.NS'
        r = evaluate_model(pathf, sym)
        if r:
            results.append(r)

    if not results:
        print('No evaluation results')
        return

    results.sort(key=lambda x: x['f1'], reverse=True)
    print('\nTop models:')
    print(json.dumps(results[: args.top], indent=2))

    # copy top N
    topn = results[: args.top]
    for i, t in enumerate(topn):
        src = t['path']
        sym = t['symbol'].replace('.NS', '')
        dst = os.path.join(out_dir, f'best_{sym}.joblib')
        shutil.copyfile(src, dst)
        print('Copied', src, '->', dst)

    # set current_model to best
    best = topn[0]
    curdst = os.path.join(out_dir, 'current_model.joblib')
    shutil.copyfile(best['path'], curdst)
    print('Set current model to', best['symbol'], '->', curdst)


if __name__ == '__main__':
    main()
