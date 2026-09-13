-- 多人協作分帳改法：從「業績占比 × 各自抽成率」改成「直接輸入每人實拿%」。
-- 原因：店家跟員工A、員工B的抽成率不一定相同時，原本的算法會讓店家實拿比例隨兩人業績怎麼分而變動，
-- 不是固定值；改成直接輸入每人實拿%，店家實拿 = 100% - staff_share_percent - co_staff_share_percent，
-- 不再透過 staff.commission_rate 計算，所見即所得。
--
-- staff_share_percent 語意變更：現在是主要人員(staff_id)直接實拿佔總金額的%（不再是「業績占比」，
-- 不用再乘抽成率）。新增 co_staff_share_percent：協作人員(co_staff_id)直接實拿佔總金額的%，
-- 跟 staff_share_percent 各自獨立輸入，兩者相加不必等於100，差額就是店家實拿的比例。
ALTER TABLE public.service_records ADD COLUMN IF NOT EXISTS co_staff_share_percent numeric(5,2);
