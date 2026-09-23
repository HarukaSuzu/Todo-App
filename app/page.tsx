// ---- page.tsx は「Server Component」----
// 認証チェック（未ログインなら/loginへ）とデータ取得（getTodos）をここで行い、
// インタラクティブな部分（useState/useOptimisticを使う部分）は
// components/ 以下のClient Componentに委譲する構成。
import { redirect } from 'next/navigation'
import { getTodos } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/auth/actions'
import { TodoForm } from '@/components/TodoForm'
import { TodoList } from '@/components/TodoList'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const todos = await getTodos()

  return (
    <main className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TODOリスト</h1>
        <form action={signOut}>
          <button type="submit" className="text-xs text-slate-500 hover:underline">
            ログアウト（{user.email}）
          </button>
        </form>
      </div>
      <TodoForm />
      <TodoList todos={todos} userId={user.id} />
    </main>
  )
}
