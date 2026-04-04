#!/usr/bin/env python3
"""
Evaluate saved joblib models in `ml/models/` and pick the best ones.

Produces `models/best_<symbol>.joblib` copies and updates `models/current_model.joblib`
to the top-performing model.

Run: python ml/evaluate_models.py --top 3
"""
import argparse
import os
import joblib
import json
import shutil
from datetime import datetime
import pandas as pd
import yfinance as yf
from ta.momentum import RSIIndicator
from sklearn.metrics import f1_score, precision_recall_fscore_support


def compute_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df['close'] = df['Close']
    df['return1'] = df['close'].pct_change()
    df['sma5'] = df['close'].rolling(5).mean()
    df['sma20'] = df['close'].rolling(20).mean()
    rsi = RSIIndicator(df['close'], window=14)
    df['rsi14'] = rsi.rsi()
    df['volatility'] = df['return1'].rolling(10).std()
    df['ma_diff'] = (df['sma5'] - df['sma20']) / (df['sma20'] + 1e-9)
    df = df.dropna()
    return df


def build_labels(df: pd.DataFrame, horizon=1):
    future = df['close'].shift(-horizon)
    ret = (future - df['close']) / df['close']
    labels = ret.apply(lambda x: 1 if x > 0.005 else (-1 if x < -0.005 else 0))
    return labels


def evaluate_model(model_path, symbol, start='2018-01-01', end=None):
    end = end or datetime.today().strftime('%Y-%m-%d')
    print('Evaluating', symbol, 'using', model_path)
    df = yf.download(symbol, start=start, end=end, progress=False)
    if df is None or df.shape[0] < 60:
        print('  insufficient data for', symbol)
        return None

    feats = compute_features(df)
    if feats.empty:
        print('  no features for', symbol)
        return None

    labels = build_labels(feats, horizon=1)
    data = feats.copy()
    data['label'] = labels
    data = data.dropna()
    if data.empty:
        print('  no labeled data for', symbol)
        return None

    X = data[['sma5', 'sma20', 'rsi14', 'volatility', 'ma_diff', 'return1']]
    y = (data['label'] == 1).astype(int)

    try:
        bundle = joblib.load(model_path)
        model = bundle.get('model') if isinstance(bundle, dict) else bundle
    except Exception as e:
        print('  failed to load model', model_path, e)
        return None

    try:
        preds = model.predict(X)
        if hasattr(model, 'predict_proba'):
            probs = model.predict_proba(X)[:, 1]
        else:
            probs = preds
    except Exception as e:
        print('  model predict failed', e)
        return None

    precision, recall, f1, _ = precision_recall_fscore_support(y, (preds > 0).astype(int), average='binary', zero_division=0)
    return {'symbol': symbol, 'path': model_path, 'precision': float(precision), 'recall': float(recall), 'f1': float(f1)}


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
