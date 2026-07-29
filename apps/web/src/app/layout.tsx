import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "@model-monitor/ui/tokens.css";
import "./globals.css";
import { AppShell } from "@/components/shell/app-shell";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Model Directory",
  description: "Private LLM registry and personal model workspace",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${inter.variable}`}
    >
      <body
        className="min-h-screen antialiased"
        style={{
          background: "var(--bg-app)",
          color: "var(--text)",
          fontFamily:
            "var(--font-geist-sans), var(--font-inter), var(--font-sans)",
        }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
