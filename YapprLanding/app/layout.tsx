import type { Metadata } from "next";
import {
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Lato,
  Roboto,
} from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Real product fonts so the app mockups (Slack/Gmail) look authentic.
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

const roboto = Roboto({
  variable: "--font-roboto",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const TAGLINE =
  "Talk however you talk. Your ramble lands as a structured prompt — in Claude Code, Cursor, or anywhere you type.";

export const metadata: Metadata = {
  title: "Yappr — stop writing bad prompts out loud",
  description: TAGLINE,
  openGraph: { title: "Yappr", description: TAGLINE, type: "website" },
  twitter: { card: "summary_large_image", title: "Yappr", description: TAGLINE },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable} ${lato.variable} ${roboto.variable}`}
    >
      <head>
        {/* Scroll reveals are JS-driven — without this the page renders
            blank for no-JS clients and some crawlers. */}
        <noscript
          dangerouslySetInnerHTML={{
            __html: "<style>.reveal{opacity:1!important;transform:none!important}</style>",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
