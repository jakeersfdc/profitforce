import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1c] p-4">
      <SignIn 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-[#1a2235] border border-gray-700 shadow-2xl",
          },
        }}
      />
    </div>
  );
}