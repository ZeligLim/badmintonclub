import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATU Galway Badminton Club",
  description: "Sign up for weekly ATU Galway badminton sessions.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/*
          Apply the stored theme before the first paint. Without this a dark
          mode user gets a white flash on every navigation.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=localStorage.getItem("theme");if(t==="dark"||(t===null&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}}catch(e){}',
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
