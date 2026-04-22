import { NextResponse } from 'next/server';

// Popular Indian mutual fund NAVs via yahoo-finance2
const MF_SYMBOLS = [
  { symbol: '0P0000XVAP.BO', name: 'SBI Bluechip Fund', category: 'Large Cap', amc: 'SBI' },
  { symbol: '0P0000XVAA.BO', name: 'HDFC Top 100 Fund', category: 'Large Cap', amc: 'HDFC' },
  { symbol: '0P0000XVAL.BO', name: 'ICICI Pru Bluechip', category: 'Large Cap', amc: 'ICICI' },
  { symbol: '0P0000XVD8.BO', name: 'Axis Bluechip Fund', category: 'Large Cap', amc: 'Axis' },
  { symbol: '0P0000XVAB.BO', name: 'Mirae Asset Large Cap', category: 'Large Cap', amc: 'Mirae' },
  { symbol: '0P0000XVBF.BO', name: 'Kotak Flexi Cap Fund', category: 'Flexi Cap', amc: 'Kotak' },
  { symbol: '0P0000XVD7.BO', name: 'Parag Parikh Flexi Cap', category: 'Flexi Cap', amc: 'PPFAS' },
  { symbol: '0P0000XVAN.BO', name: 'SBI Small Cap Fund', category: 'Small Cap', amc: 'SBI' },
  { symbol: '0P0000XVAO.BO', name: 'Nippon Small Cap Fund', category: 'Small Cap', amc: 'Nippon' },
  { symbol: '0P0000XVB6.BO', name: 'HDFC Mid-Cap Opp Fund', category: 'Mid Cap', amc: 'HDFC' },
  { symbol: '0P0000XVAK.BO', name: 'Kotak Emerging Equity', category: 'Mid Cap', amc: 'Kotak' },
  { symbol: '0P0000XVB9.BO', name: 'Axis Midcap Fund', category: 'Mid Cap', amc: 'Axis' },
];

// In-memory cache (30s TTL for MF NAVs)
let _mfCache: { ts: number; data: any[] } | null = null;
const MF_CACHE_TTL = 30_000;

export async function GET() {
  try {
    if (_mfCache && Date.now() - _mfCache.ts < MF_CACHE_TTL) {
      return NextResponse.json({ funds: _mfCache.data });
    }

    // Try fetching NAVs from yahoo-finance2
    let funds: any[] = [];
    try {
      const mod: any = await import('yahoo-finance2');
      const YahooFinance = mod.default ?? mod.YahooFinance ?? mod;
      let yf: any;
      if (typeof YahooFinance === 'function') {
        try { yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] }); }
        catch { yf = new YahooFinance(); }
      } else {
        yf = YahooFinance;
      }

      const results = await Promise.allSettled(
        MF_SYMBOLS.map(async (mf) => {
          try {
            const quote = await yf.quote(mf.symbol);
            return {
              symbol: mf.symbol,
              name: mf.name,
              category: mf.category,
              amc: mf.amc,
              nav: quote?.regularMarketPrice ?? quote?.previousClose ?? null,
              change: quote?.regularMarketChange ?? null,
              changePct: quote?.regularMarketChangePercent ?? null,
            };
          } catch {
            return { symbol: mf.symbol, name: mf.name, category: mf.category, amc: mf.amc, nav: null, change: null, changePct: null };
          }
        })
      );

      funds = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map(r => r.value);
    } catch {
      // Fallback: return MF list without NAVs
      funds = MF_SYMBOLS.map(mf => ({ ...mf, nav: null, change: null, changePct: null }));
    }

    _mfCache = { ts: Date.now(), data: funds };
    return NextResponse.json({ funds });
  } catch (error) {
    console.error('MF fetch error:', error);
    return NextResponse.json({ funds: [] }, { status: 500 });
  }
}
