# إعداد حسابات KAREEM Chemistry على Cloudflare Pages + Supabase

## 1) متغيرات Cloudflare
من Cloudflare Dashboard افتح Workers & Pages → مشروع الموقع → Settings → Variables and Secrets، وأضف لكل من Production وPreview حسب حاجتك:
- `SUPABASE_URL`: رابط مشروع Supabase.
- `SUPABASE_ANON_KEY`: المفتاح العام publishable/anon.
- `SUPABASE_SERVICE_ROLE_KEY`: مفتاح service_role/secret. أضفه كـ Secret فقط؛ لا تضعه في HTML أو GitHub ولا ترسله في المحادثات.

بعد الحفظ أعد نشر Pages.

## 2) إنشاء الجداول
افتح Supabase → SQL Editor، والصق كامل محتوى `supabase/schema.sql` ثم Run.

## 3) تفعيل لوحة الإدارة
1. شغّل ملف `supabase/schema.sql` مرة أخرى في Supabase → SQL Editor؛ أُضيف إليه جدول بنك الأسئلة الخاص بلوحة الأدمن.
2. أنشئ حسابك من الموقع كحساب عادي أولًا.
3. في Supabase → SQL Editor نفّذ الاستعلام التالي بعد استبدال `YOUR_USERNAME` باسم المستخدم الحقيقي:
```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where lower(raw_user_meta_data->>'username') = lower('YOUR_USERNAME');
```
4. تأكد أن الاستعلام عدّل صفًا واحدًا، ثم سجّل الخروج وادخل مرة أخرى.
5. افتح `https://kareem-chemistry-git.pages.dev/admin`.
التسجيل العام ينشئ حسابات طلاب فقط؛ لا يمكن للطالب منح نفسه صلاحية الأدمن.

## 4) مميزات لوحة الإدارة
- نظرة عامة: عدد الطلاب، الأسئلة الإضافية، الطلاب ذوو النشاط خلال آخر 7 أيام، وعدد سجلات التقدم المحفوظة.
- إدارة الطلاب: عرض الحسابات، تعديل الاسم الظاهر، وحذف الحساب.
- بنك الأسئلة: إضافة وتعديل وحذف أسئلة اختيار من متعدد؛ الأسئلة المفعّلة تظهر للطلاب داخل بنك الأسئلة تحت فصل `أسئلة إضافية من المدرّس`.

## ملاحظات أمان
- كلمة المرور يديرها Supabase Auth ولا نخزنها في جدول الموقع.
- الجلسة تحفظ في Cookies من نوع HttpOnly وSecure وSameSite=Lax.
- استعادة كلمة المرور غير آلية حاليًا لأن التسجيل لا يطلب بريدًا أو هاتفًا؛ مسؤول الموقع يعالج طلبات الاستعادة يدويًا.
- بيانات التقدم المحلية الحالية لا تُرفع تلقائيًا إلى الحساب في هذه النسخة؛ هذا يمنع رفع بيانات جهاز دون موافقة واضحة. مزامنة progress/notes تحتاج ربطًا منفصلًا واختبارًا بعد تفعيل الجداول.
- إدارة الطلاب تتيح تعديل الاسم الظاهر أو حذف الحساب نهائيًا. حذف الحساب يزيل بياناته المرتبطة وفق إعدادات Supabase.
