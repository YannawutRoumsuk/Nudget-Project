# Nudget — สถานะ 6 กันยายน 2026

## ขอบเขต

บัญชีรายรับรายจ่ายส่วนตัว ผ่าน LINE และเว็บ โดยข้อมูลทั้งสองช่องทางใช้ PostgreSQL ชุดเดียวกัน รองรับหลายคนโดยแต่ละ LINE account มีบัญชีของตัวเองแยกจากกัน

## พร้อมใช้แล้ว

- LINE webhook ของ Nudget ตรวจลายเซ็น กัน event ซ้ำ และรับเฉพาะ LINE id ที่อยู่ใน `LINE_ALLOWED_USER_ID`
- แยกข้อมูลรายบุคคล: ตาราง `users` เป็นเจ้าของ transactions, bills, bill_payments, monthly_plans, pending_slips และ reminder_deliveries ทุก query กรองด้วย `user_id`
- เข้าเว็บด้วย LINE login (LIFF) แล้ว session ผูกกับบัญชีของคนนั้น รหัสผ่าน dashboard ใช้ได้เฉพาะตอนมีผู้ใช้คนเดียว
- เตือนบิลส่งเข้า LINE ของเจ้าของบิลแต่ละคน และคนหนึ่งส่งไม่สำเร็จไม่หยุดของคนอื่น
- พิมพ์รายรับ/รายจ่ายภาษาไทย วันที่ย้อนหลัง หมวดหมู่ และวิธีจ่าย เช่น `กาแฟ 85 บัตรเครดิต`
- ส่งรูปสลิปโอนเงิน: OCR ไทย/อังกฤษทำงานบนเครื่อง อ่านยอด/วันที่/ผู้รับ แล้วถามค่าใช้จ่ายก่อนบันทึก ผู้ใช้แก้ยอดในข้อความตอบได้
- คำสั่ง LINE: `วันนี้`, `เดือนนี้`, `งบ`, `บิล`, `ลบ`, `ช่วย`, `ไอดี`
- Rich Menu 6 ปุ่ม: ภาพรวม รายการ บิล แผนเดือน สรุป และช่วย ติดตั้งเป็นเมนูเริ่มต้นแล้ว
- เว็บ: dashboard และกราฟ, เพิ่ม/ลบ/แก้รายการ, หมวดและวิธีจ่าย, filter รายการ
- บิล: รายเดือนหรือครั้งเดียว, วันที่ครบกำหนด, วิธีจ่ายรวมบัตรเครดิต, เปิด/ปิดรายการ และทำเครื่องหมายจ่ายแล้ว
- การจ่ายบิลสร้าง transaction จริง การย้อนสถานะลบ transaction ที่เชื่อมกัน และการแก้บิลที่จ่ายแล้วอัปเดตรายการเดือนปัจจุบัน
- แผนเดือน: รายรับที่คาด, เป้าหมายออม, งบอาหารต่อวัน, ค่าเดินทางต่อวัน/จำนวนวันทำงาน, บิลค้าง และคำแนะนำยอดใช้ได้ต่อวัน
- แสดงยอดใช้บัตรเครดิตเดือนปัจจุบัน
- เตือนบิลทาง LINE ตาม `REMINDER_HOUR` และ `REMINDER_DAYS_BEFORE` เมื่อเซิร์ฟเวอร์เปิดอยู่ พร้อมกันส่งซ้ำในฐานข้อมูล

## Production

- GitHub private repo: `https://github.com/YannawutRoumsuk/Nudget-Project`
- เว็บ Railway: `https://nudget-production.up.railway.app`
- Railway มี `spendbot` แบบ Serverless, PostgreSQL กลาง และ `reminders` แบบ Cron เวลา 09:00 น. ไทย
- LINE webhook ชี้ไป production, เปิดใช้งานอยู่ และ LINE verification ตอบ `200 OK`
- Rich Menu production 6 ปุ่มถูกอัปโหลดและตั้งเป็น default แล้ว
- GitHub Actions ตรวจ type, tests, build และ Docker image ทุก push ก่อน Railway deploy
- ตั้ง Railway email usage alert ที่ $5 ซึ่งเป็นค่าต่ำสุดของระบบ

## ผลตรวจล่าสุด

- Unit/handler tests: 137 ผ่าน
- Svelte/TypeScript: 0 errors, 0 warnings
- Production build: ผ่าน
- Database doctor: env, schema และ seeded categories ผ่าน
- Browser smoke test: หน้าแผนเดือน หน้าเพิ่มบิล และหน้าแก้รายการเปิดได้ ไม่มี console error และไม่ล้นจอที่ความกว้าง 390px
- Rich Menu API: สร้าง อัปโหลดรูป 2500x843 และตั้งเป็น default สำเร็จ
- ย้ายข้อมูล local ไป production สำเร็จ: รายการ 2 รายการและประวัติ LINE event 5 รายการ โดยตรวจสอบ production แล้วพบรายการ 2 รายการ

- Migration `0003_multi_user` ทดสอบบนฐานข้อมูลชั่วคราวครบสามกรณี: ข้อมูลเดิมที่มี LINE id, ข้อมูลเดิมที่ไม่มี (ใช้ placeholder แล้ว `db:seed` รับช่วง) และฐานข้อมูลเปล่า

## งานที่ยังเหลือ

- ตั้ง Railway variable `LIFF_ID` แล้ว deploy — ยังไม่ได้ตั้ง จึงเข้าเว็บด้วย LINE login ไม่ได้
- ยังไม่มี onboarding/invite ในตัวแอป การเพิ่มคนใหม่ต้องแก้ `LINE_ALLOWED_USER_ID` แล้ว redeploy
- เพิ่ม backup/export และหน้าดูเดือนย้อนหลังแบบเลือกเดือน
- OCR ของแต่ละธนาคารอาจวางข้อความต่างกัน ถ้ามีสลิปที่อ่านผิดให้นำรูปจริงมาปรับ parser เพิ่ม
- หากต้องการ LIFF login แบบไม่ต้องใส่รหัสผ่านใน LINE ต้องสร้าง LINE Login หรือ LINE MINI App channel ใน provider เดียวกัน; Messaging API channel อย่างเดียวเพิ่ม LIFF app ไม่ได้
