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

Railway Cron backup --------- private network ---- PostgreSQL
      |
      +---- Railway Bucket (private logical dumps, 30 วัน)
```

โครงนี้ใช้ container ที่เปิดรับเว็บเพียงตัวเดียว และปล่อยให้หลับเมื่อไม่มี traffic ส่วน OCR ใช้ CPU/RAM เฉพาะตอนส่งสลิป ระบบเตือนเป็นงานสั้นวันละครั้ง จึงไม่ต้องมี worker เปิดค้าง

## CI/CD

ทุก push เข้า `main` จะรัน GitHub Actions ตามลำดับ:

1. ติดตั้ง dependencies จาก lockfile
2. ตรวจ Svelte/TypeScript
3. รัน unit, handler และ integration tests (มี PostgreSQL service ให้)
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
LINE_ALLOWED_USER_ID=<owner-user-id>[,<co-owner-user-id>...]
LINE_ADD_FRIEND_ID=@<official-account-id>
LIFF_ID=<liff-id>
DASHBOARD_PASSWORD=<password>
SESSION_SECRET=<random-64-hex>
LLM_PROVIDER=none
```

`LINE_ALLOWED_USER_ID` คือรายชื่อ **เจ้าของ** คั่นด้วย comma — คนอื่นได้บัญชีเองด้วยการแอดบอทเป็นเพื่อน เจ้าของจะได้รับแจ้งทุกครั้งที่มีคนใหม่ และดู/ปิดสิทธิ์ได้ที่หน้า `/members` `LIFF_ID` จำเป็นสำหรับ LINE login บนเว็บ ส่วน `DASHBOARD_PASSWORD` ใช้ได้เฉพาะตอนมีเจ้าของคนเดียว

ตั้ง LINE OA ไม่ให้ค้นหาเจอ เพราะลิงก์แอดเพื่อนคือตัวกั้นเดียวว่าใครจะเข้าถึงบอทได้

`LINE_ADD_FRIEND_ID` ทำให้หน้า login แสดง QR และ @id สำหรับแอดบอท ถ้าเปลี่ยน id ต้องรัน `bun run line:qr` แล้ว commit `static/line-add-friend.svg` ใหม่ เพราะ QR ถูก generate ไว้ล่วงหน้าไม่ได้ดึงจาก LINE ตอนเปิดหน้า

`DASHBOARD_PASSWORD` เข้าสู่ระบบเป็น**เจ้าของ** ไม่ใช่บัญชีของคนที่กรอก และช่องนี้ถูกซ่อนไว้ใต้ “สำหรับแอดมิน” ถ้าไม่ได้ใช้ ให้ลบตัวแปรนี้ทิ้งเพื่อไม่ให้มี shared secret อยู่บนหน้า public

### reminders

- Source: GitHub repo, branch `main`
- Builder: Dockerfile
- Start command: `bun run cron:reminders`
- Cron schedule: `0 2 * * *` (Railway ใช้ UTC จึงตรงกับ 09:00 ที่กรุงเทพฯ)
- Public domain: ไม่ต้องเปิด
- Serverless: ไม่ต้องเปิด เพราะ cron เริ่มและจบ process เอง

ใช้ `DATABASE_URL` และตัวแปร `LINE_*` ชุดเดียวกับ `web` และตั้ง `REMINDER_DAYS_BEFORE` ตามต้องการ

### postgres-backup

หน้า Railway ของ workspace นี้ยังไม่เปิดให้ใช้ native Backups/PITR จึงใช้ logical dump รายวันไปยัง Railway Bucket แทน ตัว backup เป็น image แยกจากเว็บและทำงานเฉพาะช่วง cron เพื่อลดค่า compute

