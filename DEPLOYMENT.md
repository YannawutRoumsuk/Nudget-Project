# Deploy Nudget บน Railway

## โครงที่ใช้

```text
LINE / Browser
      |
      v
Railway web (Serverless) ---- private network ---- Railway PostgreSQL
      |
      +---- LINE Content API -> OCR ใน process เมื่อมีสลิป

Railway Cron (วันละครั้ง) --- private network ---- PostgreSQL
      |
      +---- LINE Push API แจ้งเตือนบิล
```

โครงนี้ใช้ container ที่เปิดรับเว็บเพียงตัวเดียว และปล่อยให้หลับเมื่อไม่มี traffic ส่วน OCR ใช้ CPU/RAM เฉพาะตอนส่งสลิป ระบบเตือนเป็นงานสั้นวันละครั้ง จึงไม่ต้องมี worker เปิดค้าง

## CI/CD

ทุก push เข้า `main` จะรัน GitHub Actions ตามลำดับ:

1. ติดตั้ง dependencies จาก lockfile
2. ตรวจ Svelte/TypeScript
3. รัน unit และ handler tests
4. production build
5. สร้าง Docker imageรวม OCR language data

ใน Railway ให้เชื่อมทั้ง `web` และ `reminders` กับ GitHub repo/branch `main` แล้วเปิด **Wait for CI** ทั้งสอง service เมื่อ CI ผ่าน Railway จะ deploy commit นั้นอัตโนมัติ

## Services

### PostgreSQL

เพิ่ม PostgreSQL ใน Railway project แล้วใช้ reference variableนี้ในสอง application services:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

ใช้ private URL เพื่อไม่เสียค่า egress ระหว่าง services

### web

- Source: GitHub repo, branch `main`
- Builder: Dockerfile
- Start command: ใช้ `CMD` ใน Dockerfile (`bun run start`)
- Public domain: เปิด
- Serverless: เปิด
- Health check: `/api/line/webhook`
- Replicas: 1

Variables:

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
PUBLIC_BASE_URL=https://<railway-domain>
PORT=3000
OCR_MODE=inline
REMINDER_MODE=cron
LINE_CHANNEL_SECRET=<secret>
LINE_CHANNEL_ACCESS_TOKEN=<token>
LINE_ALLOWED_USER_ID=<owner-user-id>[,<second-user-id>...]
LIFF_ID=<liff-id>
DASHBOARD_PASSWORD=<password>
SESSION_SECRET=<random-64-hex>
LLM_PROVIDER=none
```

`LINE_ALLOWED_USER_ID` คือรายชื่อ **เจ้าของ** คั่นด้วย comma — คนอื่นเข้าใช้ด้วยรหัสเชิญที่เจ้าของสร้างจากในแชท (`เชิญ`) จึงไม่ต้องแก้ตัวแปรนี้ทุกครั้งที่เพิ่มคน `LIFF_ID` จำเป็นสำหรับ LINE login บนเว็บ ส่วน `DASHBOARD_PASSWORD` ใช้ได้เฉพาะตอนมีเจ้าของคนเดียว

### reminders

- Source: GitHub repo, branch `main`
- Builder: Dockerfile
- Start command: `bun run cron:reminders`
- Cron schedule: `0 2 * * *` (Railway ใช้ UTC จึงตรงกับ 09:00 ที่กรุงเทพฯ)
- Public domain: ไม่ต้องเปิด
- Serverless: ไม่ต้องเปิด เพราะ cron เริ่มและจบ process เอง

ใช้ `DATABASE_URL` และตัวแปร `LINE_*` ชุดเดียวกับ `web` และตั้ง `REMINDER_DAYS_BEFORE` ตามต้องการ

## หลัง deploy

1. เปิด `https://<railway-domain>/api/line/webhook` ต้องได้ `{ "ok": true }`
2. ตั้ง LINE Webhook URL เป็น `https://<railway-domain>/api/line/webhook` แล้ว Verify
3. เปลี่ยน `PUBLIC_BASE_URL` ใน local `.env` เป็น Railway domain แล้วรัน `bun run line:rich-menu --setup`
4. ทดสอบข้อความ, รูปสลิป, dashboard และรายการเตือน

## migration หลายผู้ใช้ (0003_multi_user)

`bun run start` รัน `db:migrate` แล้วต่อด้วย `db:seed` เสมอ ทั้งสองขั้นจำเป็นสำหรับ migration นี้:

1. `db:migrate` สร้างตาราง `users`, เพิ่ม `user_id` ให้ทุกตารางข้อมูล แล้วยกข้อมูลเดิมทั้งหมดให้เจ้าของคนเดียวเดิม โดยดึง LINE id จาก `transactions.line_user_id` ถ้ามี ไม่มีก็ใช้ placeholder `legacy-owner`
2. `db:seed` เปลี่ยน `legacy-owner` เป็น id แรกใน `LINE_ALLOWED_USER_ID` — ข้ามขั้นนี้แล้วเจ้าของจะ login ไปเจอบัญชีเปล่าแทนที่จะเป็นประวัติเดิม

ตรวจหลัง deploy ว่า `select line_user_id from users` ตรงกับเจ้าของจริง และไม่มีแถวไหนเหลือ `legacy-owner`

## คุมค่าใช้จ่าย

- เปิด Serverless เฉพาะ `web`
- ใช้ Postgres private URL
- ไม่ deploy `worker:ocr` จนกว่าจะมีงาน OCR มาก
- ตั้ง email usage alert ที่ $5 (ค่าต่ำสุดที่ Railway ยอมรับ) และดู CPU/RAM ใน Metrics หลังใช้งานครบหนึ่งสัปดาห์
- หาก PostgreSQL เป็นค่าใช้จ่ายหลัก ค่อยย้ายไปฐานข้อมูล serverless ภายนอก โดยเปลี่ยนเพียง `DATABASE_URL`
