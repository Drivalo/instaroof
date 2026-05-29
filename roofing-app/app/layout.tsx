import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import TrackingScripts from "@/components/tracking-scripts";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "InstaRoof Quote",
  description: "AI-powered instant roofing quotes and booking",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <TrackingScripts />
        {children}
      </body>
    </html>
  );
}
