'use client';

import { supabase } from "@/lib/supabaseClient";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";

export default function LoginPage() {
    const session = supabase.auth.getSession();

    if (!session) {
        
    } else {
        window.location.href = "/editor";
    }

    return (
        <div className="flex items-center justify-center h-screen">
            <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                // theme="dark"
                providers={[]}
                socialLayout="horizontal"
                redirectTo="/editor"
            />
        </div>
    );
}