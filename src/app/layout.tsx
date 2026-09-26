import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Switchboard · Electoral Intelligence",
  description: "Recorded election results, local context and research in one private electoral workspace.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body>{children}</body></html>;
}
