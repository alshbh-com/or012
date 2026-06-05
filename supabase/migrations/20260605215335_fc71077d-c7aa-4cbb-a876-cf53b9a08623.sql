
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS closed_for_restaurant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_for_restaurant_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_for_driver boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_for_driver_at timestamptz;
