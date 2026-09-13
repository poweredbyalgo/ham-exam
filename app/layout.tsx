import type { Metadata, Viewport } from "next";
import "./globals.css";
import { themeInitScript } from "@/lib/theme-script";
import { Nav } from "@/components/nav";
import { StorageNotice } from "@/components/storage-notice";
import { ServiceWorkerRegistrar } from "@/components/service-worker-registrar";

export const metadata: Metadata = {
  title: {
    default: "CRAC 智能练习系统",
    template: "%s · CRAC 智能练习",
  },
  description:
    "业余无线电操作技术能力验证智能练习系统：A/B/C 三套题库、顺序练习、模拟考试、错题本与知识点掌握度统计，全程离线可用。",
  applicationName: "CRAC 智能练习",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "CRAC 练习",
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
        {/* pb 只需留一点余量：练习/考试等页面用 <StickyActions> 自带的等高占位
            把内容顶到固定操作条之上，无需在这里预留大块空白。 */}
        <main className="flex-1 w-full mx-auto max-w-5xl px-4 pb-3 sm:pb-6 pt-4">
          {children}
        </main>
        <footer className="hidden sm:block border-t border-[var(--border)] py-4 text-center text-xs text-[var(--text-subtle)]">
          CRAC 智能练习 · 题库数据来自 A/B/C 类题库 PDF 与总题库附图标记 PDF
        </footer>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
