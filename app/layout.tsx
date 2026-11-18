import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Trustless Swap — NFT swaps, without the trust",
  description: "Create and accept atomic NFT-for-NFT and NFT-for-token swaps, secured by on-chain escrow.",
  applicationName: "Trustless Swap",
};

export const viewport: Viewport = { themeColor: "#f6f8f4", width: "device-width", initialScale: 1, userScalable: false };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={cn("font-sans", geist.variable)}><body><Providers>{children}</Providers></body></html>;
}
