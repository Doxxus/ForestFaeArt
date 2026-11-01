import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forest Fae Folk Art",
  description: "Coming soon.",
  // Staging must never be indexed (HAND-0).
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
