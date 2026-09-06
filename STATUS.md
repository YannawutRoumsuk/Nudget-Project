# Spendbot — สถานะ 6 กันยายน 2026

## ขอบเขต

บัญชีรายรับรายจ่ายส่วนตัว ใช้คนเดียว ผ่าน LINE และเว็บ โดยข้อมูลทั้งสองช่องทางใช้ PostgreSQL ชุดเดียวกัน

## พร้อมใช้แล้ว

- LINE webhook ของ M Bot ตรวจลายเซ็น กัน event ซ้ำ และล็อกให้เจ้าของคนเดียว
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

- GitHub private repo: `https://github.com/YannawutRoumsuk/spendbot`
- เว็บ Railway: `https://spendbot-production-20be.up.railway.app`
- Railway มี `spendbot` แบบ Serverless, PostgreSQL กลาง และ `reminders` แบบ Cron เวลา 09:00 น. ไทย
- LINE webhook ชี้ไป production, เปิดใช้งานอยู่ และ LINE verification ตอบ `200 OK`
- Rich Menu production 6 ปุ่มถูกอัปโหลดและตั้งเป็น default แล้ว
- GitHub Actions ตรวจ type, tests, build และ Docker image ทุก push ก่อน Railway deploy
- ตั้ง Railway email usage alert ที่ $5 ซึ่งเป็นค่าต่ำสุดของระบบ

## ผลตรวจล่าสุด

- Unit/handler tests: 132 ผ่าน
- Svelte/TypeScript: 0 errors, 0 warnings
- Production build: ผ่าน
- Database doctor: env, schema และ seeded categories ผ่าน
- Browser smoke test: หน้าแผนเดือน หน้าเพิ่มบิล และหน้าแก้รายการเปิดได้ ไม่มี console error และไม่ล้นจอที่ความกว้าง 390px
- Rich Menu API: สร้าง อัปโหลดรูป 2500x843 และตั้งเป็น default สำเร็จ

## งานที่ยังเหลือ

- ย้ายรายการเดิม 2 รายการจาก PostgreSQL local ไป production หลัง Docker Desktop เปิดได้ ปัจจุบัน Docker ติด stale socket จึงต้องรีสตาร์ต Windows หรือ WSL ก่อน
- เพิ่ม backup/export และหน้าดูเดือนย้อนหลังแบบเลือกเดือน
- OCR ของแต่ละธนาคารอาจวางข้อความต่างกัน ถ้ามีสลิปที่อ่านผิดให้นำรูปจริงมาปรับ parser เพิ่ม
- หากต้องการ LIFF login แบบไม่ต้องใส่รหัสผ่านใน LINE ต้องสร้าง LINE Login หรือ LINE MINI App channel ใน provider เดียวกัน; Messaging API channel อย่างเดียวเพิ่ม LIFF app ไม่ได้
