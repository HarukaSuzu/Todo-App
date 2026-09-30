// ---- STEP 12: Route Handler ----
//
// 今まではフォーム送信やボタン操作をServer Actionsで処理してきたが、
// 今回は「メールソフトの中でリンクをクリックした結果、ブラウザが直接GETリクエストを送る」
// という状況なので、Server Actionsの出番ではない。
// こういう「URLに対して直接HTTPリクエストが飛んでくる」場合の受け口として、
// app/**/route.ts という名前のファイルを作ると、そのURLへのGET/POSTなどを
// 直接処理できる「Route Handler」になる。
//
// token_hash と type は、確認メールのリンクにこちらで仕込んだクエリパラメータ。
// verifyOtp() に渡すと、Supabase側でその値を検証し、
// 有効なら「確認済みユーザーとしてログインした状態」のセッションをcookieに書き込んでくれる。
import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (tokenHash && type) {
    const supabase = await createClient()

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })

    if (!error) {
      redirect(next)
    }
  }

  // token_hash/typeが無い、または検証に失敗した場合
  // （リンクの有効期限切れ、既に使用済みなど）はログインページへ。
  redirect(
    `/login?error=${encodeURIComponent(
      'メールの確認に失敗しました。リンクの有効期限が切れている可能性があります。'
    )}`
  )
}