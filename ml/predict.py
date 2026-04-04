#!/usr/bin/env python3
"""
Load a joblib model and produce a prediction for the latest bar of a symbol.
Outputs JSON to stdout.

Usage: python ml/predict.py --symbol RELIANCE.NS --model ml/models/RELIANCE.NS.joblib
"""
import argparse
import json
import joblib
import yfinance as yf
import pandas as pd
from ta.momentum import RSIIndicator


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


def recommend_from_prob(prob, last_close):
    # prob is probability of BUY
    if prob >= 0.6:
        entry = last_close
        stop = round(last_close * 0.99, 4)
        target = round(last_close * 1.04, 4)
        return 'BUY', entry, stop, target, prob
    elif prob <= 0.4:
        entry = last_close
        stop = round(last_close * 1.01, 4)
        target = round(last_close * 0.96, 4)
        return 'SELL', entry, stop, target, 1-prob
    else:
        return 'HOLD', last_close, None, None, prob


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--symbol', required=True)
    p.add_argument('--model', required=True)
    p.add_argument('--period', default='180d')
    args = p.parse_args()

    df = yf.download(args.symbol, period=args.period, progress=False)
    if df is None or df.shape[0] < 30:
        print(json.dumps({'error':'insufficient data'}))
        return

    feats = compute_features(df)
    if feats.empty:
        print(json.dumps({'error':'no features'}))
        return

    last = feats.iloc[-1:]
    X = last[['sma5', 'sma20', 'rsi14', 'volatility', 'ma_diff', 'return1']]

    modelbundle = joblib.load(args.model)
    model = modelbundle.get('model') if isinstance(modelbundle, dict) else modelbundle
    cols = modelbundle.get('columns') if isinstance(modelbundle, dict) else None

    probs = None
    try:
        probs = model.predict_proba(X)[0]
        # assume class 1 is BUY
        prob_buy = float(probs[1]) if len(probs) > 1 else float(probs[0])
    except Exception:
        # fallback: predict
        pred = int(model.predict(X)[0])
        prob_buy = 1.0 if pred == 1 else 0.0

    last_close = float(last['close'].values[0])
    action, entry, stop, target, confidence = recommend_from_prob(prob_buy, last_close)

    out = {
        'symbol': args.symbol,
        'action': action,
        'entry': entry,
        'stop': stop,
        'target': target,
        'confidence': confidence,
        'prob_buy': prob_buy,
    }
    print(json.dumps(out))


if __name__ == '__main__':
    main()
