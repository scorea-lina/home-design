import { LinksList } from "@/components/links/LinksList";

export const dynamic = "force-dynamic";

export default function LinksPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Links</h1>
        <p className="text-sm text-zinc-400">Newest first.</p>
      </div>

      <LinksList />
    </div>
  );
}
