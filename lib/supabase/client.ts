// ブラウザ側（Client Component）から使うクライアント。
// 今のアプリはログイン/ログアウトも含めて全部Server Actions経由なので
// 今のところどこからも使っていないが、将来Realtime機能などを
// 追加するときはこちらを使うことになる。
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
