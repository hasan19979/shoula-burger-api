# شعلة برجر — API (Node.js + PostgreSQL)

سيرفر حقيقي فيه REST API، قاعدة بيانات Postgres، تسجيل دخول بكلمة سر مشفّرة (bcrypt) ورموز JWT، وحماية أساسية (CORS محدد، rate limiting، فحص المدخلات، حساب الأسعار من السيرفر مش من المتصفح).

## الخطوات كاملة من الصفر

### 1) اعملي قاعدة بيانات مجانية على Neon

1. روحي على **neon.tech** واعملي حساب (تقدري تسجلي بجيميل)
2. اضغطي **Create a project**، اختاري أي اسم، واختاري منطقة قريبة (Europe مثلاً)
3. بعد ما يتعمل المشروع، رح تلاقي **Connection string** — رابط طويل يبدأ بـ `postgresql://...`
4. انسخيه، رح نحتاجه بالخطوة الجاية

### 2) جهّزي المشروع على جهازك

1. فكّي ضغط الفولدر اللي بعتهولك (`shoula-api`)
2. افتحي Terminal جواه (نفس طريقة الفولدرات السابقة)
3. اكتبي:
   ```
   npm install
   ```
4. انسخي ملف `.env.example` وسمّيه `.env`، وافتحيه بمحرر نصوص:
   - حطي رابط Neon اللي نسختيه بمكان `DATABASE_URL`
   - غيّري `JWT_SECRET` لأي نص عشوائي طويل (مثلاً 40 حرف/رقم عشوائي)
   - خليكي `PORT` متل ما هو

### 3) جهزّي الجداول وابدئي بالبيانات الحالية

بنفس Terminal:
```
npm run migrate
```
هاد بيبني كل الجداول بقاعدة البيانات. بعدها:
```
npm run seed
```
هاد بيعمل:
- حساب دخول أول (إيميل افتراضي `owner@shoulaburger.com` وكلمة سر `ChangeMe123!` — **لازم تغيّريها فوراً بعد أول دخول**، أو حطي `ADMIN_EMAIL` و`ADMIN_PASSWORD` بملف `.env` قبل ما تشغلي `npm run seed` عشان تختاري القيم من البداية)
- الفئات الأربعة الحالية
- كل الـ 23 صنف الموجودين فعلياً بالمنيو، بأسعارهم ومكوناتهم

### 4) جربيه محلياً

```
npm start
```
افتحي متصفح على `http://localhost:4000/health` — لازم يطلعلك `{"status":"ok"}`.

### 5) ارفعي الكود على GitHub (مطلوب لـ Render)

1. اعملي حساب على **github.com** (لو ما عندك)
2. اضغطي **New repository**، سميه `shoula-burger-api`، خليه **Private**
3. أسهل طريقة بدون أوامر Git: بصفحة الـ repo الفاضية، اضغطي **uploading an existing file**، واسحبي كل ملفات فولدر `shoula-api` (ما عدا `node_modules` و`.env` — مش موجودين أصلاً بالـ zip المرسل)
4. اضغطي **Commit changes**

### 6) استضيفيه على Render

1. روحي على **render.com** واعملي حساب (تقدري تربطيه بحساب GitHub مباشرة)
2. اضغطي **New +** ← **Web Service**
3. اختاري الـ repo (`shoula-burger-api`) اللي رفعتيه
4. الإعدادات:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. تحت **Environment Variables**، ضيفي بالضبط نفس المتغيرات اللي بملف `.env` عندك (`DATABASE_URL`, `JWT_SECRET`, `ALLOWED_ORIGINS`) — **لا** تحطي `PORT`، Render بيحددها هو تلقائياً
6. اضغطي **Create Web Service** واستني لحد ما يخلص النشر (Deploy)
7. بعد ما يخلص، رح يديكي رابط شبيه بـ:
   ```
   https://shoula-burger-api.onrender.com
   ```
   جربي تفتحي `https://shoula-burger-api.onrender.com/health` — لازم يطلعلك نفس نتيجة الفحص المحلي

### ملاحظة عن Render المجاني
النسخة المجانية "بتنام" بعد فترة بدون استخدام، وأول طلب بعد النوم بياخذ 20-30 ثانية لحد ما يصحى. هاد طبيعي وما بأثر على البيانات (البيانات بتضل محفوظة بـ Neon دايماً).

## اختبار سريع للـ API بعد النشر

```
curl https://shoula-burger-api.onrender.com/api/products
curl https://shoula-burger-api.onrender.com/api/categories
curl https://shoula-burger-api.onrender.com/api/settings
```
لازم ترجّعلك بيانات المنيو والفئات والإعدادات اللي زرعناها بالخطوة 3.

لتسجيل الدخول:
```
curl -X POST https://shoula-burger-api.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@shoulaburger.com","password":"ChangeMe123!"}'
```
لازم يرجّعلك `token` طويل — هاد الرمز اللي لوحة التحكم رح تستخدمه لأي عملية تعديل.

## شو التالي؟

هاد بس **الأساس (Backend)** — سيرفر شغال وقاعدة بيانات حقيقية وAPI كامل. **الموقع ولوحة التحكم الحاليين (اللي بيشتغلوا على Google Sheets) لسا ما اترتبطوا بيه.** الخطوة الجاية هي وصل الواجهات الحالية (أو واجهات جديدة) بهاد الـ API بدل جوجل شيت — قوليلي لما يخلص عندك النشر وتتأكدي إنه شغال، ونبلش فيها.
