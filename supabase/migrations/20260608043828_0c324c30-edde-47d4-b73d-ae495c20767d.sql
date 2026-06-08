
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS is_offline boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_location_url text;

-- Update notification trigger: do NOT notify driver on status changes (only on assignment)
CREATE OR REPLACE FUNCTION public.tg_notify_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rest_user uuid;
  drv_user uuid;
  admin_id uuid;
  rest_name text;
BEGIN
  SELECT user_id, name INTO rest_user, rest_name FROM public.restaurants WHERE id = NEW.restaurant_id;
  IF NEW.driver_id IS NOT NULL THEN
    SELECT user_id INTO drv_user FROM public.drivers WHERE id = NEW.driver_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    FOR admin_id IN SELECT user_id FROM public.user_roles WHERE role='admin' LOOP
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (admin_id, 'طلب جديد', 'طلب جديد من مطعم '||COALESCE(rest_name,'')||' ورايح '||COALESCE(NEW.customer_address,''), '/admin');
    END LOOP;
  ELSIF NEW.driver_id IS DISTINCT FROM OLD.driver_id AND NEW.driver_id IS NOT NULL THEN
    IF drv_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (drv_user,'تم تعيين أوردر جديد','تم تعيين أوردر جديد من مطعم '||COALESCE(rest_name,'')||' ورايح '||COALESCE(NEW.customer_address,''),'/driver');
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF rest_user IS NOT NULL THEN
      INSERT INTO public.notifications(user_id,title,body,link)
      VALUES (rest_user,'تحديث حالة الطلب','الطلب '||NEW.order_number||' أصبح '||NEW.status,'/restaurant');
    END IF;
    -- intentionally do NOT notify driver on status changes
  END IF;
  RETURN NEW;
END $function$;
