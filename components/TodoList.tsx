'use client'

import { useEffect, useOptimistic, useRef, useState } from 'react'
import type { Todo } from '@/lib/types'
import { toggleTodo, deleteTodo, updateTodo } from '@/app/actions'
import { createClient } from '@/lib/supabase/client'
import { todoTitleSchema, dueDateSchema, prioritySchema } from '@/lib/validation'


// "2026-10-15" のようなISO形式の日付文字列を "2026/10/15" に変換する。
// new Date()でパースし直すと、実行環境のタイムゾーンによって
// 日付が前後にずれる可能性があるので、文字列としてそのまま置換するだけにしている。
function formatDueDate(dueDate: string): string {
  return dueDate.replaceAll('-', '/')
}

// 優先度ごとの表示ラベル
const priorityLabel: Record<'high' | 'medium' | 'low', string> = {
  high: '高',
  medium: '中',
  low: '低',
}

// 優先度ごとの薄い背景色（Tailwindのユーティリティクラス）
const priorityBadgeClass: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  medium: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
}

// 「今どのTODOを編集中か」はもうURLクエリではなく、
// このClient Component内の useState で素直に持てるようになった。
type OptimisticAction =
  | { type: 'toggle'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'edit'; id: string; title: string; dueDate: string | null; priority: 'high' | 'medium' | 'low' | null }

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

// 編集中のTODOデータを保持する型
type EditingTodo = {
  id: string
  title: string
  dueDate: string | null
  priority: 'high' | 'medium' | 'low' | null
}

