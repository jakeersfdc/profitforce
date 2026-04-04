import { NextResponse } from 'next/server';

// Helper to get a yahoo finance client similar to lib/stockUtils
async function getYahooClientLocal() {
  const mod: any = await import('yahoo-finance2');
  const YahooFinance = mod?.default ?? mod?.YahooFinance ?? mod;
  if (typeof YahooFinance === 'function') {
    try {
      return new YahooFinance();
    } catch (e) {
      return YahooFinance;
    }
  }
  return YahooFinance;
}

function normCdf(x: number) {
  // Abramowitz and Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return prob;
}

function bsDelta(callPutFlag: 'CALL' | 'PUT', S: number, K: number, r: number, sigma: number, t: number) {
  if (t <= 0 || sigma <= 0) return callPutFlag === 'CALL' ? (S > K ? 1 : 0) : (S > K ? 0 : -1);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * t) / (sigma * Math.sqrt(t));
  const nd1 = normCdf(d1);
  return callPutFlag === 'CALL' ? nd1 : nd1 - 1;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get('symbol');
    const side = (url.searchParams.get('side') ?? 'CALL').toUpperCase();
    const targetDelta = Number(url.searchParams.get('targetDelta') ?? '0.3');
    const maxPremium = Number(url.searchParams.get('maxPremium') ?? '999999');
    const daysToExpiry = Number(url.searchParams.get('days') ?? '30');

    if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

    const yf = await getYahooClientLocal();
    // try several method names used by yahoo-finance2
    let chain: any = null;
    try { chain = await yf.options(symbol); } catch (e) { /* ignore */ }
    try { if (!chain) chain = await yf.optionChain(symbol); } catch (e) { /* ignore */ }

    if (!chain) return NextResponse.json({ error: 'option chain fetch failed' }, { status: 500 });

    // normalize structure: many versions return { expirationDates, strikes, options: [ { calls:[], puts:[] } ] }
    const optionsBlock = chain.options?.[0] ?? chain?.[0] ?? chain;
    const calls = optionsBlock.calls ?? [];
    const puts = optionsBlock.puts ?? [];

    // get underlying price
    const quote = await yf.quote(symbol);
    const S = Number(quote?.regularMarketPrice ?? quote?.currentPrice ?? 0);

    const now = Date.now();
    // choose expirations within daysToExpiry and compute scoring
    const rawList = (side === 'PUT' ? puts : calls).map((o: any) => {
      const strike = Number(o.strike ?? o.contractSymbol?.split(/\d/)[0] ?? 0) || Number(o.strike ?? 0);
      const lastPrice = Number(o.lastPrice ?? o.last ?? o.bid ?? o.ask ?? 0);
      const iv = Number(o.impliedVolatility ?? o.impliedVol ?? 0.2);
      const expiryMs = o.expiration || o.expirationDate || o.expiry || 0;
      const expiry = expiryMs ? (typeof expiryMs === 'number' ? expiryMs * 1000 : new Date(expiryMs).getTime()) : null;
      const days = expiry ? Math.max((expiry - now) / (1000 * 60 * 60 * 24), 0) : null;
      const t = days != null ? Math.max(days / 365, 1/365) : Math.max(daysToExpiry / 365, 1/365);
      const delta = bsDelta(side as any, S, strike, 0.06, iv || 0.2, t);
      return { strike, lastPrice, iv, expiry, days, t, delta, raw: o };
    }).filter((c: any) => c.strike > 0 && (c.days == null || c.days <= daysToExpiry));

    // scoring: prefer closeness to targetDelta, lower premium, reasonable IV and shorter expiry, and larger expected move relative to premium
    const scored = rawList.map((c: any) => {
      const deltaDiff = Math.abs(Math.abs(c.delta) - targetDelta);
      const expectedMove = S * (c.iv || 0.2) * Math.sqrt(c.t || 0.1); // approximate expected move over expiry
      const moveToStrike = Math.abs(c.strike - S);
      const reachProb = Math.max(0, 1 - moveToStrike / (expectedMove + 1e-9));
      const expectedPayoff = Math.max(0, Math.abs(c.strike - S)) * reachProb - (c.lastPrice || 0);
      const payoffRatio = (c.lastPrice > 0) ? expectedPayoff / (c.lastPrice + 1e-9) : expectedPayoff;
      // combine into a score (higher better)
      const score = payoffRatio * 100 - deltaDiff * 50 - (c.iv || 0) * 10 - (c.days || 0) / 10;
      return { ...c, deltaDiff, expectedMove, reachProb, expectedPayoff, payoffRatio, score };
    }).sort((a: any, b: any) => b.score - a.score);

    const candidates = scored.slice(0, 200);
    const best = candidates.find((c: any) => (c.lastPrice || 0) <= maxPremium) ?? candidates[0] ?? null;

    return NextResponse.json({ symbol, underlying: S, side, targetDelta, daysToExpiry, best, candidates });
  } catch (e) {
    console.error('optionchain route error', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
