import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AnalyticsProvider } from "@/components/analytics/AnalyticsProvider";
import "./globals.css";

const gaId = process.env.NEXT_PUBLIC_GA_ID;

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://3deck.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Steam Deck OLED - Interactive 3D Showcase",
    template: "%s | Steam Deck OLED Showcase",
  },
  description: "Explore the Steam Deck OLED in real-time 3D. 7.4\" 90Hz HDR display, custom 6nm AMD APU, and up to 12 hours of battery life.",
  keywords: [
    "Steam Deck",
    "Steam Deck OLED",
    "Valve",
    "3D Showcase",
    "WebGL",
    "Three.js",
    "Gaming Handheld",
    "HDR OLED",
    "SteamOS",
    "Hardware Teardown",
  ],
  authors: [{ name: "Maksim Yaletski" }],
  creator: "Maksim Yaletski",
  publisher: "Maksim Yaletski",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Steam Deck OLED - Interactive 3D Showcase",
    description: "Explore the Steam Deck OLED in real-time 3D. 7.4\" 90Hz HDR display, custom 6nm AMD APU, and up to 12 hours of battery life.",
    url: siteUrl,
    siteName: "Steam Deck OLED Showcase",
    images: [
      {
        url: `${siteUrl}/og-image.png?v=2`,
        secureUrl: `${siteUrl}/og-image.png?v=2`,
        width: 1200,
        height: 630,
        alt: "Steam Deck OLED Interactive 3D Showcase",
        type: "image/png",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Steam Deck OLED - Interactive 3D Showcase",
    description: "Explore the Steam Deck OLED in real-time 3D. 7.4\" 90Hz HDR display, custom 6nm AMD APU, and up to 12 hours of battery life.",
    images: [`${siteUrl}/og-image.png?v=2`],
    creator: "@OnDeck",
    site: "@OnDeck",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png?v=8", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png?v=8", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico?v=8", sizes: "any" },
    ],
    apple: [
      { url: "/apple-touch-icon.png?v=8", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico?v=8"],
    other: [
      { rel: "mask-icon", url: "/safari-pinned-tab.svg?v=8", color: "#FF5A36" },
    ],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link
          rel="mask-icon"
          href="/safari-pinned-tab.svg?v=8"
          color="#FF5A36"
        />
        <link
          rel="preload"
          href="/fonts/ABCWhyteVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AnalyticsProvider />
        {gaId && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}', {
                  page_path: window.location.pathname,
                });
              `}
            </Script>
          </>
        )}
        {children}
      </body>
    </html>
  );
}
