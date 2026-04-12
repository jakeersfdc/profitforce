# Expo mobile scaffold

This is a minimal Expo app scaffold that demonstrates calling the web API `/api/predict` or `/api/predict/ensemble` and a placeholder for Clerk auth (web-based OAuth redirect recommended).

Quick start:

1. Install Expo CLI: `npm install -g expo-cli`
2. From this folder: `npm install` then `npm start`

Notes:
- For production-ready Clerk integration on mobile, follow Clerk mobile docs and use OAuth web flow.
- This scaffold is intentionally minimal; ask me to expand it into a full Expo app wired to Clerk.
 
Mobile OAuth & deep link notes

1. Configure a web OAuth redirect in your Clerk application pointing to your app's deep link (e.g. `myapp://callback`) and also the web sign-in URL.
2. In Expo, define a scheme in `app.json` or `app.config.js` (e.g. `scheme: "ProfitForce"`) and add the redirect to Clerk as `ProfitForce://callback`.
3. Use the web-based OAuth flow: open the Clerk sign-in URL in `WebBrowser.openBrowserAsync()` (or `Linking.openURL`) and handle the redirect in `Linking.addEventListener('url', ...)` to capture the auth token or session transfer.

Limitations: This scaffold only provides placeholders and open/redirect helpers. Full secure mobile auth requires backend session exchange to securely issue tokens to the mobile app. Ask me to implement the full flow and I will add the server-side handshake and deep-link handling.
Expo mobile example (Clerk + predict)
=====================================

This directory contains a minimal Expo app demonstrating:
- Sign-in using Clerk (OAuth / web flow)
- Call to `/api/predict/ensemble` with backend proxy (requires Clerk session cookie or Bearer token)

Setup
-----
1. Create a Clerk application and add a redirect URI for `exp://` or your local Expo dev URL.
2. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in the deployed web app and `CLERK_SECRET_KEY` in the server.
3. Start the Expo app (example code to be added). This repo includes placeholders; use Clerk's React Native docs to wire the SDK.

Note: This is an example scaffold. For production mobile apps use Clerk's recommended SDK and secure token exchange.
