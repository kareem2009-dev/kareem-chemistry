# إعداد حسابات KAREEM Chemistry على Cloudflare Pages + Supabase

## 1) متغيرات Cloudflare
من Cloudflare Dashboard افتح Workers & Pages → مشروع الموقع → Settings → Variables and Secrets، وأضف لكل من Production وPreview حسب حاجتك:
- `SUPABASE_URL`: رابط مشروع Supabase.
- `SUPABASE_ANON_KEY`: المفتاح العام publishable/anon.
- `SUPABASE_SERVICE_ROLE_KEY`: مفتاح service_role/secret. أضفه كـ Secret فقط؛ لا تضعه في HTML أو GitHub ولا ترسله في المحادثات.

بعد الحفظ أعد نشر Pages.

## 2) إنشاء الجداول
افتح Supabase → SQL Editor، والصق كامل محتوى `supabase/schema.sql` ثم Run.

## 3) ترقية حساب الأدمن الأول
1. سجّل حسابًا عاديًا من الموقع باسم المستخدم الذي تريده للأدمن.
2. في Supabase → SQL Editor نفّذ الاستعلام التالي بعد استبدال الاسم:
```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(raw_user_meta_data->>'username') = lower('YOUR_USERNAME');
```
3. سجّل الخروج ثم الدخول مجددًا. لن يستطيع التسجيل العام إنشاء أدمن لنفسه.

## ملاحظات أمان
- كلمة المرور يديرها Supabase Auth ولا نخزنها في جدول الموقع.
- الجلسة تحفظ في Cookies من نوع HttpOnly وSecure وSameSite=Lax.
- استعادة كلمة المرور غير آلية حاليًا لأن التسجيل لا يطلب بريدًا أو هاتفًا؛ مسؤول الموقع يعالج طلبات الاستعادة يدويًا.
- بيانات التقدم المحلية الحالية لا تُرفع تلقائيًا إلى الحساب في هذه النسخة؛ هذا يمنع رفع بيانات جهاز دون موافقة واضحة. مزامنة progress/notes تحتاج ربطًا منفصلًا واختبارًا بعد تفعيل الجداول.
- لوحة الأدمن الحالية تعرض قائمة الطلاب فقط. لا توجد أدوات حذف/تعديل/حظر حسابات في هذه المرحلة.
