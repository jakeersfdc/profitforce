/**
 * AutoTrader — Fully automated trading loop.
 * Scans the market, generates signals, places orders, monitors positions, and auto-exits.
 * Sends alerts to all subscribed users via email, push, and WhatsApp.
 */

import { scanMarket, generateSignal, checkExit, type Signal, type Position } from './SignalEngine';
import { fetchQuote } from '../stockUtils';

const fs = require('fs').promises;
const path = require('path');
const exec = require('../execution/OrderExecutionManager');
const { sendEmail } = require('../notifications/email');
const { sendPush } = require('../notifications/fcm');
const { sendWhatsApp } = require('../notifications/twilio');

const POSITIONS_PATH = path.join(process.cwd(), 'data', 'positions.json');
const ALERTS_LOG_PATH = path.join(process.cwd(), 'data', 'alerts_log.json');

async function ensureDataDir() {
  await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
  try { await fs.access(POSITIONS_PATH); } catch { await fs.writeFile(POSITIONS_PATH, '[]'); }
  try { await fs.access(ALERTS_LOG_PATH); } catch { await fs.writeFile(ALERTS_LOG_PATH, '[]'); }
}

async function readJson(p: string): Promise<any[]> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return []; }
}

async function writeJson(p: string, v: any) {
  await fs.writeFile(p, JSON.stringify(v, null, 2));
}

// ── Subscriber lookup ─────────────────────────────────────────────────────────

async function getSubscribers(): Promise<Array<{ id: string; email?: string; pushToken?: string; phone?: string }>> {
  // Try DB first
  try {
    const db = require('../db');
    if (db.pool) {
      const res = await db.pool.query(
        `SELECT u.clerk_id as id, u.email, u.metadata->>'pushToken' as "pushToken", u.metadata->>'phone' as phone
         FROM users u
         JOIN subscriptions s ON s.user_id = u.clerk_id
         WHERE u.is_subscriber = true AND (s.active = true AND (s.expires_at IS NULL OR s.expires_at > NOW()))
         ORDER BY u.created_at DESC`
      );
      if (res.rows.length > 0) return res.rows;
    }
  } catch {
    // fallback to file
  }

  // File-based fallback
  try {
    const users = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'users.json'), 'utf-8'));
    const subs = JSON.parse(await fs.readFile(path.join(process.cwd(), 'data', 'subscriptions.json'), 'utf-8'));
    const activeSubIds = new Set(subs.filter((s: any) => s.active !== false).map((s: any) => s.userId));
    return users.filter((u: any) => activeSubIds.has(u.id)).map((u: any) => ({
      id: u.id, email: u.email, pushToken: u.pushToken, phone: u.phone
    }));
  } catch {
    return [];
  }
}

// ── Alert broadcaster ─────────────────────────────────────────────────────────

