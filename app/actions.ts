// ---- STEP 3: Server Actions ----
//
// ファイルの先頭に "use server" と書くと、
// このファイル内の関数はすべて「サーバー上でだけ実行される関数」になる。
// APIルート（app/api/.../route.ts）を書かずに、
// フォームやボタンから直接サーバー側の処理を呼び出せるのがポイント。
//
// ブラウザは実際にはこの関数の中身を実行しない。
// Next.jsが自動で「この関数を呼ぶためのPOSTリクエスト」を裏側で生成してくれる。
'use server'

import { revalidatePath } from 'next/cache'
import {
  addTodoToFile,
  toggleTodoInFile,
  deleteTodoFromFile,
  updateTodoInFile,
} from '@/lib/data'
import { todoTitleSchema, todoIdSchema } from '@/lib/validation'

// ---- STEP 11: Zodによるバリデーション + useActionState ----
//
// useActionStateは「Server Actionの結果（前回の戻り値）を、
// フォームの状態として保持してくれる」Reactのフック。
// そのためこのフックから呼ぶ関数は、第一引数に「前回の状態」を受け取る
// (prevState, formData) => Promise<新しい状態> という形にする必要がある。
// _prevStateは今回使わないが、Reactがこの形を要求するので受け取っておく。
export type ActionState = {
  error?: string
}

export async function addTodo(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = todoTitleSchema.safeParse(formData.get('title'))
  if (!result.success) {
    // safeParseが失敗すると、issues配列に「どこがどう悪いか」が入っている。
    // 今回は1つのフィールドしか無いので、最初のエラーメッセージだけ使う。
    return { error: result.error.issues[0].message }
  }

  await addTodoToFile(result.data)

  // ---- STEP 4: revalidatePath ----
  // Server Actionでデータを更新しただけでは、
  // Next.jsはそれに気づいて画面を再取得してくれるわけではない。
  // revalidatePath('/') を呼ぶことで「'/' のキャッシュはもう古いので、
  // 次に表示するときはサーバーから最新のデータを取り直して」と明示的に伝えている。
  revalidatePath('/')

  return {}
}

// id(hidden input)は基本的に不正な値が来ない想定なので、
// エラーをUIに出すのではなく「不正なら黙って何もしない」防御的チェックにしている。
export async function toggleTodo(formData: FormData) {
  const result = todoIdSchema.safeParse(formData.get('id'))
  if (!result.success) return

  await toggleTodoInFile(result.data)
  revalidatePath('/')
}

export async function deleteTodo(formData: FormData) {
  const result = todoIdSchema.safeParse(formData.get('id'))
  if (!result.success) return

  await deleteTodoFromFile(result.data)
  revalidatePath('/')
}

// 編集フォームの保存用アクション。
// 編集モード自体は今はTodoList側のuseStateが持っているので、
// ここではただデータを更新してrevalidatePathするだけでよい
// （編集モードを抜ける処理はクライアント側のsetEditingId(null)が担当する）。
//
// こちらはuseActionStateを経由せず、TodoList側の楽観的更新ラッパーから
// 直接呼ばれる想定。同じtodoTitleSchemaをクライアント側でも使って
// 先にチェックしているので、ここに来る時点では大抵成功するはずだが、
// サーバー側でも同じルールで検証し直す（信頼できるのは常にサーバー側の結果）。
export async function updateTodo(formData: FormData): Promise<ActionState> {
  const idResult = todoIdSchema.safeParse(formData.get('id'))
  if (!idResult.success) return {}

  const titleResult = todoTitleSchema.safeParse(formData.get('title'))
  if (!titleResult.success) {
    return { error: titleResult.error.issues[0].message }
  }

  await updateTodoInFile(idResult.data, titleResult.data)
  revalidatePath('/')
  return {}
}
