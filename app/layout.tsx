import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeInitScript } from "@/lib/theme-script";
import { Nav } from "@/components/nav";
import { StorageNotice } from "@/components/storage-notice";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

export const metadata: Metadata = {
  title: {
    default: "ham-exam · 业余无线电操作技术能力验证练习",
    template: "%s · ham-exam",
  },
  description:
    "中国业余无线电操作技术能力验证智能练习系统：A/B/C 三套题库、顺序练习、模拟考试、错题本与知识点掌握度统计，全程离线可用。",
  applicationName: "ham-exam",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ham-exam",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#10131a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 在首帧前决定配色，避免闪白 */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh flex flex-col">
        <StorageNotice />
        <Nav />
        {/* 移动端有固定底部标签栏（3.5rem + Home 指示条），内容必须留出等高余量，
            否则首页/浏览/统计/错题列表等页面的最后一块会被永久遮住。
            练习/考试页的 <StickyActions> 自带占位，这里多出的空白只是滚动余量，无害。 */}
        <main className="flex-1 w-full mx-auto max-w-5xl px-4 pt-4 pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:pb-6">
          {children}
        </main>
        <footer className="hidden sm:block border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-subtle)]">
          ham-exam · 业余无线电操作技术能力验证练习系统
        </footer>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
