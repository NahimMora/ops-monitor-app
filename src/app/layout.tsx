import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ops Monitor",
  description: "Private operations console for HolaSalta / LVR production pipelines.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
