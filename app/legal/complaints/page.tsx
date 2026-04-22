const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";
const GRIEVANCE = process.env.NEXT_PUBLIC_GRIEVANCE_EMAIL || "grievance@profitforce.in";
const COMPLIANCE = process.env.NEXT_PUBLIC_COMPLIANCE_EMAIL || "compliance@profitforce.in";

export const metadata = { title: "Complaint Board" };

export default function Page() {
  return (
    <>
      <h1>Complaints Status Board</h1>
      <p className="text-white/50 text-xs">
        Published by {ENTITY} as per SEBI circular on Complaints Disclosure by Research Analysts.
      </p>

      <h2>A. Complaints Received (Last Month)</h2>
      <table>
        <thead>
          <tr>
            <th>Received From</th><th>Pending at start</th><th>Received</th><th>Resolved*</th><th>Pending at end</th><th>Pending {">"} 3 months</th><th>Avg Resolution (days)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Directly from Investors</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td></tr>
          <tr><td>SEBI (SCORES)</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td></tr>
          <tr><td>Other Sources</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>—</td></tr>
          <tr><td><strong>Grand Total</strong></td><td><strong>0</strong></td><td><strong>0</strong></td><td><strong>0</strong></td><td><strong>0</strong></td><td><strong>0</strong></td><td><strong>—</strong></td></tr>
        </tbody>
      </table>
      <p className="text-[11px] text-white/50">* Includes complaints pending at the beginning of the month.</p>

      <h2>B. Trend of Monthly Disposal</h2>
      <table>
        <thead>
          <tr><th>Month</th><th>Carried Forward</th><th>Received</th><th>Resolved</th><th>Pending</th></tr>
        </thead>
        <tbody>
          <tr><td>Current month</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>
        </tbody>
      </table>

      <h2>C. Raise a Complaint</h2>
      <ol className="list-decimal pl-6">
        <li>Email us at <a href={`mailto:${GRIEVANCE}`}>{GRIEVANCE}</a> — we will acknowledge within 2 working days and resolve within 21 working days.</li>
        <li>If unresolved, escalate to our Compliance Officer at <a href={`mailto:${COMPLIANCE}`}>{COMPLIANCE}</a>.</li>
        <li>For regulatory escalation, file on SEBI SCORES at <a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">scores.sebi.gov.in</a>.</li>
        <li>Online dispute resolution via <a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">smartodr.in</a>.</li>
      </ol>

      <p className="text-[11px] text-white/50 mt-4">Data on this page is updated within 7 days of month-end.</p>
    </>
  );
}
