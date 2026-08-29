-- 服務項目分類：讓同時做紋繡/美睫/除毛/美甲等多種服務的店家能分類整理，
-- 自由文字（不是固定選項），因為不同類型的店家需要的分類完全不同。
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '';
