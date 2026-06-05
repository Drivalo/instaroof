import Link from "next/link";
import { getSettings } from "@/lib/supabase";

export async function SiteFooter() {
  const settings = await getSettings();
  const companyName = settings.company_name?.trim() || "Your Roofing Company";

  return (
    <footer className="container-max py-8 text-sm text-muted border-t border-border-subtle mt-auto">
      <p>
        {companyName} © 2026 ·{" "}
        <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
      </p>
    </footer>
  );
}
