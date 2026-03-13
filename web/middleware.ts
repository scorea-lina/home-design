import { NextRequest, NextResponse } from 'next/server';

// All /api/jobs/* endpoints are gated by their own x-jobs-secret / CRON_SECRET auth.
const EXCLUDED = ['/api/jobs/'];

export function middleware(req: NextRequest) {
  const sitePassword = process.env.SITE_PASSWORD;

  // If no password configured, allow through (local dev convenience)
  if (!sitePassword) return NextResponse.next();

  // Skip excluded paths
  if (EXCLUDED.some((p) => req.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth.startsWith('Basic ')) {
    const decoded = atob(auth.slice(6));
    // Accept any username; only the password is checked
    const password = decoded.includes(':') ? decoded.split(':').slice(1).join(':') : decoded;
    if (password === sitePassword) return NextResponse.next();
  }

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Paradisa Home", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
