-- SupabaseのSQL Editorで実行してください（supabase/schema.sql実行済みが前提）。
-- 既存のテストデータには所有者(user_id)がいないため、先に全て削除します。
truncate table todos;

-- 誰が作成したTodoかを記録する列を追加する。
-- lib/data.ts側でinsert時に明示的にuser_idをセットしているが、
-- default auth.uid() を付けておくと、万一セットし忘れても
-- 「今ログインしているユーザーのID」が自動的に入る保険になる。
alter table todos
  add column user_id uuid not null default auth.uid() references auth.users(id) on delete cascade;

-- 行単位のアクセス制御(Row Level Security)を有効にする。
-- 有効にした瞬間、下で明示的に許可するポリシーを書かない限り、
-- （service_roleキー以外からは）誰も一切読み書きできなくなる。
alter table todos enable row level security;

create policy "Users can view their own todos"
  on todos for select
  using (auth.uid() = user_id);

create policy "Users can insert their own todos"
  on todos for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own todos"
  on todos for update
  using (auth.uid() = user_id);

create policy "Users can delete their own todos"
  on todos for delete
  using (auth.uid() = user_id);
