import BrokerSettings from "./broker";
import PFAccountPanel from "./pfAccount";

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-[#060d1f] text-white">
      <div className="max-w-2xl mx-auto py-10">
        <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>
        <PFAccountPanel />
        <BrokerSettings />
      </div>
    </main>
  );
}
