import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'IPTV', template: '%s · IPTV' },
  description: 'PWA IPTV premium — Live TV, films et séries.',
  applicationName: 'IPTV',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'IPTV' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#08080A',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
