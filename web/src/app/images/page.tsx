import Link from 'next/link';
import { ImageGrid } from '@/components/images/ImageGrid';

export const dynamic = 'force-dynamic';

export default function ImagesPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-cream-950">Images</h1>
        <Link
          href="/images/archived"
          className="text-sm text-cream-700 hover:text-cream-900"
        >
          View Archived
        </Link>
      </div>
      <ImageGrid />
    </div>
  );
}
