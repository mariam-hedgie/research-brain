import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Brain",
  description: "A research operating system for student researchers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
