-- 00090：顧客同意書電子簽名（第一份：肖像權暨影像蒐集使用同意書）
--
-- 背景：Emma 提供四份紙本同意書（紋繡／接睫毛／除毛／肖像），先做一份代表性的驗證流程，
-- 選定肖像同意書（涉及個資法第8條告知、三層勾選、簽名見證，四份裡最完整）。其餘三份之後
-- 用同一張表＋form_type 擴充，不用再開新表。
--
-- 簽名圖檔存放：沿用既有的 client_service_photos 私有空間（migration 00083），不用新開 bucket，
-- 路徑用 <店家 ID>/consents/<consent id>/customer.png、.../staff.png，該空間的 RLS 政策本來就
-- 用路徑第一段判斷店家，任何子路徑都適用，不用改 storage policy。
--
-- 簽名欄設計（Emma 9/22 決定，跟紙本不同——紙本是「本人」＋「法定代理人」兩欄各簽一次）：
--   只留一個簽名區＋一個「簽署人姓名」文字欄，畫面上加一行提示「未滿18歲請由法定代理人簽署」，
--   不強制簽兩次。is_minor 只用來記錄當下顧客是否未成年，簽名法律效力由簽署人自己負責。
--
-- 利用期間（同意書內文，Emma 9/22 決定不寫死年數）：改成「至服務關係終了為止；服務關係終了後，
-- 除依法令規定或本店執行業務所必須之保存期間外，本店將於合理期間內刪除或匿名化」，寫死在畫面文字，
-- 不需要資料庫欄位存數字。
--
-- 員工權限比照服務記錄（00068 staff_manage_own_service_records）：員工只能建立、查看自己
-- 見證（staff_id = 自己）的同意書，不能看其他員工經手的；商家本人可看全部。
-- 不開放 UPDATE／DELETE 政策：簽名紀錄簽完就不可再改，顧客要求刪除由 Emma 用 SQL 手動處理
-- （跟忘記刪除密碼、清測試資料同等級的人工流程，不做自助刪除介面）。

CREATE TABLE public.client_consents (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id           uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  form_type             text NOT NULL DEFAULT 'portrait' CHECK (form_type IN ('portrait')),

  -- 簽署當下的顧客資料快照，之後顧客資料改了不會影響已簽的同意書
  customer_name         text NOT NULL,
  customer_phone        text NOT NULL,
  customer_birthday     date,
  service_item          text,
  service_date          date NOT NULL DEFAULT current_date,

  -- 肖像同意書的三層勾選（見同意書第三項）：②沒勾，③不該是 true，畫面負責擋、這裡不加 CHECK
  -- 是為了將來 form_type 增加其他同意書時，這三欄可能不是每種同意書都用得到
  consent_internal_use  boolean NOT NULL DEFAULT false,
  consent_marketing     boolean NOT NULL DEFAULT false,
  consent_full_face     boolean NOT NULL DEFAULT false,

  is_minor              boolean NOT NULL DEFAULT false,
  signer_name           text NOT NULL,

  customer_signature_path text NOT NULL,
  staff_signature_path    text NOT NULL,
  staff_id                uuid REFERENCES public.staff(id) ON DELETE SET NULL,

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_consents_customer_id_idx ON public.client_consents(customer_id);
CREATE INDEX client_consents_owner_id_idx ON public.client_consents(owner_id);

ALTER TABLE public.client_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_manage_own_consents" ON public.client_consents FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 員工：只能建立、查看自己見證（staff_id = 自己）的同意書，比照 00068 服務記錄的做法
CREATE POLICY "staff_select_own_consents" ON public.client_consents FOR SELECT TO authenticated
  USING (owner_id = public.staff_shop_owner_id() AND staff_id = public.staff_own_staff_id());

CREATE POLICY "staff_insert_own_consents" ON public.client_consents FOR INSERT TO authenticated
  WITH CHECK (owner_id = public.staff_shop_owner_id() AND staff_id = public.staff_own_staff_id());
