const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";

export const metadata = { title: "Conflict of Interest Policy" };

export default function Page() {
  return (
    <>
      <h1>Conflict of Interest Policy</h1>
      <p className="text-white/50 text-xs">Framework adopted by {ENTITY} under Regulation 16 of SEBI (Research Analysts) Regulations, 2014.</p>

      <h2>1. Identification</h2>
      <p>A conflict of interest arises where personal, financial, or relational interests of the analyst (or the entity or their relatives) could reasonably be perceived to affect the objectivity of a recommendation.</p>

      <h2>2. Prohibited Activities</h2>
      <ul>
        <li>Trading in a security during the 30 days before and 5 days after a research report is published on that security.</li>
        <li>Receiving any compensation from issuers for favorable coverage.</li>
        <li>Acting in a merchant-banking or underwriting capacity for a covered issuer.</li>
        <li>Front-running client trades or sharing non-public research ahead of publication.</li>
      </ul>

      <h2>3. Segregation of Activities</h2>
      <p>Research activity is segregated from any other business line that may cause a conflict. Information barriers (Chinese walls) are maintained between research and any proprietary-trading function.</p>

      <h2>4. Disclosure</h2>
      <p>Every research report discloses: (a) analyst and entity holdings in the subject security (if any); (b) compensation received from the issuer in the past 12 months; (c) any other material conflict known to the analyst.</p>

      <h2>5. Personal Trading Policy</h2>
      <p>All analysts are required to pre-clear personal trades with the Compliance Officer and maintain a personal-trading log subject to audit.</p>

      <h2>6. Training &amp; Supervision</h2>
      <p>Analysts complete mandatory NISM-XV certification and annual refresher training on conflicts, insider trading, and fair-dealing rules.</p>

      <h2>7. Reporting Violations</h2>
      <p>Violations of this policy must be reported to the Compliance Officer immediately. Whistleblower reports are protected.</p>
    </>
  );
}
