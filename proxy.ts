import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Next.js 16 uses proxy.ts (replacement for middleware.ts).
// clerkMiddleware() attaches auth context so server-side `auth()` works in API routes
// AND auth.protect() redirects unauthenticated users to /sign-in for protected pages.
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/profile(.*)',
  '/checkout(.*)',
  '/admin(.*)',
  '/api/broker/(.*)',
  '/api/profile/(.*)',
  '/api/admin/(.*)',
  '/api/billing/(.*)',
  '/api/trade/(.*)',
  '/api/watchlist/(.*)',
  '/api/alerts/(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