1. สร้าง Railway Bucket ชื่อ `nudget-backups` ใน region เดียวกับโปรเจกต์
2. สร้าง service ใหม่จาก GitHub repo/branch `main` ชื่อ `postgres-backup`
3. ตั้ง `RAILWAY_DOCKERFILE_PATH=ops/postgres-backup/Dockerfile`
4. ตั้ง Cron schedule `0 3 * * *` (10:00 Asia/Bangkok) และ Restart policy เป็น `Never`
5. ไม่ต้องสร้าง public domain และไม่ต้องเปิด Serverless เพราะ cron จะเริ่ม ทำงาน และจบ process เอง
6. ใส่ variable references ต่อไปนี้

```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
ENDPOINT=${{nudget-backups.ENDPOINT}}
BUCKET=${{nudget-backups.BUCKET}}
AWS_ACCESS_KEY_ID=${{nudget-backups.ACCESS_KEY_ID}}
AWS_SECRET_ACCESS_KEY=${{nudget-backups.SECRET_ACCESS_KEY}}
AWS_DEFAULT_REGION=${{nudget-backups.REGION}}
BACKUP_PREFIX=nudget/postgres
BACKUP_RETENTION_DAYS=30
```

ถ้าต้องการแจ้ง LINE เมื่อ backup ล้มเหลว ให้เพิ่ม `LINE_CHANNEL_ACCESS_TOKEN` และ `BACKUP_ALERT_LINE_USER_ID` เฉพาะ service นี้ ข้อความแจ้งเตือนไม่มี connection string หรือข้อมูลจากฐานข้อมูล

เมื่อทำงานสำเร็จ log จะมีบรรทัด `backup_completed` พร้อม object key, ขนาด และ SHA-256 โดยไม่แสดง `DATABASE_URL` หรือ credential ไฟล์ dump เป็น PostgreSQL custom format แบบบีบอัด และมี manifest `.json` สำหรับตรวจ checksum

Railway cron ใช้เวลา UTC และอาจเริ่มช้ากว่านาทีที่กำหนดเล็กน้อย ถ้ารอบก่อนยังทำงานอยู่ ระบบจะข้ามรอบถัดไป สคริปต์นี้จบ process ทันทีหลังอัปโหลดและลบไฟล์ที่หมดอายุ

#### Restore drill

ห้าม restore ลง production โดยตรง ให้สร้าง PostgreSQL ชั่วคราวใน environment สำหรับทดสอบ แล้วตั้งตัวแปรของ service backup ชั่วคราวดังนี้

```text
RESTORE_DATABASE_URL=${{Postgres-scratch.DATABASE_URL}}
ALLOW_RESTORE_CHECK=1
```

จากนั้น override start command เป็น `/app/scripts/verify-postgres-backup.sh` แล้ว trigger หนึ่งครั้ง สคริปต์จะดาวน์โหลด dump ล่าสุด ตรวจ checksum, restore ลง scratch database และตรวจตารางหลักกับข้อมูลหมวดหมู่ เมื่อเห็น `restore_check_completed` ให้บันทึกวันที่และผลลัพธ์ใน Issue/maintenance log แล้วลบ scratch database และเอา override ออก

หากต้องกู้ข้อมูลจริง ให้ restore ลง PostgreSQL service ใหม่ก่อน ตรวจข้อมูล แล้วเปลี่ยน `DATABASE_URL` ของ `web` และ `reminders` ไปยัง service ใหม่นั้น การ restore script จะปฏิเสธ target ที่ชี้ไปฐานเดียวกับ `DATABASE_URL` เพื่อลดโอกาสเขียนทับ production

สำหรับเครื่อง local ใช้ directory แทน bucket ได้:

```bash
BACKUP_LOCAL_DIR=./backups bun run db:backup
RESTORE_DATABASE_URL=postgres://... ALLOW_RESTORE_CHECK=1 BACKUP_LOCAL_DIR=./backups bun run db:restore-check
```

CI ทำ restore drill กับ PostgreSQL ชั่วคราวทุกครั้งที่ push หรือเปิด PR จึงตรวจได้ว่าสคริปต์และ schema ปัจจุบันยังกู้คืนได้ ส่วน production ควรทำ drill หลังตั้งค่าครั้งแรกและอย่างน้อยทุก 3 เดือน

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
