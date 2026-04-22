'use client'
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckoutPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pricing');
  }, [router]);
  return (
    <div className="min-h-screen bg-[#040915] flex items-center justify-center text-white">
      <p>Redirecting to pricing…</p>
    </div>
  );
}
