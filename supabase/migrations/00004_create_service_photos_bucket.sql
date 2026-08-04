
-- 建立施術照片 Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'appd2yss59nidj5_service_photos',
  'appd2yss59nidj5_service_photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 已登入用戶可上傳照片
CREATE POLICY "auth_upload_service_photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'appd2yss59nidj5_service_photos');

-- 已登入用戶可讀取自己的照片
CREATE POLICY "auth_select_service_photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'appd2yss59nidj5_service_photos');

-- 已登入用戶可刪除自己的照片
CREATE POLICY "auth_delete_service_photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'appd2yss59nidj5_service_photos');

-- 公開讀取（publicUrl 用）
CREATE POLICY "public_read_service_photos"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'appd2yss59nidj5_service_photos');
