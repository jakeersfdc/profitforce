const ENTITY = process.env.NEXT_PUBLIC_SEBI_ENTITY_NAME || "ProfitForce Technologies Pvt Ltd";

export const metadata = { title: "Terms of Use" };

export default function Page() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p className="text-white/50 text-xs">Effective date: {new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long" })}</p>

      <h2>1. Acceptance</h2>
      <p>By accessing this platform you agree to these Terms of Use, our Privacy Policy, and the Risk Disclosure Document. If you do not agree, do not use the platform.</p>

      <h2>2. Nature of Service</h2>
      <p>{ENTITY} is a SEBI-registered Research Analyst. Content on this platform constitutes non-individualized research, trading signals, and educational material. It is <strong>not</strong> personal investment advice and does not take into account your specific investment objectives, financial situation, or needs.</p>

      <h2>3. Eligibility</h2>
      <p>You must be a resident of India, at least 18 years of age, and legally capable of entering into a binding contract. You must not be barred from trading under Indian securities laws.</p>

      <h2>4. No Guaranteed Returns</h2>
      <p>We do not promise or guarantee any profit, return, or outcome. All trading and investment decisions are made at your sole discretion and risk.</p>

      <h2>5. Fees</h2>
      <p>Subscription fees, if any, are disclosed upfront on the Pricing page. Fees are exclusive of applicable GST and are non-refundable except as required by law or the SEBI RA regulations.</p>

      <h2>6. Intellectual Property</h2>
      <p>All content, models, algorithms, and reports on this platform are the intellectual property of {ENTITY}. You may not reproduce, redistribute, or commercially exploit any content without prior written consent.</p>

      <h2>7. Prohibited Conduct</h2>
      <ul>
        <li>Scraping, reverse-engineering, or automated access without consent.</li>
        <li>Sharing login credentials or reselling signals.</li>
        <li>Using the platform to manipulate markets or violate SEBI regulations.</li>
      </ul>

      <h2>8. Limitation of Liability</h2>
      <p>To the maximum extent permitted by law, {ENTITY}, its directors, employees, and analysts are not liable for any direct, indirect, incidental, consequential, or punitive damages arising from your use of, or inability to use, the platform.</p>

      <h2>9. Governing Law &amp; Jurisdiction</h2>
      <p>These terms are governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in the city of our registered office, subject to SEBI&apos;s ODR mechanism.</p>

      <h2>10. Amendments</h2>
      <p>We may amend these Terms from time to time. Continued use after any amendment constitutes acceptance of the revised Terms.</p>
    </>
  );
}
