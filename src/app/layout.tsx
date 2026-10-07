import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATU Galway Badminton Club",
  description: "Sign up for weekly ATU Galway badminton sessions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
