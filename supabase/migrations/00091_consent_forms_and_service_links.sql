-- 00091：擴充同意書到全部四份，並補上「預約／服務記錄記住是哪個服務項目」的洞
--
-- 背景（Emma 9/23 決定）：
--   ① 顧客第一次到店消費「紋繡／接睫毛／除毛」任一類服務，一定要簽「該服務的同意書」＋
--      「肖像同意書」（因為一定拍 before/after 留底避免糾紛）。要自動判斷該提醒簽哪份，
--      系統得先知道這筆預約／這筆服務記錄是哪個服務項目——但 appointments、service_records
--      原本都沒有存這個關聯，只在畫面上選過就丟掉（service_records 只存自由文字
--      service_name，appointments 完全沒存）。這份 migration 補上這個關聯。
--   ② 順便解決另一個舊缺口（見 2026-09-20 對照表決定 8）：月報表要能拆「這個月紋繡做了
--      多少、美甲做了多少」，所以 service_records 也記一份 category 快照。
--   ③ 只有「紋繡類」需要重簽（美睫、除毛不用）；同一類底下「同一個方向」由 Emma 自己在
--      服務項目管理替每個項目標「同意書分組」（例如「霧眉」「霧眉補色」都標「眉部」，
--      「紋眼線」標「眼線」），不用系統去猜名字像不像。
--   ④ Emma 追問：「同意書分類」能不能自動歸類、不要靠比對 category 這個自由文字欄位打的字
--      一模一樣？改用一個獨立的 consent_form_type 欄位（紋繡／接睫毛／除毛），這份 migration
--      會用關鍵字自動幫「既有」的服務項目分類一次，之後系統只看這個欄位，不再看 category 文字；
--      分錯的話事後在服務項目管理手動改「同意書分類」下拉選單即可。

-- ① appointments／service_records 記住選的是哪個服務項目（都可空，不影響舊資料）
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS service_template_id uuid REFERENCES public.service_templates(id) ON DELETE SET NULL;

ALTER TABLE public.service_records
  ADD COLUMN IF NOT EXISTS service_template_id uuid REFERENCES public.service_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text; -- 存檔當下的分類快照，之後服務項目改分類不影響舊記錄、月報表才拆得出正確歷史數字

-- ②a 服務項目：同意書分類（獨立欄位，不依賴 category 這個自由文字欄位打的字一模一樣）。
-- Emma 9/23 提出：能不能自動歸類、不要靠比對分類文字——這裡用關鍵字自動判斷一次「既有」的
-- 服務項目，寫進這個新欄位；之後系統一律只看這個欄位，不再看 category 的文字內容。
-- 判斷錯的話，到「服務項目管理」打開該項目，改「同意書分類」下拉選單即可，不影響 category 顯示文字。
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS consent_form_type text
  CHECK (consent_form_type IN ('tattoo', 'lash', 'hair_removal'));

-- 自動歸類既有資料（只在還沒設定過、即 consent_form_type 是空的項目上跑一次；不會覆蓋已經人工設定過的）
UPDATE public.service_templates
SET consent_form_type = 'tattoo'
WHERE consent_form_type IS NULL AND (category ILIKE '%紋%' OR category ILIKE '%繡%' OR category ILIKE '%除色%' OR name ILIKE '%紋%' OR name ILIKE '%繡%' OR name ILIKE '%霧眉%' OR name ILIKE '%飄眉%');
-- Emma 9/23：「除色類」也歸紋繡（跟去除紋繡色素相關，同一套風險告知），關鍵字沒有涵蓋
-- 「除色」兩個字，原本會漏歸類，故補上；此 UPDATE 冪等，之後再跑一次不會動到已手動調整過的項目

UPDATE public.service_templates
SET consent_form_type = 'lash'
WHERE consent_form_type IS NULL AND (category ILIKE '%睫%' OR name ILIKE '%睫%');

UPDATE public.service_templates
SET consent_form_type = 'hair_removal'
WHERE consent_form_type IS NULL AND (category ILIKE '%除毛%' OR category ILIKE '%脫毛%' OR name ILIKE '%除毛%' OR name ILIKE '%脫毛%' OR name ILIKE '%蜜蠟%' OR name ILIKE '%穿線%');

-- ②b 服務項目：同意書分組（只有紋繡類會用到，其他分類留空即可）
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS consent_group text;

-- ③ 同意書擴充到四種：portrait（肖像，已存在）＋ tattoo（紋繡）／lash（接睫毛）／hair_removal（除毛）
ALTER TABLE public.client_consents
  DROP CONSTRAINT IF EXISTS client_consents_form_type_check;
ALTER TABLE public.client_consents
  ADD CONSTRAINT client_consents_form_type_check
  CHECK (form_type IN ('portrait', 'tattoo', 'lash', 'hair_removal'));

-- 簽署當下的同意書分組快照（只有 form_type='tattoo' 有意義），用來判斷「同一個方向」要不要重簽：
-- 拿新預約服務項目的 consent_group，去比對這位顧客最近一筆 tattoo 同意書存的 consent_group，
-- 一樣就不用重簽、不一樣（或對方當初沒設分組）就當作沒簽過、要重簽。
ALTER TABLE public.client_consents
  ADD COLUMN IF NOT EXISTS consent_group text;

-- ④ 健康狀況調查（紋繡／接睫毛／除毛三份才有，肖像同意書沒有健康問卷、這兩欄留空）
ALTER TABLE public.client_consents
  ADD COLUMN IF NOT EXISTS health_answers jsonb, -- [{question, answer:'yes'|'no'}, ...]
  ADD COLUMN IF NOT EXISTS health_notes text;    -- 「若上述任一項目回答是，請詳細說明」的自由文字