export function TodoList({ todos, userId }: { todos: Todo[]; userId: string }) {
  const [editingTodo, setEditingTodo] = useState<EditingTodo | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<SortOrder>('createdAt')
  const [deletingTodoId, setDeletingTodoId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const deleteDialogRef = useRef<HTMLDialogElement>(null)

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
            t.id === action.id
              ? { ...t, title: action.title, dueDate: action.dueDate, priority: action.priority }
              : t
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

  // 編集用ダイアログを開くハンドラ
  const handleEditClick = (todo: Todo) => {
    setEditingTodo({
      id: todo.id,
      title: todo.title,
      dueDate: todo.dueDate,
      priority: todo.priority,
    })
    setEditError(null)
  }

  // editingTodoがセットされたら、ネイティブのモーダルとして開く。
  // showModal()を使うと、::backdrop（背景の暗転）やEscキーでのクローズが
  // ブラウザ標準機能として手に入る。
  useEffect(() => {
    if (editingTodo) {
      dialogRef.current?.showModal()
    }
  }, [editingTodo])

  // deletingTodoIdがセットされたら、削除確認ダイアログを開く
  useEffect(() => {
    if (deletingTodoId) {
      deleteDialogRef.current?.showModal()
    }
  }, [deletingTodoId])

  // Escキーなど、ブラウザ側の操作でdialogが閉じられたときにも
  // Reactのstate（editingTodo）を必ず同期させておく。
  const handleDialogClose = () => {
    setEditingTodo(null)
    setEditError(null)
  }

  // 削除確認ダイアログを開くハンドラ
  const handleDeleteClick = (id: string) => {
    setDeletingTodoId(id)
  }

  // 削除確認ダイアログを閉じるハンドラ
  const handleDeleteDialogClose = () => {
    setDeletingTodoId(null)
  }

  // 削除確認ダイアログでOKが押されたときの処理
  const handleDeleteConfirm = async (formData: FormData) => {
    const id = formData.get('id') as string
    addOptimisticUpdate({ type: 'delete', id })
    await deleteTodo(formData)
    handleDeleteDialogClose()
  }

  // <dialog>自体をクリックしたとき（＝背景=::backdropをクリックしたとき）だけ閉じる。
  // カード部分をクリックしたときは e.target がその子要素になるので閉じない。
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      dialogRef.current?.close()
    }
  }

  if (optimisticTodos.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">まだTODOがありません。</p>
  }

  return (
    <div className="space-y-4">
      {/* ソート選択 */}
      <div className="flex items-center gap-2">
        <label htmlFor="sort-order" className="text-sm text-slate-600 dark:text-slate-400">
          並び替え:
        </label>
        <select
          id="sort-order"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as SortOrder)}
          className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="createdAt">追加順</option>
          <option value="dueDate">期日が近い順</option>
          <option value="priority">優先度が高い順</option>
        </select>
      </div>

      <ul className="space-y-2">
        {sortedTodos.map((todo) => (
          <li
            key={todo.id}
            className="flex items-center gap-3 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2"
          >
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

                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <span
                    className={
                      todo.completed
                      ? 'text-sm text-slate-400 line-through'
                      : 'text-sm'
                    }
                  >
                  {todo.title}
                  </span>

                  {todo.dueDate && (
                    <span className="rounded-md bg-slate-100 dark:bg-slate-900 px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {formatDueDate(todo.dueDate)}
                    </span>
                  )}

                  {todo.priority && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${priorityBadgeClass[todo.priority]}`}
                    >
                    {priorityLabel[todo.priority]}
                    </span>
                  )}
                </div>

                {/* 編集ボタンでダイアログを開く */}
                <button
                  type="button"
                  onClick={() => handleEditClick(todo)}
                  className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                >
                  編集
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteClick(todo.id)}
                  className="text-xs text-red-500 hover:underline"
                >
                  削除
                </button>
            
          </li>
        ))}
      </ul>

      {/* 編集用モーダルダイアログ */}
      {editingTodo && (
        <dialog
          ref={dialogRef}
          onClick={handleDialogClick}
          onClose={handleDialogClose}
          className="m-auto rounded-lg p-0 backdrop:bg-black/50"
        >
          {/* 背景オーバーレイ（クリックで閉じる） */}
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800">

          <form
            action={async (formData: FormData) => {
              const titleResult = todoTitleSchema.safeParse(formData.get('title'))
              if (!titleResult.success) {
                setEditError(titleResult.error.issues[0].message)
                return
              }

              const dueDateResult = dueDateSchema.safeParse(formData.get('dueDate'))
              if (!dueDateResult.success) {
                setEditError(dueDateResult.error.issues[0].message)
                return
              }

              const priorityResult = prioritySchema.safeParse(formData.get('priority'))
              if (!priorityResult.success) {
                setEditError(priorityResult.error.issues[0].message)
                return
              }

              setEditError(null)
              addOptimisticUpdate({
                type: 'edit',
                id: editingTodo.id,
                title: titleResult.data,
                dueDate: dueDateResult.data,
                priority: priorityResult.data,
              })
              handleDialogClose()
              await updateTodo(formData)
            }}
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">TODOを編集</h2>

            <input type="hidden" name="id" value={editingTodo.id} />

            <div>
              <label htmlFor="edit-title" className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-400">
                タイトル <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="edit-title"
                name="title"
                defaultValue={editingTodo.title}
                autoFocus
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                required
                maxLength={200}
              />
            </div>

            <div>
              <label htmlFor="edit-dueDate" className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-400">
                期限日
              </label>
              <input
                type="date"
                id="edit-dueDate"
                name="dueDate"
                defaultValue={editingTodo.dueDate ?? ''}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div>
              <label htmlFor="edit-priority" className="block text-sm font-medium text-slate-700 mb-1 dark:text-slate-400">
                優先度
              </label>
              <select
                id="edit-priority"
                name="priority"
                defaultValue={editingTodo.priority ?? ''}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="">なし</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </div>

            {editError && (
              <p className="text-sm text-red-500" role="alert">
                {editError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleDialogClose}
                className="rounded-md border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-400"
              >
                保存
              </button>
            </div>
          </form>
          </div>
        </dialog>
      )}

      {/* 削除確認ダイアログ */}
      {deletingTodoId && (
        <dialog
          ref={deleteDialogRef}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              deleteDialogRef.current?.close()
            }
          }}
          onClose={handleDeleteDialogClose}
          className="m-auto rounded-lg p-0 backdrop:bg-black/50"
        >
          <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl dark:bg-slate-800">
            <form
              action={handleDeleteConfirm}
              className="space-y-4"
            >
              <input type="hidden" name="id" value={deletingTodoId} />
              <p className="text-sm text-slate-600 dark:text-slate-400">本当に削除しますか？</p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDeleteDialogClose}
                  className="rounded-md border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                >
                  削除
                </button>
              </div>
            </form>
          </div>
        </dialog>
      )}
    </div>
  )
}
