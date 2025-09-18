export function siteJsonLd({siteUrl}:{siteUrl:string}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "url": siteUrl,
    "name": "Roblox Codes",
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${siteUrl}/search?q={query}`,
      "query-input": "required name=query"
    }
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
