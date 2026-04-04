// Minimal Sentry client initializer for the Next.js app.
// Use dynamic import so build does not fail when `@sentry/nextjs` is not installed.
const SentryProxy: any = {};

(async () => {
  try {
    const pkg = '@sentry/nextjs';
    const mod: any = await import(pkg);
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      mod.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.05 });
    }
    Object.assign(SentryProxy, mod);
  } catch (e) {
    // provide no-op fallback so application can run without Sentry installed
    SentryProxy.init = () => {}; SentryProxy.captureException = () => {}; SentryProxy.captureMessage = () => {};
  }
})();

export default SentryProxy;
