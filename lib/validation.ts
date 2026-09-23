// ---- STEP 11: Zodによるバリデーション ----
//
// これまでは `typeof title !== 'string' || title.trim() === ''` のような
// 手書きのチェックをactions.tsに直接書いていた。
// Zodを使うと「titleは文字列で、trimして1〜200文字」というルールを
// 1つのスキーマとして宣言でき、エラーメッセージも一緒に管理できる。
//
// このファイルはサーバー専用の処理（fs, cookiesなど）を一切importしていないので、
// Server Action側だけでなく、Client Component側からも安全にimportできる。
// 同じルールをサーバーとクライアントの両方で共有できるのがZodの強みの一つ。
import * as z from 'zod'

// Todoのタイトル: 空文字はNG、前後の空白は自動でtrimし、長すぎる入力も防ぐ。
export const todoTitleSchema = z
  .string()
  .trim()
  .min(1, { error: 'タイトルを入力してください' })
  .max(200, { error: 'タイトルは200文字以内で入力してください' })

// Supabaseのid列(uuid)の形式チェック。
// hidden inputから来る値なので通常は不正になることはないが、
// 念のためのサーバー側の防御的チェックとして使う。
export const todoIdSchema = z.uuid()

// ログイン/新規登録フォーム用。
export const authSchema = z.object({
  email: z.email({ error: 'メールアドレスの形式が正しくありません' }),
  password: z
    .string()
    .min(6, { error: 'パスワードは6文字以上で入力してください' }),
})
