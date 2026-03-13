/**
 * Fetch a thumbnail/preview image URL for a given page.
 *
 * Strategy:
 * 1. Try site-specific patterns (YouTube, Google Slides, Etsy, etc.)
 * 2. Try fetching og:image / twitter:image from the page HTML
 * 3. Return null if nothing works
 */
export async function fetchOgImage(url: string): Promise<string | null> {
  // 1. Site-specific thumbnail patterns.
  const siteThumb = getSiteSpecificThumbnail(url);
  if (siteThumb) return siteThumb;

  // 2. Try YouTube oEmbed (works even when og:image doesn't).
  const oembedThumb = await tryOembed(url);
  if (oembedThumb) return oembedThumb;

  // 3. Fetch the page and look for og:image / twitter:image.
  return fetchFromHtml(url);
}

/** Known URL patterns that let us construct a thumbnail without fetching. */
function getSiteSpecificThumbnail(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    // YouTube — https://i.ytimg.com/vi/{id}/hqdefault.jpg
    if (
      (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com")
    ) {
      let videoId: string | null = null;
      if (host === "youtu.be") {
        videoId = u.pathname.slice(1);
      } else {
        videoId = u.searchParams.get("v");
      }
      if (videoId) {
        return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      }
    }

    // Google Slides — use the thumbnail export endpoint (public presentations only).
    if (host === "docs.google.com" && u.pathname.includes("/presentation/d/")) {
      const match = u.pathname.match(/\/presentation\/d\/([^/]+)/);
      if (match) {
        return `https://lh3.googleusercontent.com/d/${match[1]}=w800`;
      }
    }

    // Google Drive file — thumbnail via lh3.
    if (host === "drive.google.com") {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (match) {
        return `https://lh3.googleusercontent.com/d/${match[1]}=w800`;
      }
    }

    // Etsy — construct image from listing ID via their CDN pattern.
    // Etsy blocks server fetches, but their image CDN is open.
    if (host === "etsy.com") {
      const match = u.pathname.match(/\/listing\/(\d+)\//);
      if (match) {
        return `https://i.etsystatic.com/isla/redirect/il/listing/${match[1]}/il_680x540.jpg`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Try YouTube/Vimeo oEmbed for video thumbnails. */
async function tryOembed(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    let oembedUrl: string | null = null;
    if (host === "youtube.com" || host === "youtu.be" || host === "m.youtube.com") {
      oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    } else if (host === "vimeo.com") {
      oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
    }

    if (!oembedUrl) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(oembedUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    const json = await res.json();
    return json.thumbnail_url || null;
  } catch {
    return null;
  }
}

/** Fetch the page HTML and extract og:image or twitter:image. */
async function fetchFromHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return null;
    }

    // Read only the first 80KB to find meta tags in <head>.
    const reader = res.body?.getReader();
    if (!reader) return null;

    let html = "";
    const decoder = new TextDecoder();
    while (html.length < 80_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});

    // Try og:image first, then twitter:image as fallback.
    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i,
      /<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        try {
          return new URL(match[1], url).href;
        } catch {
          return match[1];
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}