export async function broadcastAlert(signal: Signal) {
  await ensureDataDir();
  const subscribers = await getSubscribers();

  // Compute professional trade call format
  const dir = signal.signal;
  const isCall = dir === 'BUY';
  const isPut = dir === 'SELL';
  const price = signal.entryPrice;

  // Compute expiry (Friday for BSE/SENSEX, Thursday for NSE)
  const MONTHS_S = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const isBSE = signal.symbol === '^BSESN' || signal.symbol.includes('SENSEX');
  const expiryDay = isBSE ? 4 : 2; // 4=Thursday (BSE/SENSEX), 2=Tuesday (NSE)
  const now = new Date();
  let daysUntil = (expiryDay - now.getDay() + 7) % 7;
  if (daysUntil === 0) {
    const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes()) + 330;
    if (istMin > 15 * 60 + 30) daysUntil = 7;
  }
  const expDate = new Date(now);
  expDate.setDate(expDate.getDate() + daysUntil);
  const expiryStr = `${expDate.getDate()} ${MONTHS_S[expDate.getMonth()]} ${expDate.getFullYear()}`;

  // Compute strike and option type
  const sym = signal.symbol.replace('.NS', '').replace('^', '');
  const shortName = sym === 'NSEI' ? 'NIFTY' : sym === 'NSEBANK' ? 'BANKNIFTY' : sym === 'BSESN' ? 'SENSEX' : sym;
  const optType = isCall ? 'CE' : isPut ? 'PE' : '';
  const tick = price >= 50000 ? 100 : price >= 10000 ? 50 : price >= 500 ? 25 : 10;
  const atm = Math.round(price / tick) * tick;
  const fnoStrike = signal.fnoRecommendation?.strike ?? (isCall ? atm + tick : isPut ? atm - tick : atm);

  // Estimate premium
  const dteVal = Math.max(0.5, Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const t = dteVal / 365;
  const r = 0.065;
  const moneyness = Math.abs(price - fnoStrike) / price;
  const iv = 0.15 + moneyness * 0.4;
  const d1 = (Math.log(price / fnoStrike) + (r + iv * iv / 2) * t) / (iv * Math.sqrt(t));
  const d2 = d1 - iv * Math.sqrt(t);
  const nd = (x: number) => { const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911; const s=x<0?-1:1; const tt=1/(1+p*Math.abs(x)); const y=1-(((((a5*tt+a4)*tt)+a3)*tt+a2)*tt+a1)*tt*Math.exp(-x*x/2); return 0.5*(1+s*y); };
  const callP = Math.max(0.5, price * nd(d1) - fnoStrike * Math.exp(-r * t) * nd(d2));
  const putP = Math.max(0.5, fnoStrike * Math.exp(-r * t) * nd(-d2) - price * nd(-d1));
  const premium = Math.round((isCall ? callP : putP) * 100) / 100;
  const lo = Math.floor(premium / 5) * 5 || Math.floor(premium);
  const hi = lo + 5;

  // SL/Targets from premium
  const conf = Math.max(signal.strength, 40) / 100;
  const slPrem = Math.round(premium * (0.35 + (1 - conf) * 0.25));
  const t1 = Math.round(premium * (1.8 + conf * 0.7));
  const t2 = Math.round(premium * (2.5 + conf * 1.0));
  const t3 = Math.round(premium * (3.5 + conf * 1.5));

  const hasFnO = isCall || isPut;
  const tradeCallLine = hasFnO
    ? `${shortName} ${expiryStr} ${optType} ${fnoStrike.toFixed(2)} @ ${lo}-${hi}`
    : `${dir} ${shortName} @ ₹${price.toFixed(2)}`;

  const subject = `🔔 ${tradeCallLine}`;
  const body = hasFnO
    ? `${tradeCallLine}\n\nSTOPLOSS: ${slPrem}\n\nTARGETS: ${t1}-${t2}-${t3}\n\nSpot: ₹${price.toFixed(2)}\nStrength: ${signal.strength}% | Confidence: ${(signal.confidence * 100).toFixed(0)}%\n\nSupport/Resistance:\n${signal.reason}\n\nTime: ${signal.timestamp}`
    : `${dir} ${signal.symbol} @ ₹${price.toFixed(2)}\n\nEntry: ₹${price.toFixed(2)}\nStop Loss: ${signal.stopLoss ? '₹' + signal.stopLoss.toFixed(2) : 'N/A'}\nTarget: ${signal.targetPrice ? '₹' + signal.targetPrice.toFixed(2) : 'N/A'}\nStrength: ${signal.strength}%\n\n${signal.reason}\n\nTime: ${signal.timestamp}`;

  const sigColor = signal.signal === 'BUY' ? '#00ff99' : signal.signal === 'SELL' ? '#ff4d4f' : '#ffa500';
  const html = `<div style="font-family:monospace;padding:20px;background:#071026;color:#e0e0e0;border-radius:12px;border:2px solid ${sigColor}">
    <h2 style="color:${sigColor};margin:0 0 12px 0;font-size:20px">${hasFnO ? (isCall ? '📈' : '📉') : '🔔'} ${tradeCallLine}</h2>
    ${hasFnO ? `
    <p style="color:#ff4d4f;font-weight:900;font-size:16px;margin:8px 0">🛑 STOPLOSS: ${slPrem}</p>
    <p style="color:#00d4ff;font-weight:900;font-size:16px;margin:8px 0">🎯 TARGETS: ${t1}-${t2}-${t3}</p>
    <hr style="border-color:#333;margin:12px 0">
    <p style="margin:4px 0"><strong>Spot:</strong> ₹${price.toFixed(2)}</p>
    ` : `
    <p style="margin:4px 0"><strong>Entry:</strong> ₹${price.toFixed(2)}</p>
    <p style="margin:4px 0"><strong>Stop Loss:</strong> ${signal.stopLoss ? '₹' + signal.stopLoss.toFixed(2) : 'N/A'}</p>
    <p style="margin:4px 0"><strong>Target:</strong> ${signal.targetPrice ? '₹' + signal.targetPrice.toFixed(2) : 'N/A'}</p>
    `}
    <p style="margin:4px 0"><strong>Strength:</strong> ${signal.strength}% &nbsp; <strong>Confidence:</strong> ${(signal.confidence * 100).toFixed(0)}%</p>
    <p style="color:#9aa7bd;font-size:12px;margin:8px 0">${signal.reason}</p>
    <p style="color:#666;font-size:11px;margin:8px 0">${signal.timestamp}</p>
  </div>`;

  const results: any[] = [];
  for (const sub of subscribers) {
    try {
      if (sub.email) {
        const r = await sendEmail(sub.email, subject, body, html);
        results.push({ userId: sub.id, channel: 'email', ...r });
      }
      if (sub.pushToken) {
        const r = await sendPush(sub.pushToken, { title: subject, body: body.slice(0, 200) });
        results.push({ userId: sub.id, channel: 'push', ...r });
      }
      if (sub.phone) {
        const r = await sendWhatsApp(sub.phone, body);
        results.push({ userId: sub.id, channel: 'whatsapp', ...r });
      }
    } catch (e) {
      results.push({ userId: sub.id, error: String(e) });
    }
  }

  // Also log the alert even without subscribers
  const alertsLog = await readJson(ALERTS_LOG_PATH);
  alertsLog.push({ signal, sentTo: results.length, timestamp: new Date().toISOString() });
  // keep last 500 alerts
  await writeJson(ALERTS_LOG_PATH, alertsLog.slice(-500));

  return { sentCount: results.length, subscribers: subscribers.length, results };
}

