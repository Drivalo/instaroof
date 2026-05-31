import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="container-max py-8 text-sm text-muted border-t border-border-subtle mt-auto">
      <p>
        Nimly © 2026 ·{" "}
        <Link href="/privacy" className="text-accent underline-offset-2 hover:underline">
          Privacy Policy
        </Link>
      </p>
    </footer>
  );
}
