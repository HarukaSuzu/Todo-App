// アクセストークンには有効期限があり、切れると自動でリフレッシュする必要がある。
// ただしServer Componentのレンダリング中はcookieを書き換えられないため、
// リフレッシュしたトークンを保存できない。
// そこでmiddlewareが「ページのレンダリングより先に」毎リクエスト実行され、
// 必要ならトークンをリフレッシュしてcookieに書き戻す、という役割を担う。
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession()はcookieを読むだけで検証しないが、
  // getUser()はSupabase Auth側にJWTを問い合わせて検証してくれる。
  // ここで呼んでおくことで、期限切れトークンのリフレッシュも行われる。
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 未ログインで /login 以外にアクセスしようとしたらログインページへ。
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
