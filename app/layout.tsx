import './globals.css';

export const metadata = {
  title: 'BuiltIQ',
  description: 'AI fitness, training, nutrition, mobility, and progress',
  appleWebApp: { capable: true, title: 'BuiltIQ', statusBarStyle: 'black-translucent' }
};

export const viewport = {
  themeColor: '#080b12'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
