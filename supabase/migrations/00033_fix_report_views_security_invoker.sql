-- 嚴重資料外洩：monthly_income_summary / monthly_expense_summary 這兩個報表用的
-- view 建立時沒設定 security_invoker，Postgres 預設會用「view 擁有者」（也就是
-- postgres 這個有 BYPASSRLS 權限的角色）的身分去查底層表，等於完全繞過
-- service_records / expenses 表上的 owner_id = auth.uid() RLS 規則。
-- 實測：用完全不相干的顧客帳號（不是任何店家）直接查
-- monthly_income_summary，可以看到店家真實的月收入、服務筆數——任何登入帳號
-- 都能看到全平台所有店家的營收與支出資料。
-- 加上 security_invoker = on 後，view 會改用「呼叫者」自己的身分查底層表，
-- RLS 規則才會正確套用，商家只看得到自己的資料。
ALTER VIEW "public"."monthly_income_summary" SET (security_invoker = on);
ALTER VIEW "public"."monthly_expense_summary" SET (security_invoker = on);
