import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CityOS | Simulation Control Center",
  description: "Smart city traffic simulation control center",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