// ── Auto-exit position monitor ──────────────────────────────────────────────

export async function monitorPositions(): Promise<Array<{ position: Position; action: string; reason: string }>> {
  await ensureDataDir();
  const positions: Position[] = await readJson(POSITIONS_PATH);
  const actions: Array<{ position: Position; action: string; reason: string }> = [];

  for (const pos of positions) {
    try {
      const quote = await fetchQuote(pos.symbol);
      const currentPrice = quote.price;
      if (!currentPrice || currentPrice <= 0) continue;

      // update high water mark
      if (pos.side === 'LONG') pos.highWaterMark = Math.max(pos.highWaterMark, currentPrice);
      else pos.highWaterMark = Math.min(pos.highWaterMark || Infinity, currentPrice);

      // Check signal for possible exit
      const signal = await generateSignal(pos.symbol);
      const atrVal = signal.indicators?.atr ?? 0;

      const exit = checkExit(pos, currentPrice, atrVal);
      // Also exit if signal reverses
      const reversal = (pos.side === 'LONG' && signal.signal === 'SELL') || (pos.side === 'SHORT' && signal.signal === 'BUY');

      if (exit.shouldExit || reversal) {
        const reason = exit.shouldExit ? exit.reason : 'SIGNAL_REVERSAL';
        const exitSide = pos.side === 'LONG' ? 'sell' : 'buy';

        try {
          await exec.placeOrder({
            userId: 'auto-trader',
            symbol: pos.symbol,
            qty: pos.qty,
            side: exitSide,
            type: 'market',
            price: currentPrice,
            dryRun: process.env.PAPER_TRADING === '1'
          });
        } catch (e) {
          console.error('Auto-exit order failed', pos.symbol, e);
        }

        // Broadcast exit alert
        const exitSignal: Signal = {
          ...signal, signal: 'EXIT',
          reason: `Auto-exit: ${reason}. Entry: ₹${pos.entryPrice.toFixed(2)}, Exit: ₹${currentPrice.toFixed(2)}, P&L: ${pos.side === 'LONG' ? ((currentPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(2) : ((pos.entryPrice - currentPrice) / pos.entryPrice * 100).toFixed(2)}%`
        };
        await broadcastAlert(exitSignal);
        actions.push({ position: pos, action: 'EXIT', reason });
      }
    } catch (e) {
      console.error('Position monitor error', pos.symbol, e);
    }
  }

  // Remove exited positions
  const exitedSymbols = new Set(actions.filter(a => a.action === 'EXIT').map(a => a.position.symbol));
  const remaining = positions.filter(p => !exitedSymbols.has(p.symbol));
  await writeJson(POSITIONS_PATH, remaining);

  return actions;
}

