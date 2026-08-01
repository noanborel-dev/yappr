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

export const metadata: Metadata = {
  title: "YAPPR",
  description:
    "Voice to clean, context-aware text — anywhere you can type. Bring your own keys, keep your audio private.",
  openGraph: {
    title: "Yappr",
    description:
      "Voice to clean text — anywhere you can type. Bring your own keys, keep your audio private.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Yappr",
    description:
      "Voice to clean text — anywhere you can type. Bring your own keys, keep your audio private.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${inter.variable} ${jetbrainsMono.variable} ${lato.variable} ${roboto.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
