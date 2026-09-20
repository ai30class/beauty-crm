-- 00083：顧客施術前後照片改存「私有」空間
--
-- 為什麼要換：舊的 appd2yss59nidj5_service_photos 是公開空間，知道網址的人不用登入就能看，
-- 而且任何登入的人（包含顧客帳號）都能列出、讀取整個空間的檔案，不同店家之間也沒有隔離。
-- 顧客的臉部／眼周照片不該這樣放。
--
-- 做法：
--   ① 新建私有空間 client_service_photos（不公開，只能用「簽名網址」限時觀看）。
--   ② 檔案路徑第一段＝店家 ID（店家本人是自己的 ID，員工是所屬店家的 ID）；
--      只有該店家本人與所屬員工，能讀取、上傳、刪除自己店家資料夾裡的檔案。
--      匿名（沒登入）與其他店家、顧客帳號一律看不到。
--   ③ 舊空間 appd2yss59nidj5_service_photos 不動，之後只留給服務人員大頭照
--      （大頭照要顯示在顧客預約頁，本來就是公開的）。舊空間目前 0 個檔案，沒有舊照片要搬。

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client_service_photos',
  'client_service_photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS client_photos_select ON storage.objects;
CREATE POLICY client_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client_service_photos'
    AND (storage.foldername(name))[1] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
  );

DROP POLICY IF EXISTS client_photos_insert ON storage.objects;
CREATE POLICY client_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client_service_photos'
    AND (storage.foldername(name))[1] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
  );

DROP POLICY IF EXISTS client_photos_delete ON storage.objects;
CREATE POLICY client_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client_service_photos'
    AND (storage.foldername(name))[1] = COALESCE(public.staff_shop_owner_id(), auth.uid())::text
  );
