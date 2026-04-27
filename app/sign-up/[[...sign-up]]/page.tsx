import Link from "next/link";

/**
 * Public sign-ups are disabled. ProfitForce is invite-only — admins create
 * users from the Clerk dashboard and share credentials directly.
 */
export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1c] p-4">
      <div className="max-w-md w-full rounded-xl border border-gray-700 bg-[#1a2235] shadow-2xl p-6 text-center">
        <h1 className="text-xl font-semibold text-white mb-2">Invite only</h1>
        <p className="text-sm text-white/70 mb-4">
          ProfitForce is currently invite-only. New access is provisioned by the
          admin team. Reach out at{" "}
          <a
            href="mailto:admin@profitforce.in"
            className="text-emerald-300 underline"
          >
            admin@profitforce.in
          </a>{" "}
          to request an account.
        </p>
        <Link
          href="/sign-in"
          className="inline-block rounded-md bg-emerald-500 hover:bg-emerald-400 px-4 py-2 text-sm font-medium text-black"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}