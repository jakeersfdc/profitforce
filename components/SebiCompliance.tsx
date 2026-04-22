/**
 * SEBI compliance components.
 *
 * Regulatory context (India):
 *  - SEBI (Research Analysts) Regulations, 2014
 *  - SEBI (Investment Advisers) Regulations, 2013
 *  - SEBI Master Circular on Research Analysts & IAs (latest)
 *
 * Every page that shows actionable market views (BUY/SELL/strike
 * recommendations) MUST display:
 *   1. Registration identity (RA/IA number, name, validity)
 *   2. Standard risk disclaimer ("market risks" + no guaranteed returns)
 *   3. Past-performance disclaimer
 *   4. Grievance redressal contact + SCORES link
 *   5. Conflict-of-interest / "no personal recommendation" note
 *
 * All values are driven from NEXT_PUBLIC_ env vars so the operator can
 * plug in their actual SEBI registration details without code changes.
 */

import Link from "next/link";

type Mode = "compact" | "full";

function getCompliance() {
  return {
    entityName: process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd",
    raNumber: process.env.NEXT_PUBLIC_SEBI_RA_NUMBER || "INH000000000",
    iaNumber: process.env.NEXT_PUBLIC_SEBI_IA_NUMBER || "",
    validity: process.env.NEXT_PUBLIC_SEBI_RA_VALIDITY || "Perpetual (Subject to SEBI renewal)",
    bseEnlistment: process.env.NEXT_PUBLIC_BSE_RA_ENLISTMENT || "",
    contactEmail: process.env.NEXT_PUBLIC_COMPLIANCE_EMAIL || "compliance@profitforce.in",
    grievanceEmail: process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || "grievance@profitforce.in",
    principalOfficer: process.env.NEXT_PUBLIC_PRINCIPAL_OFFICER || "",
    complianceOfficer: process.env.NEXT_PUBLIC_COMPLIANCE_OFFICER || "",
    officeAddress: process.env.NEXT_PUBLIC_OFFICE_ADDRESS || "",
  };
}

/** Thin top-of-page risk banner — shown on every actionable view. */
export function SebiRiskBanner() {
  return (
    <div className="w-full bg-amber-950/40 border-b border-amber-600/30 text-amber-200 text-[11px] px-4 py-1.5 text-center leading-tight">
      <span className="font-bold">⚠ Investments in securities market are subject to market risks.</span>
      {" "}Read all related documents carefully before investing. Registration granted by SEBI and
      certification from NISM in no way guarantee performance or provide any assurance of returns.
    </div>
  );
}

/** Per-signal compliance micro-note — render inside signal cards. */
export function SebiSignalNote({ className = "" }: { className?: string }) {
  const c = getCompliance();
  return (
    <div className={`text-[10px] text-white/40 leading-snug ${className}`}>
      <span className="text-amber-400/70 font-semibold">Research Call</span> by {c.entityName} · SEBI RA Reg. {c.raNumber}.
      Non-individualized · Derived from technical analysis of publicly available data. Past performance is not indicative of future results.
      Clients must independently verify suitability. No guaranteed returns.
    </div>
  );
}

