"use client";

/**
 * AuthProvider — wraps the app in Clerk when a publishable key is configured,
 * otherwise renders a no-auth context (offline / preview builds).
 *
 * Re-exports a unified `useAuth` shape that works in both modes so the rest of
 * the app doesn't need to know which provider is active.
 */

import React, { createContext, useContext } from "react";
import {
  ClerkProvider,
  SignInButton as ClerkSignInButton,
  useAuth as useClerkAuth,
  useUser as useClerkUser,
} from "@clerk/nextjs";

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

const FALLBACK: AuthState = {
  isSignedIn: false,
  isLoaded: true,
  user: null,
  clerkAvailable: false,
};

const AuthContext = createContext<AuthState>(FALLBACK);

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { user } = useClerkUser();
  const value: AuthState = {
    isSignedIn: !!isSignedIn,
    isLoaded: !!isLoaded,
    user: user
      ? {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          imageUrl: user.imageUrl,
          primaryEmailAddress: user.primaryEmailAddress
            ? { emailAddress: user.primaryEmailAddress.emailAddress }
            : null,
        }
      : null,
    clerkAvailable: true,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

export function SafeSignInButton({
  children,
  mode = "redirect",
}: {
  children: React.ReactNode;
  mode?: "redirect" | "modal";
  [k: string]: unknown;
}) {
  return <ClerkSignInButton mode={mode}>{children}</ClerkSignInButton>;
}

export function SafeClerkProvider({
  publishableKey,
  children,
}: {
  publishableKey?: string;
  children: React.ReactNode;
}) {
  if (!publishableKey) {
    return <AuthContext.Provider value={FALLBACK}>{children}</AuthContext.Provider>;
  }
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}
