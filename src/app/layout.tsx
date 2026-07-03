import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import { SplashIntro } from '@/components/layout/SplashIntro';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ZiBTV', template: '%s · ZiBTV' },
  description: 'ZiBTV — Live TV, films et séries.',
  applicationName: 'ZiBTV',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ZiBTV' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/brand/zibtv-icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
      <body>
        <SplashIntro />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
