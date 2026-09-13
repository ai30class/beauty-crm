ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
