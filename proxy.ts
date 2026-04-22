import { clerkMiddleware } from '@clerk/nextjs/server';

// Next.js 16 uses proxy.ts (replacement for middleware.ts).
// clerkMiddleware() attaches auth context so server-side `auth()` works in API routes.
// We DO NOT call `auth.protect()` here, so no routes are auto-redirected — prevents
// the dev-key redirect loops that hit production earlier. Page-level guards handle
// protected surfaces.
export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
