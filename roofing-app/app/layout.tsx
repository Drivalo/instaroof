import type { Metadata } from "next";
import { DM_Sans, Jost } from "next/font/google";
import "./globals.css";
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
  title: "Nimly",
  description: "Nimly — AI-powered instant roofing quotes and booking",
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
        {children}
      </body>
    </html>
  );
}
