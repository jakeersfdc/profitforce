const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";
const RA = process.env.NEXT_PUBLIC_SEBI_RA_NUMBER || "INH000000000";

export const metadata = { title: "Analyst Disclosures" };

export default function Page() {
  return (
    <>
      <h1>Research Analyst Disclosures</h1>
      <p className="text-white/50 text-xs">
        Disclosures made pursuant to Regulation 19 of SEBI (Research Analysts) Regulations, 2014 by {ENTITY} (SEBI RA Reg. {RA}).
      </p>

      <h2>1. Analyst Certification</h2>
      <p>The research analyst(s) primarily responsible for the preparation of reports and signals on this platform certify that the views expressed accurately reflect their personal views about the subject securities and that no part of their compensation is, or will be, directly or indirectly related to the specific recommendations or views expressed.</p>

      <h2>2. Financial Interest</h2>
      <p>Neither {ENTITY} nor its research analysts or their relatives hold any financial interest (including actual/beneficial ownership of 1% or more) in the subject companies at the time of publication, except where explicitly disclosed alongside a specific report.</p>

      <h2>3. Compensation</h2>
      <p>{ENTITY} has not received any compensation from the subject companies in the past twelve months for investment-banking, merchant-banking, brokerage, or any other services. Research analysts are compensated on a fixed-salary basis with no incentives linked to specific recommendations.</p>

      <h2>4. Position in Securities</h2>
      <p>Research analysts and their relatives may, from time to time, hold positions in the securities mentioned. Any such position at the time of publication is disclosed at the end of the respective report. Analysts are prohibited from dealing in a subject security for 30 days before and 5 days after publication of a report concerning that security.</p>

      <h2>5. Conflicts of Interest</h2>
      <p>Any actual or potential conflict of interest — including relationships with issuers, directorships, or ownership links — is disclosed on the face of each research report. A register of such conflicts is maintained by our Compliance Officer and is available for regulatory inspection.</p>

      <h2>6. Distribution &amp; Reproduction</h2>
      <p>Reports are intended only for clients of {ENTITY} and must not be redistributed, reproduced, or used for any commercial purpose without prior written consent. Unauthorised use may constitute infringement and regulatory violation.</p>

      <h2>7. Jurisdiction</h2>
      <p>This content is directed only at residents of India. It is not intended for distribution to, or use by, any person or entity in any jurisdiction where such distribution or use would be contrary to local law or regulation.</p>
    </>
  );
}
