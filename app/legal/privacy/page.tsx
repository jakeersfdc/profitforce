const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";

export const metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-white/50 text-xs">Compliant with the Digital Personal Data Protection Act, 2023 and the IT Act, 2000.</p>

      <h2>1. Data We Collect</h2>
      <ul>
        <li><strong>Identity &amp; KYC:</strong> name, email, phone, PAN, address (for regulatory KYC as mandated by SEBI).</li>
        <li><strong>Usage:</strong> pages viewed, signals accessed, device/browser metadata.</li>
        <li><strong>Trading:</strong> broker connections, order IDs, positions (only when you voluntarily link a broker).</li>
        <li><strong>Payment:</strong> invoice metadata via our PCI-compliant payment processor. We do not store card numbers.</li>
      </ul>

      <h2>2. Purpose</h2>
      <ul>
        <li>Deliver research services and manage your subscription.</li>
        <li>Meet regulatory record-keeping obligations under SEBI regulations.</li>
        <li>Detect and prevent fraud, abuse, and security incidents.</li>
      </ul>

      <h2>3. Legal Basis</h2>
      <p>We process personal data based on your consent, the performance of a contract with you, or compliance with legal obligations under SEBI and tax laws.</p>

      <h2>4. Sharing</h2>
      <p>We share personal data only with: (a) regulators and law-enforcement when legally required; (b) auditors and service providers bound by confidentiality; (c) your linked broker, strictly for order execution you have authorised.</p>

      <h2>5. Retention</h2>
      <p>We retain recommendation records and related communications for a minimum of <strong>5 years</strong> as required by SEBI (Research Analysts) Regulations, 2014. Other personal data is retained only as long as necessary for the purposes above.</p>

      <h2>6. Your Rights</h2>
      <ul>
        <li>Access, correction, erasure of personal data (subject to regulatory retention).</li>
        <li>Withdraw consent for non-essential processing at any time.</li>
        <li>File a complaint with the Data Protection Board of India.</li>
      </ul>

      <h2>7. Security</h2>
      <p>Data is encrypted in transit (TLS) and at rest. Access is restricted and logged. Still, no system is entirely immune from breach — report any suspected incident to <a href="mailto:security@profitforce.in">security@profitforce.in</a>.</p>

      <h2>8. Contact</h2>
      <p>Data Protection Officer, {ENTITY} — <a href="mailto:dpo@profitforce.in">dpo@profitforce.in</a>.</p>
    </>
  );
}
