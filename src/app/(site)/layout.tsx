import { ReactNode } from "react";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { SiteShell } from "@/components/SiteShell";
import { SITE_URL, organizationJsonLd, siteJsonLd } from "@/lib/seo";

export default function SiteLayout({ children }: { children: ReactNode }) {
  const googleAnalyticsId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
  const isProduction = process.env.NODE_ENV === "production";
  const structuredData = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [siteJsonLd({ siteUrl: SITE_URL }), organizationJsonLd({ siteUrl: SITE_URL })]
  });

  return (
    <SiteShell
      integrations={
        <>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
          {isProduction ? (
            <script
              type="text/javascript"
              async={true}
              data-noptimize="1"
              data-cfasync="false"
              src="https://scripts.scriptwrapper.com/tags/75d9ab7d-268c-4e03-bb6c-180ca4b8d5ed.js"
            />
          ) : null}
          <GoogleAnalytics measurementId={googleAnalyticsId} />
          <AnalyticsTracker />
        </>
      }
    >
      {children}
    </SiteShell>
  );
}
