import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/'];

function isProtectedRoute(pathname: string) {
  return !PUBLIC_PATHS.includes(pathname)
    && !pathname.startsWith('/_next')
    && !pathname.startsWith('/api')
    && !pathname.startsWith('/favicon')
    && !pathname.startsWith('/assets')
    && !pathname.includes('.')
    && pathname !== '/';
}

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;
  
  // Security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:3001 http://127.0.0.1:3001; frame-ancestors 'none'; base-uri 'self'; form-action 'self';"
  );
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  const hasSessionCookie = Boolean(request.cookies.get('awiknet_session')?.value);

  if (isProtectedRoute(pathname) && !hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
  
  // Block direct access to API routes from browser
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    return NextResponse.next();
  }
  
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
