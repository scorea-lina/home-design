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
                <div className="text-xs uppercase tracking-wide text-zinc-400">Paradisa</div>
                <div className="text-base font-semibold">Home Project Hub</div>
              </div>

              <div className="mb-4 grid gap-1">
                <div className="mb-1 text-xs font-medium text-zinc-400">Primary</div>
                <NavLink href="/">Kanban</NavLink>
                <NavLink href="/inbox">Inbox</NavLink>
              </div>

              <div className="grid gap-1">
                <div className="mb-1 text-xs font-medium text-zinc-400">Explore</div>
                <NavLink href="/search">Search</NavLink>
                <NavLink href="/transcripts">Transcripts</NavLink>
                <NavLink href="/canvas">Canvas</NavLink>
                <NavLink href="/settings">Settings</NavLink>
              </div>

              <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs text-zinc-300">
                <div className="font-medium">M0 scaffold</div>
                <div className="text-zinc-400">UI shells + SQLite migrations</div>
              </div>
            </aside>

            <main className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
