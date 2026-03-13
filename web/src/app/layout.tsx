import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';

import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Home Project Hub',
  description: 'Local-first home project hub',
};

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 hover:text-white"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="min-h-screen bg-zinc-950 text-zinc-50">
          <div className="mx-auto grid max-w-7xl grid-cols-[260px_1fr] gap-6 px-4 py-6">
            <aside className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="mb-4">
                <div className="text-base font-semibold">Home Project Hub</div>
              </div>

              <div className="grid gap-1">
                <NavLink href="/">Tracker</NavLink>
                <NavLink href="/links">Links</NavLink>
                <NavLink href="/images">Images</NavLink>
                <NavLink href="/inbox">Inbox</NavLink>
                <NavLink href="/archive">Archived</NavLink>
              </div>
            </aside>

            <main className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
