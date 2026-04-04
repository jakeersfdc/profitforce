#!/usr/bin/env python3
"""
Train a simple ML model for buy/sell signals for a given symbol.
Saves model to ml/models/{symbol}.joblib

Usage: python train.py --symbol RELIANCE.NS --start 2018-01-01 --end 2024-12-31
"""
import argparse
import os
from datetime import datetime
import pandas as pd
import numpy as np
import yfinance as yf
from ta.momentum import RSIIndicator
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib


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


def build_labels(df: pd.DataFrame, horizon=1) -> pd.Series:
    # Label: 1 => price up by more than 0.5% in next horizon days -> BUY
    # -1 => price down more than 0.5% -> SELL, else 0 (HOLD)
    future = df['close'].shift(-horizon)
    ret = (future - df['close']) / df['close']
    labels = ret.apply(lambda x: 1 if x > 0.005 else (-1 if x < -0.005 else 0))
    return labels


def train_for_symbol(symbol: str, start: str = None, end: str = None, out_dir: str = 'ml/models'):
    print(f"Training for {symbol} start={start} end={end}")
    df = yf.download(symbol, start=start, end=end, progress=False)
    if df is None or df.shape[0] < 60:
        raise RuntimeError('insufficient historical data')

    features = compute_features(df)
    labels = build_labels(features, horizon=1)
    # Avoid merge issues by assigning labels as a column (preserve index alignment)
    data = features.copy()
    data['label'] = labels
    data = data.dropna()
    if data.empty:
        raise RuntimeError('no training data after feature build')

    X = data[['sma5', 'sma20', 'rsi14', 'volatility', 'ma_diff', 'return1']]
    y = data['label']

    # For simplicity, binary classification: BUY vs NOT-BUY
    y_bin = (y == 1).astype(int)

    X_train, X_test, y_train, y_test = train_test_split(X, y_bin, test_size=0.2, random_state=42, stratify=y_bin)

    clf = RandomForestClassifier(n_estimators=200, max_depth=6, random_state=42)
    clf.fit(X_train, y_train)

    preds = clf.predict(X_test)
    rep = classification_report(y_test, preds, output_dict=False)
    print('Classification report:\n', rep)

    os.makedirs(out_dir, exist_ok=True)
    model_path = os.path.join(out_dir, f"{symbol.replace('/', '_')}.joblib")
    joblib.dump({'model': clf, 'columns': X.columns.tolist()}, model_path)
    print('Saved model to', model_path)
    return model_path


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--symbol', required=True)
    p.add_argument('--start', default='2018-01-01')
    p.add_argument('--end', default=datetime.today().strftime('%Y-%m-%d'))
    p.add_argument('--out', default='ml/models')
    args = p.parse_args()

    model = train_for_symbol(args.symbol, start=args.start, end=args.end, out_dir=args.out)
    print(model)


if __name__ == '__main__':
    main()
