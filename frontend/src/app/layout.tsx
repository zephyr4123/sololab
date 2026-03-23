import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';
import { ThemeInitializer } from '@/components/shell/ThemeInitializer';

export const metadata: Metadata = {
  title: 'SoloLab - AI 辅助研究平台',
  description: '面向独立研究者的 AI 辅助研究平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex h-screen overflow-hidden">
        <ThemeInitializer />
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-hidden p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
