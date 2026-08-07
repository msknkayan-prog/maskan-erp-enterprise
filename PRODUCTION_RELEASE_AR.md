# مسكن الكيان ERP — Enterprise Final v1.1 Production

إصدار الاستقرار المخصص للاستخدام الرسمي.

## الإصلاحات المدمجة

- تحديد علاقة مدير المشروع صراحةً عبر `projects_project_manager_id_fkey` لمنع تعارض PostgREST بين `projects` و`profiles`.
- تحديد علاقة منفذ الاعتماد عبر `approval_history_acted_by_fkey`.
- تصحيح سجل الاعتمادات ليستخدم `acted_at` بدل `created_at`.
- إزالة Catch-all Rewrite من Vercel حتى لا تُعاد `index.html` مكان ملفات CSS/JS.
- تحديث Service Worker بحيث لا يستخدم `index.html` كبديل لملفات JavaScript أو CSS.
- إضافة ترويسات أمان أساسية على Vercel ومنع تضمين النظام داخل iframe.
- رفع رقم النسخة التشغيلية إلى **Enterprise Final v1.1 Production**.

## قبل الاعتماد الرسمي

1. شغّل `sql/05_production_verification.sql` في Supabase SQL Editor وراجع العلاقات وRLS.
2. من النظام افتح **إعدادات النظام → فحص النظام** وتأكد أن جميع الاختبارات ناجحة.
3. اختبر إنشاء مشروع، جهة، عقد، طلب صرف، مستخلص، ودفعة تجريبية.
4. اختبر صلاحيات حساب غير مدير للتأكد أن RLS يمنع الوصول غير المصرح.
5. احتفظ بنسخة احتياطية من قاعدة البيانات قبل إدخال البيانات التشغيلية.

> ملاحظة: Publishable Key الخاص بـ Supabase مصمم للاستخدام في المتصفح، لكن أمان البيانات يعتمد على تفعيل RLS وسياساته بصورة صحيحة. لا تضع Secret/Service Role Key في الواجهة الأمامية.
