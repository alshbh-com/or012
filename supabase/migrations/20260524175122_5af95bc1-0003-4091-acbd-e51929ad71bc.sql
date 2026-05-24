ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at timestamptz;