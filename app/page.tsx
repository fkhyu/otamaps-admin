import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LogoutForm from "./components/LogoutForm";
import { navLinks } from "./navLinks";

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen w-full items-center justify-center flex-col">
      <h1 className="text-3xl font-medium">Welcome, {session.user.email}</h1>
      <div className="flex flex-col items-center justify-center mt-16 gap-4">
        {Object.values(navLinks).map((link) => (
          <a
            key={link.label}
            href={link.link}
            className="text-blue-500 hover:underline bg-transparent border-none p-0 cursor-pointer"
          >
            {link.label}
          </a>
        ))}
        <LogoutForm />
      </div>
    </div>
  );
}
