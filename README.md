# TODOアプリ（学習用スケルトン）

Next.js (App Router) + TypeScript + Tailwind CSS + Server Actions で作る、
TODO管理アプリです。Supabase Authでログインした本人のTODOだけが見える構成になっています。

## セットアップ

```bash
npm install
cp .env.example .env   # まだの場合。NEXT_PUBLIC_SUPABASE_URLとNEXT_PUBLIC_SUPABASE_ANON_KEYを記入する
npm run dev
```

事前に以下を済ませておく必要があります。

1. https://supabase.com でプロジェクトを作成
2. SQL Editorで `supabase/schema.sql` を実行し、`todos` テーブルを作成
3. 続けて `supabase/add_auth.sql` を実行し、`user_id`列の追加とRLSポリシーを設定
4. 続けて `supabase/enable_realtime.sql` を実行し、`todos`テーブルのRealtime配信を有効化
5. Project Settings > Data API で Project URL を、Project Settings > API Keys で anon(public) キーを取得し、`.env` に設定
6. Authentication > Providers > Email で「Confirm email」をオフにしておくと、確認メール無しですぐログインできて開発中は楽です（本番運用時はオンに戻すことを推奨）

> 補足: 本プロジェクトはNext.js 16系(Active LTS) + React 19を使用しています。
> セキュリティパッチが継続的に出るのは15.5系(Maintenance LTS)と16系のみのため、
> `npm audit` で脆弱性が出た場合は都度該当ラインの最新パッチ版に上げてください。

http://localhost:3000 を開いてください。未ログインの場合は自動的に `/login` へ飛びます。

## ファイル構成と役割

```
app/
  layout.tsx      共通レイアウト（globals.cssの読み込みなど）
  page.tsx        画面本体（Server Component。認証チェック・データ取得・受け渡しのみ）
  actions.ts      TODOのServer Actions（追加/切り替え/削除/編集）
  login/page.tsx  ログイン・新規登録画面
  auth/actions.ts 認証系のServer Actions（signIn/signUp/signOut）
components/
  TodoForm.tsx      追加フォーム（Client Component）
  TodoList.tsx      一覧・編集・useOptimistic・Realtime購読（Client Component）
  SubmitButton.tsx  useFormStatusで送信中表示を出す送信ボタン（Client Component）
lib/
  types.ts          Todoの型定義
  data.ts           データの永続化層（Supabase + RLS）
  validation.ts     Zodのスキーマ（Todoタイトル・id・認証フォーム用）
  supabase/
    server.ts       Server Component/Server Actions用のSupabaseクライアント（ユーザーのセッション付き）
    client.ts       ブラウザ（Client Component）用のSupabaseクライアント。Realtime購読で使用
    middleware.ts    セッション（アクセストークン）の自動リフレッシュ処理
supabase/
  schema.sql          todosテーブルを作成するSQL（最初に実行）
  add_auth.sql        user_id列の追加とRLSポリシーを設定するSQL（schema.sqlの後に実行）
  enable_realtime.sql todosテーブルのRealtime配信を有効化するSQL（add_auth.sqlの後に実行）
middleware.ts        ルートのmiddleware。毎リクエストでセッションを更新する
.env.example         必要な環境変数のひな形（gitにコミットしてよい）
.env                 実際の値（gitignore対象。絶対にコミットしない）
```

## このアプリで学べること

### 1. Server Actions
`app/actions.ts` や `app/auth/actions.ts` の先頭にある `"use server"` が目印です。
APIルート（`app/api/.../route.ts`）を書かずに、
フォームやボタンから直接サーバー側の関数を呼び出せます。

### 2. フォームの新しい書き方
`components/TodoForm.tsx` の `<form action={addTodo}>` に加えて、
`app/login/page.tsx` では1つの`<form>`の中で送信ボタンごとに
`formAction`を変える書き方も使っています（ログイン/新規登録を1フォームで出し分け）。

