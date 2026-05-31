import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyPolicyContent } from "@/components/privacy-policy-content";

export const metadata: Metadata = {
  title: "Privacy Policy — InstaRoof",
  description: "How InstaRoof and Nimly collect, use, and protect your personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="customer-page flex-1 container-max py-10 md:py-14">
      <Link
        href="/"
        className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
      >
        ← Back to home
      </Link>
      <h1 className="mt-6 text-2xl md:text-3xl text-foreground">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: May 2026</p>
      <div className="mt-8">
        <PrivacyPolicyContent />
      </div>
    </main>
  );
}
