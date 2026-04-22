const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";
const RA = process.env.NEXT_PUBLIC_SEBI_RA_NUMBER || "INH000000000";

export const metadata = { title: "Investor Charter" };

export default function Page() {
  return (
    <>
      <h1>Investor Charter for Research Analysts</h1>
      <p className="text-white/50 text-xs">
        Published by {ENTITY} (SEBI Research Analyst Reg. No. {RA}) in accordance with the SEBI
        circular on Investor Charter for Research Analysts.
      </p>

      <h2>A. Vision</h2>
      <p>To provide objective, independent, and rigorously researched market views that help investors make informed decisions — while upholding the highest standards of integrity, transparency, and compliance with SEBI regulations.</p>

      <h2>B. Mission</h2>
      <ul>
        <li>Deliver research reports and signals based solely on publicly available data and disciplined analysis.</li>
        <li>Disclose all material conflicts of interest.</li>
        <li>Maintain records of every recommendation for audit and regulatory review.</li>
        <li>Offer fair and timely grievance redressal.</li>
      </ul>

      <h2>C. Services Provided</h2>
      <ul>
        <li>Non-individualised research reports and trading signals on equities, indices, and derivatives.</li>
        <li>Model-driven technical analysis, ensemble ML predictions, option strike suggestions.</li>
        <li>Educational content on risk management and technical indicators.</li>
      </ul>

      <h2>D. Rights of Investors</h2>
      <ul>
        <li>Right to receive clear, unbiased research.</li>
        <li>Right to know the analyst&apos;s registration number and credentials.</li>
        <li>Right to view material conflicts of interest and holdings disclosures.</li>
        <li>Right to timely resolution of grievances.</li>
      </ul>

      <h2>E. Expectations from Investors (Do&apos;s and Don&apos;ts)</h2>
      <h3>Do&apos;s</h3>
      <ul>
        <li>Deal only with SEBI-registered Research Analysts — verify at <a href="https://sebi.gov.in" target="_blank" rel="noopener noreferrer">sebi.gov.in</a>.</li>
        <li>Always read the Risk Disclosure Document before acting on any recommendation.</li>
        <li>Assess your own risk tolerance and investment horizon.</li>
        <li>Maintain records of all recommendations received and actions taken.</li>
      </ul>
      <h3>Don&apos;ts</h3>
      <ul>
        <li>Do not fall for claims of assured or guaranteed returns.</li>
        <li>Do not share trading credentials, OTPs, or personal credentials.</li>
        <li>Do not trade on tips received on unverified social media channels.</li>
        <li>Do not execute trades without understanding the product.</li>
      </ul>

      <h2>F. Grievance Redressal Mechanism</h2>
      <ol className="list-decimal pl-6">
        <li>Raise your complaint with us first at <a href={`mailto:${process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || "grievance@profitforce.in"}`}>{process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || "grievance@profitforce.in"}</a>. We will acknowledge within <strong>2 working days</strong> and resolve within <strong>21 working days</strong>.</li>
        <li>If unresolved, escalate to SEBI SCORES at <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">scores.sebi.gov.in</a>.</li>
        <li>Unresolved complaints may be referred to SEBI&apos;s Online Dispute Resolution (ODR) portal at <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">smartodr.in</a>.</li>
      </ol>

      <h2>G. Service Standards (Timelines)</h2>
      <table>
        <thead>
          <tr><th>Activity</th><th>Timeline</th></tr>
        </thead>
        <tbody>
          <tr><td>Onboarding / KYC</td><td>T+1 working day</td></tr>
          <tr><td>Acknowledgement of complaint</td><td>2 working days</td></tr>
          <tr><td>Resolution of complaint</td><td>21 working days</td></tr>
          <tr><td>Escalation to SCORES</td><td>If unresolved beyond 21 days</td></tr>
        </tbody>
      </table>
    </>
  );
}
