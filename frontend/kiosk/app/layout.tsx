import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student Check-in Kiosk",
  description: "Self-service attendance kiosk for students",
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
