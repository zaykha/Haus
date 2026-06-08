import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { AppStateProvider } from "@/components/app-state";
import { Shell } from "@/components/ui";
import StyledComponentsRegistry from "@/lib/styled-components-registry";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "Haus",
  description: "Mobile-first design project portal MVP",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        <StyledComponentsRegistry>
          <AppStateProvider>
            <Shell>{children}</Shell>
          </AppStateProvider>
        </StyledComponentsRegistry>
      </body>
    </html>
  );
}
