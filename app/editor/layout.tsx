// app/editor/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from "next/navigation";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default async function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createServerComponentClient({ cookies });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // console.log("EditorLayout session:", session);

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      {/* {session ? children : (
        <div className="flex h-screen w-full items-center justify-center flex-col text-red-400">
          Access Denied: Please log in
          <form action="/login" method="get">
            <button type="submit" className="cursor-pointer px-4 py-2 bg-blue-500/10 mt-4 rounded-lg text-blue-400">Log in</button>
          </form>
        </div>
      )} */}
      {children}
    </div>
  );
}