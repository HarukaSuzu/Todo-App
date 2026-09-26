'use client'

import { useEffect, useOptimistic, useState } from 'react'
import type { Todo } from '@/lib/types'
import { toggleTodo, deleteTodo, updateTodo } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import { todoTitleSchema } from '@/lib/validation'

// 「今どのTODOを編集中か」はもうURLクエリではなく、
// このClient Component内の useState で素直に持てるようになった。
type OptimisticAction =
  | { type: 'toggle'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'edit'; id: string; title: string }

// Realtimeで届くpayload.new/payload.oldの形（テーブルの列名そのまま）。
// lib/data.tsのTodoRowと同じ形だが、Client Componentからサーバー専用の
// lib/data.tsをimportするわけにはいかないので、ここで改めて定義している。
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

// ソート順の型定義
type SortOrder = 'createdAt' | 'dueDate' | 'priority'

export function TodoList({ todos, userId }: { todos: Todo[]; userId: string }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('createdAt')

  // ---- STEP 10: Realtimeで他タブ/他セッションの変更を反映する ----
  //
  // これまでuseOptimisticは直接props.todosを土台にしていたが、
  // 今回は間に liveTodos というstateを1枚挟む。
  // - 自分がこのタブで操作したとき: revalidatePathでpage.tsxが再実行され、
  //   新しいtodos propsが渡ってくる → 下のuseEffectでliveTodosに反映
  // - 別タブ/別ユーザーが操作したとき: propsは変わらないが、Realtimeの
  //   postgres_changesイベントが届く → そのイベントでliveTodosを直接更新
  const [liveTodos, setLiveTodos] = useState<Todo[]>(todos)

  // Server Componentから新しいtodos propsが渡ってきたら、それを正として採用する。
  useEffect(() => {
    setLiveTodos(todos)
  }, [todos])

  // todosテーブルの変更をRealtimeで購読する。
  useEffect(() => {
    const supabase = createClient()

    // チャンネルの作成と .on() の登録は、ここで同期的に（awaitを挟まず）行う。
    // .subscribe() だけを後段の非同期処理に遅らせることで、
    // 「このチャンネルはまだ誰もsubscribeしていない」状態を保ったまま
    // .on() を呼べるようにしている（詳しくは下のコメント参照）。
    const channel = supabase.channel(`todos-changes-${userId}`).on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'todos',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        setLiveTodos((current) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as TodoRow
            // 自分の操作によるINSERTは、useOptimisticの楽観的表示や
            // 次のrevalidatePathで既に反映されるため、
            // Realtime側で二重に追加しないよう重複チェックする。
            if (current.some((t) => t.id === row.id)) return current
            return [...current, toTodo(row)].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt)
            )
          }
          if (payload.eventType === 'UPDATE') {
            const row = payload.new as TodoRow
            return current.map((t) => (t.id === row.id ? toTodo(row) : t))
          }
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id: string }
            return current.filter((t) => t.id !== oldRow.id)
          }
          return current
        })
      }
    )

    // 開発モードのReact Strict Modeは、useEffectを
    // 「マウント→クリーンアップ→再マウント」と2回実行してバグを検出しようとする。
    // もし「セッション確認→channel作成→subscribe」を全部async関数の中で
    // 順番にやってしまうと、1回目の実行がまだ await 中にクリーンアップが走り、
    // その時点でchannel変数がまだnullなので何も片付けられず、
    // 古いsubscribe済みチャンネルが残ったまま2回目の実行が
    // 同じチャンネルに .on() を呼んでしまい
    // 「cannot add postgres_changes callbacks ... after subscribe()」となっていた。
    // 対策として、isCancelledフラグでクリーンアップ後のsubscribe()実行を防ぐ。
    let isCancelled = false

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isCancelled) return

      // todosテーブルはRLSで「自分の行しか見えない」ようになっているため、
      // Realtimeの接続にも今ログイン中のユーザーのアクセストークンを
      // 明示的に渡しておく必要がある（渡さないと何も配信されない）。
      if (session) {
        supabase.realtime.setAuth(session.access_token)
      }

      channel.subscribe()
    })

    // コンポーネントが画面から消えるとき（ページ離脱など）は
    // 必ず購読を解除する。しないとWebSocket接続が残り続けてしまう。
    return () => {
      isCancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  // ---- STEP 6: useOptimistic ----
  // 自分の操作について、サーバーの応答（revalidatePathによる再取得）を
  // 待たずに、先に画面だけ「更新された後の見た目」に切り替える仕組み。
  // 土台がprops.todosから liveTodos に変わった以外は、以前と同じ。
  const [optimisticTodos, addOptimisticUpdate] = useOptimistic(
    liveTodos,
    (state, action: OptimisticAction) => {
      switch (action.type) {
        case 'toggle':
          return state.map((t) =>
            t.id === action.id ? { ...t, completed: !t.completed } : t
          )
        case 'delete':
          return state.filter((t) => t.id !== action.id)
        case 'edit':
          return state.map((t) =>
            t.id === action.id ? { ...t, title: action.title } : t
          )
      }
    }
  )

  // ソート関数（完了済みは最後に、dueDate/priority未設定は最後に）
  const sortTodos = (todos: Todo[]): Todo[] => {
    return [...todos].sort((a, b) => {
      // 完了済みは最後に回す（共通ルール）
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1
      }

      switch (sortOrder) {
        case 'dueDate': {
          // 期日が近い順（未設定は最後）
          if (a.dueDate === null && b.dueDate === null) return 0
          if (a.dueDate === null) return 1
          if (b.dueDate === null) return -1
          return a.dueDate.localeCompare(b.dueDate)
        }
        case 'priority': {
          // 優先度が高い順（未設定は最後）
          const priorityRank: Record<NonNullable<Todo['priority']>, number> = {
            high: 3,
            medium: 2,
            low: 1,
          }
          const rankA = a.priority ? priorityRank[a.priority] : 0
          const rankB = b.priority ? priorityRank[b.priority] : 0
          if (rankA !== rankB) return rankB - rankA // 高い順
          // 優先度が同じなら作成日時でソート
          return a.createdAt.localeCompare(b.createdAt)
        }
        case 'createdAt':
        default: {
          // 追加順（作成日時の古い順）
          return a.createdAt.localeCompare(b.createdAt)
        }
      }
    })
  }

  // 表示用にソートした配列を作成（optimisticTodosを基準にする）
  const sortedTodos = sortTodos(optimisticTodos)

  if (optimisticTodos.length === 0) {
    return <p className="text-sm text-slate-500">まだTODOがありません。</p>
  }

  return (
    <div className="space-y-4">
      {/* ソート選択 */}
      <div className="flex items-center gap-2">
        <label htmlFor="sort-order" className="text-sm text-slate-600">
          並び替え:
        </label>
        <select
          id="sort-order"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="createdAt">追加順</option>
          <option value="dueDate">期日が近い順</option>
          <option value="priority">優先度が高い順</option>
        </select>
      </div>

      <ul className="space-y-2">
        {sortedTodos.map((todo) => {
        const isEditing = todo.id === editingId

        return (
          <li
            key={todo.id}
            className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
          >
            {isEditing ? (
              <div className="flex-1 space-y-1">
                <form
                  action={async (formData: FormData) => {
                    // サーバーと同じtodoTitleSchemaをここでも使い、
                    // わざわざサーバーに送らなくても即座にエラーを出せるようにする。
                    // ただし本当に信頼できるのはサーバー側の結果なので、
                    // ここで通っても updateTodo 側でも同じスキーマで再検証している。
                    const result = todoTitleSchema.safeParse(formData.get('title'))
                    if (!result.success) {
                      setEditError(result.error.issues[0].message)
                      return
                    }

                    // 楽観的更新 → 先に編集モードを抜ける → 実際のServer Actionを呼ぶ、の順。
                    // <form action={...}>にはServer Actionそのものだけでなく、
                    // こうした普通の非同期関数も渡せる（中で好きなだけ処理を挟める）。
                    setEditError(null)
                    addOptimisticUpdate({ type: 'edit', id: todo.id, title: result.data })
                    setEditingId(null)
                    await updateTodo(formData)
                  }}
                  className="flex items-center gap-2"
                >
                  <input type="hidden" name="id" value={todo.id} />
                  <input
                    type="text"
                    name="title"
                    defaultValue={todo.title}
                    autoFocus
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null)
                      setEditError(null)
                    }}
                    className="text-xs text-slate-500 hover:underline"
                  >
                    キャンセル
                  </button>
                </form>
                {editError && <p className="text-xs text-red-500">{editError}</p>}
              </div>
            ) : (
              <>
                <form
                  action={async (formData: FormData) => {
                    addOptimisticUpdate({ type: 'toggle', id: todo.id })
                    await toggleTodo(formData)
                  }}
                >
                  <input type="hidden" name="id" value={todo.id} />
                  <button
                    type="submit"
                    aria-label="完了状態を切り替え"
                    className="text-lg"
                  >
                    {todo.completed ? '✅' : '⬜️'}
                  </button>
                </form>

                <span
                  className={
                    todo.completed
                      ? 'flex-1 text-sm text-slate-400 line-through'
                      : 'flex-1 text-sm'
                  }
                >
                  {todo.title}
                </span>

                {/* useStateで編集状態を持てるようになったので、
                    リンクではなくただのボタン（onClick）で切り替えられる */}
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(todo.id)
                    setEditError(null)
                  }}
                  className="text-xs text-slate-500 hover:underline"
                >
                  編集
                </button>

                <form
                  action={async (formData: FormData) => {
                    addOptimisticUpdate({ type: 'delete', id: todo.id })
                    await deleteTodo(formData)
                  }}
                >
                  <input type="hidden" name="id" value={todo.id} />
                  <button
                    type="submit"
                    className="text-xs text-red-500 hover:underline"
                  >
                    削除
                  </button>
                </form>
              </>
            )}
          </li>
        )
      })}
    </ul>
  </div>
  )
}
