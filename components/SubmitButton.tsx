'use client'

// ---- STEP 6: useFormStatus ----
//
// useFormStatus は「自分の直近の親<form>が今送信中かどうか」を教えてくれるフック。
// 重要な制約: <form>を描画しているコンポーネント自身の中では使えず、
// 必ずその<form>の“子”コンポーネントの中で呼び出す必要がある。
// そのため、送信ボタンをこうして別コンポーネントに切り出している。
import { useFormStatus } from 'react-dom'

export function SubmitButton({
  children,
  pendingText,
}: {
  children: React.ReactNode
  pendingText: string
}) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
    >
      {pending ? pendingText : children}
    </button>
  )
}
