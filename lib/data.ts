// ---- STEP 9: Row Level Security + 認証への対応 ----
//
// これまでは service_role キー（全データにアクセスできる1つの共有クライアント）を
// 使っていたが、今回からは「今ログインしているユーザーのセッションを持つクライアント」を
// 関数が呼ばれるたびに作るようにした。
//
// テーブル側にRow Level Securityを設定したことで、
// 「自分のTodoしか見えない/操作できない」という制御は、
// このファイルの中でif文を書かなくても、Supabase（Postgres）側が自動でやってくれる。
// たとえば他人のTodoのidを指定してtoggle/delete/updateしようとしても、
// RLSのポリシーに一致しないので「対象が見つからない」扱いになり、何も起きない。
//
// 今回もexportしている関数の名前と型は変えていない。
import { createClient } from './supabase/server'
import type { Todo } from './types'

type TodoRow = {
  id: string
  title: string
  completed: boolean
  created_at: string
  due_date: string | null
  priority: 'high' | 'medium' | 'low' | null
}

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.created_at,
    dueDate: row.due_date,
    priority: row.priority,
  }
}

// 一覧取得（作成日時の昇順）
// RLSの select ポリシーにより、自分のuser_idの行しか返ってこない。
export async function getTodos(): Promise<Todo[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []).map(toTodo)
}

// 追加。RLSの insert ポリシーが「user_id = auth.uid()」を要求するため、
// 挿入時に必ず自分のuser.idを明示的にセットする。
// dueDateとpriorityは任意引数として追加（後方互換性のためデフォルト値をnullにする）
export async function addTodoToFile(
  title: string,
  dueDate: string | null = null,
  priority: 'high' | 'medium' | 'low' | null = null
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase
    .from('todos')
    .insert({ title, user_id: user.id, due_date: dueDate, priority })
  if (error) throw error
}

// 完了/未完了の切り替え
export async function toggleTodoInFile(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: current, error: fetchError } = await supabase
    .from('todos')
    .select('completed')
    .eq('id', id)
    .single()

  if (fetchError || !current) return

  const { error } = await supabase
    .from('todos')
    .update({ completed: !current.completed })
    .eq('id', id)

  if (error) throw error
}

// 削除
export async function deleteTodoFromFile(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('todos').delete().eq('id', id)
  if (error) throw error
}

// タイトルの編集
// dueDateとpriorityも任意で更新できるように拡張
export async function updateTodoInFile(
  id: string,
  title: string,
  dueDate?: string | null,
  priority?: 'high' | 'medium' | 'low' | null
): Promise<void> {
  const supabase = await createClient()
  const updates: Record<string, string | boolean | null> = { title }
  if (dueDate !== undefined) updates.due_date = dueDate
  if (priority !== undefined) updates.priority = priority

  const { error } = await supabase.from('todos').update(updates).eq('id', id)
  if (error) throw error
}
