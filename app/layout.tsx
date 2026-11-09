import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { OfflineBanner } from "@/components/OfflineBanner";

export const metadata: Metadata = {
  title: {
    default: "Ma'at V2 — Know what's paid, what's missing, and why.",
    template: "%s · Ma'at V2",
  },
  description:
    "Ma'at reconciles invoice and payment CSVs, explains exceptions with source evidence, and keeps every human decision traceable.",
  icons: { icon: "/logo-symbol.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12263A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <OfflineBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
