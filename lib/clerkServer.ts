import { auth } from '@clerk/nextjs/server';

export function requireUser() {
  const { userId } = auth();
  if (!userId) {
    throw new Error('Unauthenticated');
  }
  return userId;
}

export function getUserIdSafe() {
  try {
    const { userId } = auth();
    return userId ?? null;
  } catch (e) {
    return null;
  }
}
