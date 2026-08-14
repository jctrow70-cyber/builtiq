import type { Metadata, Viewport } from 'next';
import InstallAppPrompt from './components/InstallAppPrompt';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'BuildIQ Health',
  description:
    'Train smarter with workout logging, nutrition tracking, progress insights, and AI wellness coaching.',
  applicationName: 'BuildIQ Health',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BuildIQ Health',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: '/icon', sizes: '512x512', type: 'image/png' }],
    apple: [{ url: '/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0f18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

/** Inline critical paint styles so mobile browsers never flash a light canvas before CSS. */
const BOOT_CANVAS_STYLE = {
  colorScheme: 'dark' as const,
  backgroundColor: '#0a0f18',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="performance"
      style={BOOT_CANVAS_STYLE}
      suppressHydrationWarning
    >
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body{background-color:#0a0f18;color-scheme:dark}body{margin:0;color:#fff}',
          }}
        />
      </head>
      <body style={BOOT_CANVAS_STYLE} suppressHydrationWarning>
        <Providers>
          <InstallAppPrompt />
          {children}
        </Providers>
      </body>
    </html>
  );
}
