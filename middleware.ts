import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Routes that require authentication. Public marketing pages (/, /pricing,
 * /sign-in, /sign-up) and public APIs (/api/health, /api/indices, etc.) remain
 * accessible without a session.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/profile(.*)",
  "/checkout(.*)",
  "/admin(.*)",
  "/api/broker/(.*)",
  "/api/profile/(.*)",
  "/api/admin/(.*)",
  "/api/billing/(.*)",
  "/api/trade/(.*)",
  "/api/watchlist/(.*)",
  "/api/alerts/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
