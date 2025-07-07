// app/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Example: Check for Supabase auth token or redirect
  const token = request.cookies.get('supabase-auth-token')?.value;
  if (!token && request.nextUrl.pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/', 
    '/dashboard/:path*', 
    '/profile/:path*',
    '/editor/:path*',
    '/buildings/:path*',
    '/moderation/:path*',
    '/users/:path*',
    '/events/:path*',
  ]
};