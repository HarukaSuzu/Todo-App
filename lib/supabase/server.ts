// Server Component / Server Actionから呼ぶためのSupabaseクライアントを作る関数。
// 以前は service_role キー（全データにアクセスできる強力な鍵）で
// 1つのクライアントを共有していたが、今回からは anon キー + 今ログイン中の
// ユーザーのセッション（cookieに入っているJWT）を使ってクライアントを作る。
// これにより、実際にどのデータへアクセスできるかは、テーブルに設定した
// Row Level Securityポリシーとこのユーザーのセッションによって決まるようになる。
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Componentのレンダリング中はcookieの書き換えができないため無視する。
            // セッションの更新自体はmiddleware.ts側で毎リクエスト行っているので実害はない。
          }
        },
      },
    }
  )
}
