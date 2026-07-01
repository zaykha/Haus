import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { AppStateProvider } from "@/components/app-state";
import { LoadingAnimationBootstrap } from "@/components/loading-animation-bootstrap";
import { Shell } from "@/components/ui";
import StyledComponentsRegistry from "@/lib/styled-components-registry";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: "Haus",
  description: "Mobile-first design project portal MVP",
  icons: {
    icon: [
      { url: "/favicon_haus/favicon.ico" },
      { url: "/favicon_haus/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon_haus/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/favicon_haus/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon_haus/favicon.ico"],
  },
  manifest: "/favicon_haus/site.webmanifest",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <Script id="haus-lottie-web-script" src="/vendor/lottie.min.js" strategy="beforeInteractive" />
      </head>
      <body className={geist.variable}>
        <StyledComponentsRegistry>
          <AppStateProvider>
            <LoadingAnimationBootstrap />
            <Shell>{children}</Shell>
          </AppStateProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
