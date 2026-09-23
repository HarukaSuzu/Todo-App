import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TODOアプリ',
  description: 'Next.js + Server Actions で作るTODO管理アプリ',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-xl px-4 py-10">{children}</div>
      </body>
    </html>
  )
}
