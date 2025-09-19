const DEFAULT_SITE_URL = "https://bloxodes.com";

export const SITE_URL = process.env.SITE_URL?.trim() || DEFAULT_SITE_URL;

export const SITE_NAME = "Bloxodes";
export const SITE_DESCRIPTION = "Find active and expired Roblox game codes with rewards, updated daily.";

export function siteJsonLd({siteUrl}:{siteUrl:string}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": siteUrl,
    "name": SITE_NAME,
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${siteUrl}/search?q={query}`,
      "query-input": "required name=query"
    }
  };
}

export function organizationJsonLd({ siteUrl }: { siteUrl: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": SITE_NAME,
    "url": siteUrl,
    "logo": `${siteUrl}/Bloxodes-dark.png`,
    "sameAs": [
      "https://www.roblox.com/"
    ]
  };
}

export function breadcrumbJsonLd(items: {name:string, url:string}[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((it, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": it.name,
      "item": it.url
    }))
  };
}

export function gameJsonLd({siteUrl, game}:{siteUrl:string, game:{name:string, slug:string, image?:string}}) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "name": game.name,
    "url": `${siteUrl}/${game.slug}`,
    "image": game.image || `${siteUrl}/og-image.png`,
    "applicationCategory": "Game",
    "operatingSystem": "Roblox",
    "publisher": {
      "@type": "Organization",
      "name": "Roblox"
    }
  };
}

export function codesItemListJsonLd({siteUrl, game, codes}:{siteUrl:string, game:{name:string, slug:string}, codes:{code:string,status:string}[]}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": `${game.name} Codes`,
    "itemListElement": codes.map((c, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "name": c.code,
      "url": `${siteUrl}/${game.slug}#${encodeURIComponent(c.code)}`,
      "additionalType": "https://schema.org/Coupon",
      "item": {
        "@type": "Offer",
        "name": c.code,
        "availability": c.status === "active" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
      }
    }))
  };
}

type ArticleAuthor = { name: string; url?: string | null } | null | undefined;

export function gameArticleJsonLd({
  siteUrl,
  game,
  author,
  description,
  coverImage,
  publishedAt,
  updatedAt,
}: {
  siteUrl: string;
  game: { name: string; slug: string };
  author: ArticleAuthor;
  description: string;
  coverImage: string;
  publishedAt: string;
  updatedAt: string;
}) {
  const authorData = author?.name
    ? {
        "@type": "Person",
        "name": author.name,
        ...(author.url ? { url: author.url } : {})
      }
    : {
        "@type": "Organization",
        "name": SITE_NAME,
        "url": siteUrl
      };

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `${siteUrl}/${game.slug}`
    },
    "headline": `${game.name} Codes — How to Redeem`,
    "description": description,
    "image": [coverImage],
    "inLanguage": "en-US",
    "isAccessibleForFree": true,
    "keywords": [
      "Roblox",
      "Roblox codes",
      `${game.name} codes`,
      "gaming rewards"
    ],
    "articleSection": "Roblox Codes",
    "datePublished": publishedAt,
    "dateModified": updatedAt,
    "author": authorData,
    "publisher": {
      "@type": "Organization",
      "name": SITE_NAME,
      "url": siteUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${siteUrl}/Bloxodes-dark.png`
      }
    }
  };
}

export function authorJsonLd({
  siteUrl,
  author,
  avatar,
  description
}: {
  siteUrl: string;
  author: { name: string; slug: string; twitter?: string | null; youtube?: string | null; website?: string | null };
  avatar?: string | null;
  description: string;
}) {
  const sameAs: string[] = [];
  if (author.twitter) {
    const twitter = author.twitter.startsWith("http") ? author.twitter : `https://twitter.com/${author.twitter.replace(/^@/, "")}`;
    sameAs.push(twitter);
  }
  if (author.youtube) {
    sameAs.push(author.youtube);
  }
  if (author.website) {
    sameAs.push(author.website);
  }

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": author.name,
    "url": `${siteUrl}/authors/${author.slug}`,
    ...(avatar ? { image: avatar } : {}),
    "description": description,
    ...(sameAs.length ? { sameAs } : {})
  };
}
