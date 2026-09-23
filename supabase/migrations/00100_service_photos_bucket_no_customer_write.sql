-- 00100：舊的公開照片空間，不再讓顧客帳號上傳／刪除（2026-09-23 安全審查，報告之外多查到的）
--
-- appd2yss59nidj5_service_photos 是最早的公開空間，現在只放服務人員大頭照（路徑 staff-avatars/…）。
-- 00004 的規則是「任何登入帳號」都能上傳與刪除——顧客用 LINE／Google 登入預約頁之後也算登入帳號，
-- 等於任何顧客都能刪掉全店的大頭照、或往裡面塞檔案。不會外洩顧客資料，但可以惡搞。
--
-- 修法：上傳／刪除只開給「商家或員工帳號」（profiles.account_type <> 'customer'）。
-- 讀取維持公開（大頭照本來就要讓顧客在預約頁看到），不動。
--
-- 已知限制：大頭照路徑只有 staff-avatars/<時間>_<亂數>，沒有店家資料夾，所以不同店家的老闆彼此之間
-- 技術上仍能互刪對方的大頭照。要擋這個得改路徑規則（加店家 ID 資料夾）並搬檔，目前只有一家店在用，
-- 先不做，等店家變多再處理。
--
-- 驗證：
--   select policyname, roles, cmd, qual, with_check from pg_policies
--   where schemaname='storage' and tablename='objects' and policyname like '%service_photos%';
--   預期：auth_upload／auth_delete 的條件多了 account_type <> 'customer'；public_read 與 auth_select 不變。

DROP POLICY IF EXISTS "auth_upload_service_photos" ON storage.objects;
CREATE POLICY "auth_upload_service_photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'appd2yss59nidj5_service_photos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
);

DROP POLICY IF EXISTS "auth_delete_service_photos" ON storage.objects;
CREATE POLICY "auth_delete_service_photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'appd2yss59nidj5_service_photos'
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_type <> 'customer')
);
