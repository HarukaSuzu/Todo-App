-- SupabaseのSQL Editorで実行してください
-- （supabase/schema.sql, supabase/add_auth.sql 実行済みが前提）。
--
-- Supabaseは、全テーブルを自動でRealtime配信するわけではなく、
-- "supabase_realtime" というpublication（配信対象リスト）に
-- 明示的に追加したテーブルだけを配信する。
alter publication supabase_realtime add table todos;

-- 補足: RLSはRealtimeにも適用される。
-- つまりこのテーブルの変更イベントは、
-- 「そのユーザーがSELECTできる行の変更だけ」が届く
-- （他人のTodoの変更イベントは届かない）。
