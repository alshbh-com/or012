# خطة العمل الشاملة

## 1. تغيير الهوية (R&O + تصميم نيون جامد)
- تغيير اسم التطبيق إلى **R&O** في:
  - `src/styles.css` متغيرات الـ theme (ألوان نيون: أخضر/سماوي/فوشيا على خلفية داكنة جداً)
  - `app_settings.app_name` → "R&O"
  - عناوين الصفحات + favicon + manifest
- إضافة تأثيرات نيون: glow shadows, gradient backgrounds, neon borders
- تحديث `dashboard-layout` لاستخدام التصميم الجديد

## 2. إعادة هيكلة صفحات الأدمن/المطعم/المندوب بنظام تبويبات حسب الحالة
بدل عرض كل الطلبات في قائمة واحدة، 3 تبويبات (Tabs) في الأعلى:
- **نشطة** (pending, accepted, preparing, picked_up, on_the_way)
- **مكتملة** (delivered)
- **ملغاة/مرتجعة** (cancelled, returned)

يطبق على: `admin.tsx`, `restaurant.tsx`, `driver.tsx`

## 3. قيود الصلاحيات
- **المندوب**: حذف زر "رفض" — يأخذ كل الطلبات المعينة
- **المطعم**: يتحكم فقط في حالة `preparing` (يأكد التحضير). لا يغير حالات أخرى.

## 4. صفحة المندوب — عرض معلومات المطعم
عند فتح طلب، يظهر:
1. اسم المطعم + لوكيشن المطعم (زر "اتجاهات للمطعم")
2. ثم تفاصيل العميل (اسم/تليفون/عنوان)

## 5. حل مشكلة scroll في dialog إضافة طلب
- إضافة `max-h-[90vh] overflow-y-auto` على محتوى الـ Dialog في `restaurant.tsx`

## 6. صفحات حسابات (للأدمن)
تبويب جديد "الحسابات" بـ:
- إجمالي مكتمل / ملغى / مرتجع / إيرادات / عمولة
- **تحصيل المناديب**: لكل مندوب، عدد الطلبات المسلمة + إجمالي مبالغ التحصيل المستحقة
- **تحصيل المطاعم**: لكل مطعم، إجمالي طلبات المسلمة + المستحق

## 7. خانة "طلبات غير معينة" (للأدمن)
تبويب أو قسم يعرض الطلبات `pending` بدون `driver_id` — للإسناد السريع

## 8. خانة "حالة المناديب" (للأدمن)
جدول لكل مندوب: الاسم / متصل أم لا / عدد الطلبات النشطة / حالة (فاضي/مشغول)

## 9. تحسين خريطة التتبع
- على صفحة الأدمن: عرض **كل** المناديب على الخريطة (متصلين + غير متصلين)
- علامة (badge) فوق أيقونة المندوب: "معه طلبات" أو "فاضي"

## التفاصيل التقنية

### ملفات سيتم تعديلها
```
src/styles.css                       — ألوان نيون + glows
src/routes/__root.tsx               — title R&O
index.html                          — title + meta
src/components/dashboard-layout.tsx — اسم + theme
src/routes/admin.tsx                — تبويبات + حسابات + غير معينة + مناديب
src/routes/restaurant.tsx           — تبويبات + scroll fix dialog + قيد preparing
src/routes/driver.tsx               — تبويبات + إزالة رفض + معلومات المطعم
src/components/drivers-map-inner.tsx — badge فوق الأيقونة
```

### استعلامات الحسابات
```sql
-- تحصيل مندوب
SELECT driver_id, COUNT(*), SUM(total), SUM(delivery_price)
FROM orders WHERE status='delivered' GROUP BY driver_id;

-- تحصيل مطعم
SELECT restaurant_id, COUNT(*), SUM(items_total)
FROM orders WHERE status='delivered' GROUP BY restaurant_id;
```
لا تغييرات في schema الـ DB — الأعمدة موجودة بالفعل.

### تحديث app_settings
```sql
UPDATE app_settings SET app_name='R&O' WHERE id=1;
```

---

هل أبدأ التنفيذ؟ أو هل تريد تعديل أي جزء قبل البدء؟