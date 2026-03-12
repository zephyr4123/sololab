import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/shell/Sidebar';
import { TopBar } from '@/components/shell/TopBar';

export const metadata: Metadata = {
  title: 'SoloLab - AI Research Platform',
  description: 'AI-assisted research platform for independent researchers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto p-4">{children}</main>
        </div>
      </body>
    </html>
  );
}
