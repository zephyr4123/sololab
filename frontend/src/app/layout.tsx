import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/shell/Sidebar';
import { ThemeInitializer } from '@/components/shell/ThemeInitializer';

export const metadata: Metadata = {
  title: 'SoloLab',
  description: 'AI-Powered Research Platform for Independent Researchers',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: '/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden antialiased">
        <ThemeInitializer />
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden px-5 py-4">{children}</main>
      </body>
    </html>
  );
}
