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

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error) {
    console.error("Error fetching user data:", error);
  }

  const user = data || session.user;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex h-screen w-full items-center justify-center flex-col">
      <h1 className="text-4xl font-semibold">{greeting}, <span className="text-blue-500">{user.name || 'guest'}</span>!</h1>
      <div className="flex flex-col items-center justify-center mt-12 gap-2">
        {Object.values(navLinks).map((link) => (
          <a
            key={link.label}
            href={link.link}
            className="text-blue-500 bg-blue-500/10 w-36 py-2 flex items-center justify-center rounded-lg border-none p-0 cursor-pointer transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-lg shadow-blue-900/10"
          >
            {link.label}
          </a>
        ))}
        <LogoutForm />
      </div>
      <footer className="absolute bottom-7">
          <p className="text-xs lg:text-sm mt-2 opacity-50">© {new Date().getFullYear()} <a href="https://sf.otamaps.fi" className="hover:underline transition-all duration-300 ease-in-out">OtaMaps ry</a>. All rights reserved.</p>
      </footer>
    </div>
  );
}