import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Cookie settings",
  description: "Manage your cookie and tracking preferences for Bloxodes.",
  robots: {
    index: false,
    follow: false
  }
};

export default function CookieSettingsPage() {
  notFound();
}