### 3. データの永続化とアクセス制御（fs → Prisma+SQLite → Supabase → RLS+認証）
`lib/data.ts` は今回、`service_role`キー（全データにアクセス可）から
「ログイン中ユーザーのセッションを持つクライアント」に差し替えました。
`todos`テーブルに設定したRow Level Securityのおかげで、
「自分のTodoしか見えない/操作できない」制御をアプリ側のコードで
毎回チェックしなくても、Postgres側が自動で守ってくれます。
今回も `getTodos()` / `addTodoToFile()` などの**関数名・型は1つも変えていません**。

### 4. revalidatePath
`actions.ts` の各関数の最後で `revalidatePath('/')` を呼んでいます。
データ更新後にこれを呼ばないと、画面は古いキャッシュのまま表示され続けます。
ただしこれは「自分の操作」にしか効きません。別タブ/別ユーザーの変更は、
このリクエストとは無関係に起きるため、これだけでは検知できません。

### 5. Realtime（他セッションの変更をpush配信で受け取る）
`components/TodoList.tsx` では、Supabaseの`postgres_changes`購読を使い、
`todos`テーブルへのINSERT/UPDATE/DELETEをWebSocket経由でリアルタイムに受け取っています。
`useOptimistic`が「自分の操作を、サーバーの返事を待たずに先読みして見せる」仕組みなのに対し、
Realtimeは「他人の操作が起きたことを、サーバー側からpushで知らせてもらう」仕組みです。
この2つを`liveTodos`というstateの上でうまく組み合わせています。

### 6. Zodによるバリデーション + useActionState
`lib/validation.ts` に、Todoのタイトル・id・ログイン情報のルールをZodスキーマとして
まとめています。このファイルはサーバー専用の処理を何もimportしていないので、
`app/actions.ts`（サーバー）だけでなく`components/TodoList.tsx`（クライアント）からも
同じスキーマをそのまま使えます。
`components/TodoForm.tsx`では、Reactの`useActionState`を使い、
サーバー側のバリデーション結果（成功/失敗とエラーメッセージ）を
そのままフォームの表示に反映しています。

## 進めてきたステップ

1. **土台の作成（完了）** — Server Actions / フォーム / fs永続化 / revalidatePathの基本形。
2. **編集機能の追加（完了）** — `updateTodo`アクションと編集UIを追加。
3. **useFormStatus / useOptimistic（完了）** — 操作系UIをClient Componentに切り出し、
   送信中表示と楽観的更新を追加。
4. **Prisma + SQLiteへ移行（完了）** — `lib/data.ts` の内部実装だけをPrisma Clientに差し替え。
5. **Supabaseへ移行（完了）** — `lib/data.ts` の内部実装だけをSupabaseクライアントに差し替え。
6. **Row Level Security + 認証（完了）** — Supabase Authでログイン機能を追加し、
   `todos`テーブルにRLSを設定。`service_role`キーからユーザーセッション付きクライアントへ切り替え。
7. **Realtime更新（完了）** — 別タブ/別セッションでの変更を`postgres_changes`イベントで購読し、
   `TodoList.tsx`内の`liveTodos`ステートに反映するようにした。
8. **Zodによるバリデーション強化（完了）** — `lib/validation.ts`にスキーマを集約し、
   `useActionState`でエラーメッセージをフォームに表示できるようにした。

これで最初に立てた学習ロードマップと、追加の任意ステップも一通り完了しました。

## 補足: なぜ `lib/data.ts` を分けているか

`page.tsx` や `actions.ts` が「データがどこにどう保存されているか」を
直接知らなくて済むようにするためです。
保存先を変えるたびにUI側のコードまで書き直すのは大変なので、
「データ操作の窓口」を1箇所にまとめておくと、後々の移行が楽になります。
fs → Prisma → Supabase → RLS対応、と3回の移行がまさにその実例でした。