/** Full compliance footer — site-wide, in the root layout. */
export function SebiComplianceFooter({ mode = "full" }: { mode?: Mode }) {
  const c = getCompliance();

  if (mode === "compact") {
    return (
      <footer className="w-full border-t border-white/5 bg-[#05060a] px-4 py-3 text-center text-[10px] text-white/40">
        <div>
          {c.entityName} · SEBI Research Analyst Reg. <span className="text-white/70 font-mono">{c.raNumber}</span>
          {c.iaNumber && <> · SEBI IA Reg. <span className="text-white/70 font-mono">{c.iaNumber}</span></>}
        </div>
        <div className="mt-0.5">Investments in securities market are subject to market risks. Read all related documents carefully before investing.</div>
      </footer>
    );
  }

  return (
    <footer className="w-full border-t border-white/10 bg-[#05060a] text-white/60 mt-8">
      <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-4 text-[11px] leading-relaxed">

        {/* Registration block */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Entity &amp; Registration</div>
            <div className="text-white/80 font-semibold">{c.entityName}</div>
            <div className="mt-1">SEBI Research Analyst Regn. No.: <span className="font-mono text-white/90">{c.raNumber}</span></div>
            {c.iaNumber && <div>SEBI Investment Adviser Regn. No.: <span className="font-mono text-white/90">{c.iaNumber}</span></div>}
            {c.bseEnlistment && <div>BSE Enlistment No.: <span className="font-mono text-white/90">{c.bseEnlistment}</span></div>}
            <div>Validity: {c.validity}</div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Key Personnel</div>
            {c.principalOfficer && <div>Principal Officer: <span className="text-white/80">{c.principalOfficer}</span></div>}
            {c.complianceOfficer && <div>Compliance Officer: <span className="text-white/80">{c.complianceOfficer}</span></div>}
            {c.officeAddress && <div className="mt-1">Registered Office: <span className="text-white/70">{c.officeAddress}</span></div>}
            <div className="mt-1">Compliance: <a className="text-blue-400 hover:underline" href={`mailto:${c.contactEmail}`}>{c.contactEmail}</a></div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Grievance Redressal</div>
            <div>For complaints: <a className="text-blue-400 hover:underline" href={`mailto:${c.grievanceEmail}`}>{c.grievanceEmail}</a></div>
            <div className="mt-1">
              Escalate unresolved complaints at SEBI SCORES:{" "}
              <a className="text-blue-400 hover:underline" href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">
                scores.sebi.gov.in
              </a>
            </div>
            <div className="mt-1">
              ODR portal (SEBI Smart ODR):{" "}
              <a className="text-blue-400 hover:underline" href="https://smartodr.in" target="_blank" rel="noopener noreferrer">
                smartodr.in
              </a>
            </div>
          </div>
        </div>

        {/* Standard disclaimers */}
        <div className="space-y-2">
          <p>
            <span className="font-bold text-amber-300">⚠ Standard Warning:</span>{" "}
            Investment in securities market are subject to market risks. Read all the related documents
            carefully before investing. Registration granted by SEBI, membership of BASL (in case of IAs)
            and certification from NISM in no way guarantee performance of the intermediary or provide any
            assurance of returns to investors.
          </p>
          <p>
            <span className="font-bold text-white/80">Nature of Service:</span>{" "}
            Content on this platform constitutes <em>non-individualized</em> research / trading signals
            derived from technical analysis of publicly available market data. It is <em>not</em> personal
            investment advice. Users must assess their own risk profile, investment objectives, and financial
            position — or consult a SEBI-registered Investment Adviser — before acting on any view expressed here.
          </p>
          <p>
            <span className="font-bold text-white/80">Past Performance Disclaimer:</span>{" "}
            Past performance of any strategy, backtest, model output, or signal is not indicative of future
            results. Derivatives (F&amp;O) trading carries a high risk of loss and is not suitable for every
            investor. Stop-loss levels may not be guaranteed under fast-market or gap conditions.
          </p>
          <p>
            <span className="font-bold text-white/80">Conflicts of Interest:</span>{" "}
            Research analysts, their relatives, or the entity may or may not hold positions in the
            securities mentioned. Detailed disclosures are maintained as per Regulation 19 of SEBI (Research
            Analysts) Regulations, 2014 and are available on request from the compliance officer.
          </p>
          <p>
            <span className="font-bold text-white/80">No Guaranteed Returns:</span>{" "}
            We do <em>not</em> promise assured or guaranteed profits. Any communication suggesting
            otherwise should be reported to our compliance team immediately.
          </p>
        </div>

        {/* Policy links */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/50 pt-2 border-t border-white/5">
          <Link href="/legal/terms" className="hover:text-white/80">Terms of Use</Link>
          <Link href="/legal/privacy" className="hover:text-white/80">Privacy Policy</Link>
          <Link href="/legal/risk-disclosure" className="hover:text-white/80">Risk Disclosure</Link>
          <Link href="/legal/investor-charter" className="hover:text-white/80">Investor Charter</Link>
          <Link href="/legal/complaints" className="hover:text-white/80">Complaint Board</Link>
          <Link href="/legal/conflict-of-interest" className="hover:text-white/80">Conflict of Interest Policy</Link>
          <Link href="/legal/disclosures" className="hover:text-white/80">Analyst Disclosures</Link>
        </div>

        <div className="text-[10px] text-white/30 text-center pt-2">
          © {new Date().getFullYear()} {c.entityName}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
