import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
    const res = NextResponse.next();
    
    // Check if user is accessing protected routes
    const protectedRoutes = ['/editor', '/buildings', '/moderation', '/users', '/events'];
    const isProtectedRoute = protectedRoutes.some(route => req.nextUrl.pathname.startsWith(route));
    
    if (isProtectedRoute) {
        // For protected routes, we'll handle auth check on the client side
        // This middleware just ensures the route is accessible
        return res;
    }
    
    return res;
}

export const config = {
    matcher: ['/', 'dashboard/:path*', 'profile/:path*']
}