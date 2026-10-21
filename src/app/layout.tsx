import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import { ZibIntro } from '@/components/layout/intro/ZibIntro';
import { ZIB_INTRO_BOOT_SCRIPT } from '@/components/layout/intro/zibIntroBoot';
import './globals.css';

/** Coquille HTTP pure : si la page est ouverte en https://, on repasse en http://
 *  avant tout (sinon mixed-content -> flux bloques). Script absent des autres builds. */
const PLAIN_HTTP_SHELL = process.env.NEXT_PUBLIC_PLAIN_HTTP === '1';

export const metadata: Metadata = {
  title: { default: 'ZiBTV', template: '%s · ZiBTV' },
  description: 'ZiBTV — Live TV, films et séries.',
  applicationName: 'ZiBTV',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'ZiBTV' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/brand/zibtv-icon.svg?v=3', sizes: 'any', type: 'image/svg+xml' },
      { url: '/icons/icon-32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/brand/zibtv-icon.svg?v=3', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' }],
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
      <head>
        {/* Doit s'executer avant la 1re peinture : decide si l'intro joue. */}
        <script dangerouslySetInnerHTML={{ __html: ZIB_INTRO_BOOT_SCRIPT }} />
      </head>
      {PLAIN_HTTP_SHELL && <Script src="/plain-http.js" strategy="beforeInteractive" />}
      <body>
        <ZibIntro />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
