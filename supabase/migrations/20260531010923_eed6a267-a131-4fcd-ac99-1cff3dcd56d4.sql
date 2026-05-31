ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_is_closed ON public.orders(is_closed);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_at ON public.orders(assigned_at);