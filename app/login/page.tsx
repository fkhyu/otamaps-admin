'use client';

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push("/"); // redirect if already logged in
      }
    });

    // Optional: listen for auth changes to handle sign-in/sign-out events
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.push("/");
      }
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen bg-gray-950">
      <Auth
        supabaseClient={supabase}
        view="sign_in"
        showLinks={false}
        localization={{
          variables: {
            sign_in: {
              email_label: "Email",
              email_input_placeholder: "Enter your email",
              password_label: "Password",
              button_label: "Log In",
              link_text: "Forgot your password?",
            }
          },
        }}
        appearance={{
          theme: ThemeSupa,
          variables: {
            default: {
              colors: {
                brand: "#1c81db",
                brandAccent: '#449dec'
              }
            },
            
          },
          extend: true,
          style: {
            input: { color: 'white', background: '#1e2939', border: '#364153' },
          }
        }}
        providers={[]}
        redirectTo={typeof window !== 'undefined' ? window.location.origin + '/' : undefined}
      />
    </div>
  );
}
