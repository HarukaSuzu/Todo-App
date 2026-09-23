// ---- STEP 1: データの型を決める ----
// TODO1件の形を先に決めておくと、後のコードすべてに型の恩恵が及ぶ。
export type Todo = {
  id: string
  title: string
  completed: boolean
  createdAt: string // ISO文字列で保存する（DateオブジェクトはそのままJSONにできないため）
}
