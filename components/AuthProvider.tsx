"use client";

import React, { createContext, useContext } from "react";

type AuthState = {
  isSignedIn: boolean;
  isLoaded: boolean;
  user: {
    id?: string;
    firstName?: string | null;
    lastName?: string | null;
    imageUrl?: string;
    primaryEmailAddress?: { emailAddress: string } | null;
  } | null;
  clerkAvailable: boolean;
};

const AuthContext = createContext<AuthState>({
  isSignedIn: false,
  isLoaded: true,
  user: null,
  clerkAvailable: false,
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function SafeSignInButton({ children }: { children: React.ReactNode; mode?: string; [k: string]: unknown }) {
  return <>{children}</>;
}

/**
 * SafeClerkProvider — renders children with a no-auth context.
 * Clerk dev keys don't work on production domains, so we skip Clerk entirely.
 * Auth is re-enabled when production Clerk keys are configured.
 */
export function SafeClerkProvider({
  children,
}: {
  publishableKey?: string;
  children: React.ReactNode;
}) {
  return (
    <AuthContext.Provider value={{ isSignedIn: false, isLoaded: true, user: null, clerkAvailable: false }}>
      {children}
    </AuthContext.Provider>
  );
}
