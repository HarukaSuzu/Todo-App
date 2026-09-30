import { signIn, signUp } from '@/app/auth/actions'

// 1つの<form>の中に、送信ボタンごとに別々のformAction属性を持たせている。
// これはHTMLの標準機能で、「このボタンで送信されたときだけ、
// formの本来のactionではなくこちらの関数を呼ぶ」という指定ができる。
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">ログイン</h1>
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        ポートフォリオ確認用に、デモ用アカウントの情報を入力済みにしています。
        そのまま「ログイン」を押すだけでお試しいただけます。
      </p>
      {message && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <form className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm">
            メールアドレス
          </label>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue="demo@example.com"
            placeholder="メールアドレス"
            required
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm">
            パスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            defaultValue="demopass123"
            placeholder="パスワード"
            required
            minLength={6}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            formAction={signIn}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900"
          >
            ログイン
          </button>
          <button
            type="submit"
            formAction={signUp}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700"
          >
            新規登録
          </button>
        </div>
      </form>
    </main>
  )
}
