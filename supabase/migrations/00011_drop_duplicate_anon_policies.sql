
-- 移除剛才重複新增的政策（舊的已存在）
DROP POLICY IF EXISTS "anon can read active staff" ON staff;
DROP POLICY IF EXISTS "anon can read holidays" ON holidays;
