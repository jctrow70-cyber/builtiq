import './globals.css';

export const metadata = {
  title: 'BuiltIQ V2',
  description: 'Household and personal workout planning'
};

export const viewport = { themeColor: '#080b12' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
