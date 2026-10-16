import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';

// Bundled with the app: the VPS build cannot always reach Google Fonts
const inter = localFont({ src: './fonts/Inter-latin.woff2', weight: '100 900', display: 'swap' });

export const metadata: Metadata = {
  title: 'Attendance Admin Portal',
  description: 'Coaching Center Attendance Management System',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
