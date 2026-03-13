import Link from "next/link";
import { LinksList } from "@/components/links/LinksList";

export const dynamic = "force-dynamic";

export default function LinksPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Links</h1>
        </div>
        <Link
          href="/links/archived"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          View Archived
        </Link>
      </div>

      <LinksList />
    </div>
  );
}
