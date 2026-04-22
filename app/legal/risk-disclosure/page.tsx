const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";
const RA = process.env.NEXT_PUBLIC_SEBI_RA_NUMBER || "INH000000000";

export const metadata = { title: "Risk Disclosure" };

export default function Page() {
  return (
    <>
      <h1>Risk Disclosure Document</h1>
      <p className="text-white/50 text-xs">Issued pursuant to SEBI (Research Analysts) Regulations, 2014 by {ENTITY} (SEBI RA Reg. {RA}).</p>

      <h2>1. Market Risk</h2>
      <p>Investments in the securities market are subject to market risks. The value of investments and the income from them can fall as well as rise. There is no assurance that the investment objective of any strategy or signal will be achieved.</p>

      <h2>2. Derivatives / F&amp;O Risk</h2>
      <p>Trading in derivatives (futures and options) carries a <strong>high degree of risk</strong> including the risk of losing more than the initial margin. You should carefully consider whether such trading is appropriate for you in the light of your financial condition, trading experience, and risk appetite.</p>
      <ul>
        <li>Option buyers can lose 100% of premium paid.</li>
        <li>Option sellers face potentially unlimited losses.</li>
        <li>Leverage amplifies both gains and losses.</li>
        <li>Expiry-day and gap-open moves can cause stop-losses to slip significantly.</li>
      </ul>

      <h2>3. Liquidity &amp; Execution Risk</h2>
      <p>Fast-market, pre-open, post-close, and upper/lower circuit conditions may prevent execution at quoted levels. Stop-loss orders do not guarantee a fill at the stop price.</p>

      <h2>4. Technology &amp; Data Risk</h2>
      <p>Signals are computed from third-party market data feeds which may be delayed, incorrect, or unavailable. {ENTITY} is not liable for losses arising from data errors, feed outages, broker connectivity issues, or application downtime.</p>

      <h2>5. Model / Backtest Risk</h2>
      <p>Machine-learning models, backtests, and historical performance figures are hypothetical. Past performance is <strong>not</strong> a guarantee, warranty, or reliable indicator of future results.</p>

      <h2>6. Suitability</h2>
      <p>Content on this platform is <strong>non-individualized</strong> research. It does not account for your personal investment objectives, tax situation, or risk capacity. You are strongly encouraged to consult a SEBI-registered Investment Adviser before acting on any view.</p>

      <h2>7. No Guaranteed Returns</h2>
      <p>{ENTITY} does not promise or guarantee any specific return, profit, or outcome. Any person or communication suggesting guaranteed returns is acting outside the scope of our authorised services and should be reported to our compliance team.</p>

      <h2>8. Acknowledgement</h2>
      <p>By using this platform you acknowledge that you have read, understood, and accepted the risks set out above.</p>
    </>
  );
}
