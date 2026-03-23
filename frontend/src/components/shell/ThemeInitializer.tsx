'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';

/**
 * 在客户端初始化时从 localStorage 恢复主题，
 * 并将 dark class 应用到 <html> 元素。
 */
export function ThemeInitializer() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    // 从 localStorage 读取保存的主题偏好
    const saved = localStorage.getItem('theme');
    if (saved === 'dark') {
      document.documentElement.classList.add('dark');
      useAppStore.setState({ theme: 'dark' });
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  // 响应 store 中的 theme 变化
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return null;
}
