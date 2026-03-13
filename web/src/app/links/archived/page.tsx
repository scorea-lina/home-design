import Link from "next/link";
import { LinksList } from "@/components/links/LinksList";

export const dynamic = "force-dynamic";

export default function LinksArchivedPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-cream-950">Archived Links</h1>
          <p className="text-sm text-cream-700">Previously archived links.</p>
        </div>
        <Link
          href="/links"
          className="text-sm text-cream-700 hover:text-cream-900"
        >
          Back to Links
        </Link>
      </div>

      <LinksList archived />
    </div>
  );
}
