'use client'

import { useActionState } from 'react'
import { addTodo, type ActionState } from '@/app/actions'
import { SubmitButton } from './SubmitButton'

const initialState: ActionState = {}

// ---- STEP 11: useActionState ----
//
// useActionStateは (action, 初期状態) を渡すと
// [今の状態, フォームに渡すためのaction, 送信中かどうか] を返してくれるフック。
// addTodoが返した ActionState（{ error: "..." } など）が
// そのまま「今の状態」として受け取れるので、
// サーバー側のZodバリデーションで失敗した理由をそのままUIに表示できる。
//
// このフォーム自体はサーバーコンポーネントのままでも動くが、
// useActionStateとuseFormStatus（SubmitButton内）を使うために
// Client Componentとして切り出している。
export function TodoForm() {
  const [state, formAction] = useActionState(addTodo, initialState)

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          name="title"
          placeholder="やることを入力..."
          required
          className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100 "
        />
        <SubmitButton pendingText="追加中...">追加</SubmitButton>
      </div>

      <div className="flex gap-2">
        <input
          type="date"
          name="dueDate"
          className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          name="priority"
          className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">未選択</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
      </div>

      {state.error && <p className="text-xs text-red-500">{state.error}</p>}
    </form>
  )
}
