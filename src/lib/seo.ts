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
  const image = game.image
    ? (game.image.startsWith("http") ? game.image : `${siteUrl.replace(/\/$/, "")}/${game.image.replace(/^\//, "")}`)
    : `${siteUrl}/og-image.png`;
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "name": game.name,
    "url": `${siteUrl}/${game.slug}`,
    "image": image,
    "applicationCategory": "Game",
    "operatingSystem": "Roblox",
    "publisher": {
      "@type": "Organization",
      "name": "Roblox"
    }
  };
}

export function codesItemListJsonLd({
  siteUrl,
  game,
  codes
}: {
  siteUrl: string;
  game: { name: string; slug: string };
  codes: { code: string; status: string; reward?: string | null }[];
}) {
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
        "@type": "Coupon",
        "name": c.code,
        "couponCode": c.code,
        ...(c.reward ? { description: c.reward } : {}),
        "additionalProperty": {
          "@type": "PropertyValue",
          "name": "status",
          "value": c.status
        }
      }
    }))
  };
}

type ArticleAuthor = {
  name: string;
  url?: string | null;
  description?: string | null;
  sameAs?: string[] | null;
} | null | undefined;

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
        ...(author.url ? { url: author.url } : {}),
        ...(author.description ? { description: author.description } : {}),
        ...(author.sameAs && author.sameAs.length ? { sameAs: author.sameAs } : {})
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

export function webPageJsonLd({
  siteUrl,
  slug,
  title,
  description,
  image,
  author,
  publishedAt,
  updatedAt
}: {
  siteUrl: string;
  slug: string;
  title: string;
  description: string;
  image: string;
  author: { name: string; url?: string | null } | null;
  publishedAt: string;
  updatedAt: string;
}) {
  const canonical = `${siteUrl.replace(/\/$/, "")}/${slug.replace(/^\//, "")}`;
  const imageUrl = image.startsWith("http") ? image : `${siteUrl.replace(/\/$/, "")}/${image.replace(/^\//, "")}`;

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "url": canonical,
    "name": title,
    "headline": title,
    "description": description,
    "image": imageUrl,
    "datePublished": publishedAt,
    "dateModified": updatedAt,
    "publisher": {
      "@type": "Organization",
      "name": SITE_NAME,
      "url": siteUrl,
      "logo": {
        "@type": "ImageObject",
        "url": `${siteUrl}/Bloxodes-dark.png`
      }
    },
    ...(author?.name
      ? {
          author: {
            "@type": "Person",
            "name": author.name,
            ...(author.url ? { url: author.url } : {}),
            ...(author.description ? { description: author.description } : {}),
            ...(author.sameAs && author.sameAs.length ? { sameAs: author.sameAs } : {})
          }
        }
      : {
          author: {
            "@type": "Organization",
            "name": SITE_NAME,
            "url": siteUrl
          }
        })
  };
}

export function howToJsonLd({
  siteUrl,
  game,
  steps,
  images
}: {
  siteUrl: string;
  game: { name: string; slug: string };
  steps: string[];
  images?: string[];
}) {
  if (!steps.length) return null;
  const canonical = `${siteUrl.replace(/\/$/, "")}/${game.slug.replace(/^\//, "")}`;
  const normalizedImages = (images || [])
    .map((src) =>
      src.startsWith("http") ? src : `${siteUrl.replace(/\/$/, "")}/${src.replace(/^\//, "")}`
    )
    .slice(0, 3);

  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": `How to redeem ${game.name} codes`,
    "description": `Step-by-step guide to redeem codes in ${game.name}.`,
    "url": canonical,
    ...(normalizedImages.length ? { image: normalizedImages } : {}),
    "step": steps.map((text, index) => ({
      "@type": "HowToStep",
      "position": index + 1,
      "name": text.length > 60 ? `${text.slice(0, 57)}...` : text,
      "text": text
    }))
  };
}
