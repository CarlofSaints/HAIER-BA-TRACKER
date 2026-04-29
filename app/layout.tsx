import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Haier BA Measurement',
  description: 'Business Analyst performance measurement dashboard',
  icons: { icon: '/haier-logo-blue.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
