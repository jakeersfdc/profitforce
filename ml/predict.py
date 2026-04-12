#!/usr/bin/env python3
"""
Load a joblib model and produce a prediction for the latest bar of a symbol.
Supports both v1 (6-feature) and v2 (30+-feature ensemble) models.
Outputs JSON to stdout.

Usage: python ml/predict.py --symbol RELIANCE.NS --model ml/models/RELIANCE.NS.joblib
"""
import argparse
import json
import warnings
import joblib
import numpy as np
import yfinance as yf
import pandas as pd
from ta.momentum import RSIIndicator, StochasticOscillator, WilliamsRIndicator
from ta.trend import MACD, ADXIndicator, CCIIndicator, EMAIndicator
from ta.volatility import BollingerBands, AverageTrueRange
from ta.volume import OnBalanceVolumeIndicator

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
    """Compute 30+ technical indicator features from OHLCV data."""
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
    """Legacy 6-feature computation for v1 models."""
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


def recommend_from_prob(prob, last_close, atr=None):
    """Generate entry/stop/target based on probability and ATR-based risk."""
    # Use ATR for dynamic stop/target if available
    atr_val = atr if atr and atr > 0 else last_close * 0.015

    if prob >= 0.6:
        entry = last_close
        stop = round(last_close - 1.5 * atr_val, 2)
        target = round(last_close + 3.0 * atr_val, 2)  # 2:1 risk-reward
        confidence = prob
        return 'BUY', entry, stop, target, confidence
    elif prob <= 0.4:
        entry = last_close
        stop = round(last_close + 1.5 * atr_val, 2)
        target = round(last_close - 3.0 * atr_val, 2)
        confidence = 1 - prob
        return 'SELL', entry, stop, target, confidence
    else:
        return 'HOLD', last_close, None, None, prob


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--symbol', required=True)
    p.add_argument('--model', required=True)
    p.add_argument('--period', default='365d')
    args = p.parse_args()

    df = yf.download(args.symbol, period=args.period, progress=False)
    if df is None or df.shape[0] < 60:
        print(json.dumps({'error': 'insufficient data'}))
        return

    # Load model bundle
    bundle = joblib.load(args.model)
    model_obj = bundle.get('model') if isinstance(bundle, dict) else bundle
    version = bundle.get('version', '1.0') if isinstance(bundle, dict) else '1.0'
    scaler = bundle.get('scaler') if isinstance(bundle, dict) else None
    columns = bundle.get('columns') if isinstance(bundle, dict) else FEATURE_COLS_V1

    # Determine feature version
    is_v2 = version >= '2.0' or len(columns) > 10

    if is_v2:
        feats = compute_features_v2(df)
        feature_cols = FEATURE_COLS_V2
    else:
        feats = compute_features_v1(df)
        feature_cols = FEATURE_COLS_V1

    if feats.empty:
        print(json.dumps({'error': 'no features'}))
        return

    last = feats.iloc[-1:]
    X = last[feature_cols]

    # Apply scaler if present
    if scaler is not None:
        X = pd.DataFrame(scaler.transform(X), columns=X.columns, index=X.index)

    # Predict
    probs = None
    try:
        probs = model_obj.predict_proba(X)[0]
        prob_buy = float(probs[1]) if len(probs) > 1 else float(probs[0])
    except Exception:
        pred = int(model_obj.predict(X)[0])
        prob_buy = 1.0 if pred == 1 else 0.0

    last_close = float(last['close'].values[0])
    atr_val = float(last['atr14'].values[0]) if 'atr14' in last.columns else None
    action, entry, stop, target, confidence = recommend_from_prob(prob_buy, last_close, atr_val)

    # Compute signal strength (0-100)
    strength = min(100, int(abs(prob_buy - 0.5) * 200))

    out = {
        'symbol': args.symbol,
        'action': action,
        'entry': entry,
        'stop': stop,
        'target': target,
        'confidence': round(confidence, 4),
        'prob_buy': round(prob_buy, 4),
        'strength': strength,
        'model_version': version,
    }
    print(json.dumps(out))


if __name__ == '__main__':
    main()
