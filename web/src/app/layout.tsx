import type { Metadata } from 'next';
import Link from 'next/link';
import { EB_Garamond } from 'next/font/google';

import './globals.css';

const ebGaramond = EB_Garamond({
  variable: '--font-eb-garamond',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Home Project Hub',
  description: 'Local-first home project hub',
};

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-[15px] font-semibold text-cream-800 transition-colors hover:bg-cream-300/60 hover:text-cream-950"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${ebGaramond.variable} antialiased`}>
        <div className="min-h-screen bg-cream-200 text-cream-950">
          <div className="mx-auto grid max-w-7xl grid-cols-[200px_1fr] gap-6 px-4 py-6">
            <aside className="rounded-2xl border border-cream-400/60 bg-cream-100/80 p-5 shadow-warm backdrop-blur-sm">
              <div className="mb-5">
                <div className="text-base font-semibold tracking-tight text-cream-900">Home Project Hub</div>
              </div>

              <div className="grid gap-0.5">
                <NavLink href="/">Tracker</NavLink>
                <NavLink href="/links">Links</NavLink>
                <NavLink href="/images">Images</NavLink>
                <NavLink href="/inbox">Inbox</NavLink>
                <NavLink href="/archive">Archived</NavLink>
              </div>
            </aside>

            <main className="min-w-0 rounded-2xl border border-cream-400/60 bg-white/70 p-6 shadow-warm backdrop-blur-sm">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
