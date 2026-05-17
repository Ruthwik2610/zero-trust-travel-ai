import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unipro Travel",
  description: "Modern zero-trust enterprise travel platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
