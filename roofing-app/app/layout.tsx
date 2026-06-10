import type { Metadata } from "next";
import { DM_Sans, Jost } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import TrackingScripts from "@/components/tracking-scripts";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const jost = Jost({
  variable: "--font-jost",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Book a Free Roof Inspection",
  description: "Get an instant roof estimate and connect with a local roofer who confirms the final price on inspection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jost.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <TrackingScripts />
        <div className="flex min-h-full flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
