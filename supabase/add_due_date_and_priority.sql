-- SupabaseのSQL Editorで実行してください
-- （supabase/schema.sql, supabase/add_auth.sql, supabase/enable_realtime.sql 実行済みが前提）。
--
-- todosテーブルに「期限(due_date)」と「優先度(priority)」の2つの列を追加します。

-- 期限を記録する列を追加します。
-- null許容にしており、期限未設定のTodoはnullになります。
-- date型にしているため、
-- 例: 2026-09-24 のように日付文字列として保存されます。
alter table todos
  add column if not exists due_date date;

-- 優先度を記録する列を追加します（'high'/'medium'/'low' のいずれか）。
-- null許容にしており、未設定のTodoはnullになります。
-- CHECK制約で許可値を固定します。
-- DBレベルで不正な値（例: 'urgent'）の保存をブロックできるため、
-- アプリ側の入力チェックが漏れてもデータを汚さない保険になります。
alter table todos
  add column if not exists priority text
  check (priority in ('high', 'medium', 'low'));

-- 補足: 各列は if not exists を付けているため、一度実行後に同じSQLを
-- 再実行してもエラーになりません。