"use client";

import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function LogoutForm() {
  const router = useRouter();
  const supabase = createClientComponentClient();

  async function handleLogout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <form onSubmit={handleLogout} className="inline">
      <button
        type="submit"
        className="w-36 py-2 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border-none cursor-pointer rounded-lg mt-4"
      >
        Logout
      </button>
    </form>
  );
}