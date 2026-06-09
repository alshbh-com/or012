
-- Per-restaurant city delivery price overrides
CREATE TABLE IF NOT EXISTS public.restaurant_city_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  delivery_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, city_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_city_prices TO authenticated;
GRANT ALL ON public.restaurant_city_prices TO service_role;

ALTER TABLE public.restaurant_city_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage rcp" ON public.restaurant_city_prices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "restaurant reads own rcp" ON public.restaurant_city_prices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_city_prices.restaurant_id AND r.user_id = auth.uid()));

CREATE TRIGGER rcp_updated_at BEFORE UPDATE ON public.restaurant_city_prices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Soft-delete column for orders trash (preserves original status)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders(deleted_at);
