import Link from 'next/link';
import { ImageGrid } from '@/components/images/ImageGrid';

export const dynamic = 'force-dynamic';

export default function ImagesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Images</h1>
        <Link
          href="/images/archived"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          View Archived
        </Link>
      </div>
      <ImageGrid />
    </div>
  );
}
