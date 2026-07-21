import type { Metadata, Viewport } from 'next';
import InstallAppPrompt from './components/InstallAppPrompt';
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
  themeColor: '#080b12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <InstallAppPrompt />
        {children}
      </body>
    </html>
  );
}