// ── Full automated trading cycle ────────────────────────────────────────────

export async function runTradingCycle(): Promise<{
  scanned: number;
  newSignals: Signal[];
  exits: any[];
  alertsSent: number;
}> {
  await ensureDataDir();

  // 1. Monitor existing positions for exits
  const exits = await monitorPositions();

  // 2. Scan market for new signals
  const allSignals = await scanMarket();

  // 3. Filter actionable signals (BUY/SELL with strength >= 60 and confidence >= 0.4)
  const actionable = allSignals.filter(s =>
    ['BUY', 'SELL'].includes(s.signal) && s.strength >= 60 && s.confidence >= 0.4
  );

  // 4. Check if we already have a position in the symbol
  const currentPositions: Position[] = await readJson(POSITIONS_PATH);
  const positionSymbols = new Set(currentPositions.map(p => p.symbol));

  const newSignals = actionable.filter(s => !positionSymbols.has(s.symbol));

  // 5. For each new signal, open a position (paper trading by default)
  let alertsSent = 0;
  for (const signal of newSignals) {
    try {
      // Place the order
      const side = signal.signal === 'BUY' ? 'buy' : 'sell';
      await exec.placeOrder({
        userId: 'auto-trader',
        symbol: signal.symbol,
        qty: 1, // default lot, will be refined by risk management
        side,
        type: 'market',
        price: signal.entryPrice,
        dryRun: process.env.PAPER_TRADING !== '0' // default to paper
      });

      // Track position
      const newPos: Position = {
        symbol: signal.symbol,
        side: signal.signal === 'BUY' ? 'LONG' : 'SHORT',
        entryPrice: signal.entryPrice,
        qty: 1,
        stopLoss: signal.stopLoss ?? signal.entryPrice * (signal.signal === 'BUY' ? 0.97 : 1.03),
        targetPrice: signal.targetPrice ?? signal.entryPrice * (signal.signal === 'BUY' ? 1.05 : 0.95),
        trailingStop: signal.trailingStop ?? signal.entryPrice * (signal.signal === 'BUY' ? 0.98 : 1.02),
        highWaterMark: signal.entryPrice,
      };
      currentPositions.push(newPos);

      // Broadcast alert to subscribers
      const alertResult = await broadcastAlert(signal);
      alertsSent += alertResult.sentCount;
    } catch (e) {
      console.error('Auto-trade failed', signal.symbol, e);
    }
  }

  // Save updated positions
  await writeJson(POSITIONS_PATH, currentPositions);

  return {
    scanned: allSignals.length,
    newSignals,
    exits,
    alertsSent,
  };
}
