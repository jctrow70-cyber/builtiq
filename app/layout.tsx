import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuiltIQ Fitness",
  description: "Workout, nutrition, and progress tracking platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
