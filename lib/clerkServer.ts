import { auth } from '@clerk/nextjs/server';

export async function requireUser() {
  const { userId } = await auth();
  if (!userId) {
    throw new Error('Unauthenticated');
  }
  return userId;
}

export async function getUserIdSafe() {
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch (e) {
    return null;
  }
}
