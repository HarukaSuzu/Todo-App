-- SupabaseのSQL Editorで実行してください。
-- これが最初のセットアップ用SQL。todosテーブルを作成します。
-- （その後の認証導入は supabase/add_auth.sql で行います）

create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);
