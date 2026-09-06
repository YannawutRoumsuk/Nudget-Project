# Nudget

บันทึกรายรับรายจ่ายผ่าน **LINE chatbot** แล้วดูสรุปบน **เว็บแดชบอร์ด**

- Production: https://nudget-production.up.railway.app
- Source: https://github.com/YannawutRoumsuk/Nudget-Project

พิมพ์ `ข้าวเที่ยง 60` ในแชท LINE → บอทแยกจำนวนเงิน หมวดหมู่ และวันที่ให้เอง →
แดชบอร์ดแสดงยอดรายวัน สัดส่วนตามหมวดหมู่ และรายการทั้งหมด

---

## Stack

| ส่วน | เทคโนโลยี |
|------|-----------|
| Web + API | SvelteKit 2 (Svelte 5 runes) |
| DB | PostgreSQL 17 + Drizzle ORM |
| Chat | LINE Messaging API (webhook + reply) |
| OCR | Sharp + Tesseract.js (ไทย/อังกฤษ) |
| Parser | rule-based ก่อน แล้ว fallback ไป LLM (Anthropic หรือ Gemini) |
| Charts | inline SVG เขียนเอง — ไม่มี chart library |

---

## เริ่มใช้งาน (local)

```bash
cd D:/Coding/spendbot
cp .env.example .env      # ถ้ายังไม่มี
bun install
bun run db:setup          # docker compose up + push schema + seed หมวดหมู่
bun run dev               # http://localhost:5173
```

`db:setup` เท่ากับ `db:up` → `db:push` → `db:seed`

เข้าแดชบอร์ดด้วยรหัสผ่านจาก `DASHBOARD_PASSWORD` ใน `.env`

---

## ต่อ LINE bot

1. สร้าง **Messaging API channel** ที่ [LINE Developers Console](https://developers.line.biz/console/)
2. คัดลอกค่าลง `.env`
   ```
   LINE_CHANNEL_SECRET=...        # แท็บ Basic settings
   LINE_CHANNEL_ACCESS_TOKEN=...  # แท็บ Messaging API (กด Issue)
   ```
3. เปิด tunnel ให้ webhook เข้าถึงเครื่องได้
   ```bash
   cloudflared tunnel --url http://localhost:5173
   ```
   Quick Tunnel จะได้ hostname ใหม่ทุกครั้งที่เปิด ต้องเปิดหน้าต่างนี้ค้างไว้และอัปเดต Webhook URL เมื่อ hostname เปลี่ยน
4. ใส่ Webhook URL เป็น `https://<tunnel>/api/line/webhook` แล้วกด **Verify**
5. ปิด *Auto-reply messages* และเปิด *Use webhook* กับ *Webhook redelivery* ในหน้า Messaging API
6. แอดบอทเป็นเพื่อน แล้วพิมพ์ `ไอดี` — บอทจะตอบ LINE userId กลับมา
   นำไปใส่ `LINE_ALLOWED_USER_ID` เพื่อประกาศตัวเป็นเจ้าของ

> ถ้า `LINE_ALLOWED_USER_ID` ว่าง บอทจะบอก userId ให้อย่างเดียว ยังใช้บันทึกอะไรไม่ได้ หลังตั้งค่า `.env` ให้ restart dev server

### ให้คนอื่นใช้

**เพื่อนแค่แอดบอทเป็นเพื่อน แล้วใช้ได้เลย** — ไม่มีรหัส ไม่ต้องพิมพ์อะไร บอทเปิดบัญชีให้ทันทีที่แอด ส่ง QR หรือลิงก์แอดเพื่อนของ LINE OA ให้เขาก็พอ

แต่ละคนได้บัญชีของตัวเองแยกกันสมบูรณ์ — รายการ บิล แผนเดือน และสรุปมองไม่เห็นกัน และเตือนบิลส่งเข้า LINE ของเจ้าของบิลเท่านั้น

ไม่มีเพดานจำนวนคน ตัวกั้นคือ **ลิงก์แอดเพื่อนของ LINE OA** ที่คุณเป็นคนส่งให้เอง (ตั้ง OA ไม่ให้ค้นหาเจอ) แทนที่จะกั้นไว้ก่อน ระบบเลือกวิธี **มองเห็นทุกคนที่เข้ามา** แล้วปิดสิทธิ์ทีหลังได้ทันที

### มอนิเตอร์ว่าใครเข้ามาบ้าง

มีสามทาง:

1. **แจ้งเตือนทันที** — มีคนใหม่แอดบอท เจ้าของทุกคนได้ข้อความบอกชื่อ LINE, LINE id และเวลาที่เข้ามา
2. **หน้า `สมาชิก` บนเว็บ** (`/members`, เห็นเฉพาะเจ้าของ) — ตารางทุกบัญชี: ชื่อ LINE, LINE id, เข้ามาเมื่อไหร่, บันทึกไปกี่รายการ, ใช้ล่าสุดเมื่อไหร่ พร้อมปุ่มปิด/เปิดสิทธิ์
3. **พิมพ์ `สมาชิก` ในแชท** — ดูรายชื่อย่อจากมือถือได้เลย

หน้าสมาชิกสรุปให้ด้วยว่ามีกี่คนใช้งานอยู่ กี่คนถูกปิดสิทธิ์ และกี่คนที่แอดมาแต่ยังไม่เคยบันทึกอะไร — ตัวเลขสุดท้ายคือสัญญาณว่ามีใครแอดมาโดยไม่ได้ตั้งใจใช้จริง

**ปิดสิทธิ์** กดปุ่มในหน้าสมาชิกได้เลย (หรือ `update users set active = false where line_user_id = '...'`) — ไม่ลบแถว เพราะการลบ user จะ cascade ลบรายการเงินทั้งหมดของเขาไปด้วย คนที่ถูกปิดสิทธิ์กลับเข้ามาเองไม่ได้ ต้องให้เจ้าของเปิดให้ แล้วข้อมูลเดิมกลับมาครบ

สิทธิ์เจ้าของมาจาก `LINE_ALLOWED_USER_ID` เท่านั้น ปิดสิทธิ์เจ้าของจากหน้าเว็บไม่ได้ ต้องเอา id ออกจากตัวแปรก่อน — กันไม่ให้เผลอล็อกตัวเองออกจนไม่มีใครแก้คืนได้

### ล็อกอินเข้าเว็บ

เข้าผ่าน **LINE login (LIFF)** กดปุ่มเดียว ไม่มีรหัสผ่านของ user แต่ละคน — ตัวตนคือ LINE account ของเขาเอง ใช้ได้ทั้งในแอป LINE และเบราว์เซอร์บนคอม (ตั้ง `withLoginOnExternalBrowser: true` ไว้) session อยู่ 30 วันต่อเบราว์เซอร์ ต้องตั้ง `LIFF_ID` ก่อน

การ login **ไม่สร้างบัญชีให้** ต้องแอดบอทใน LINE ก่อนเสมอ — หน้า login จึงแสดง QR และ @id (`LINE_ADD_FRIEND_ID`) ไว้ให้คนที่มาเจอเว็บก่อน และถ้ากด login ทั้งที่ยังไม่มีบัญชี บอทจะบอกตรง ๆ ว่าให้ไปแอดก่อน

QR ถูก generate ไว้ล่วงหน้าเป็น `static/line-add-friend.svg` ไม่ได้ดึงจาก LINE ตอนเปิดหน้า — เปลี่ยน id แล้วต้องรัน `bun run line:qr` ใหม่:

```bash
bun run line:qr
```

`DASHBOARD_PASSWORD` เป็นรหัสร่วม บอกไม่ได้ว่าใครเป็นใคร มันจึงเข้าสู่ระบบเป็น**เจ้าของ**เสมอไม่ว่าใครกรอก ใช้ได้เฉพาะตอนมีเจ้าของคนเดียว และช่องกรอกถูกซ่อนไว้ใต้ “สำหรับแอดมิน” ถ้าไม่ได้ใช้ ให้ลบตัวแปรทิ้งไปเลย

---

## คำสั่งในแชท

| พิมพ์ | ผลลัพธ์ |
|-------|---------|
| `ข้าวเที่ยง 60` | บันทึกรายจ่าย 60 บาท หมวดอาหาร |
| `กาแฟ 85 บาท` | หน่วยเงินชัดเจนถูกเลือกก่อนตัวเลขเปล่า |
| `ค่าน้ำมัน 1,200` | อ่าน comma separator ได้ |
| `+เงินเดือน 30000` | รายรับ (ขึ้นต้นด้วย `+` หรือ `รับ`) |
| `รับ ฟรีแลนซ์ 5k` | `k` / `พัน` / `หมื่น` / `แสน` / `ล้าน` |
| `เมื่อวาน ข้าว 50` | ย้อนหลัง — `วันนี้` `เมื่อวาน` `เมื่อวานซืน` |
| `1/9 ค่าไฟ 800` | ระบุวันที่ตรงๆ (รับทั้ง ค.ศ. และ พ.ศ.) |
| `กาแฟ 85 บัตรเครดิต` | บันทึกยอดใช้บัตรเครดิตและหมวดอาหาร |
| ส่งรูปสลิป | OCR อ่านยอด/วันที่ แล้วถามว่าเป็นค่าอะไร ก่อนบันทึก |
| `วันนี้` / `เดือนนี้` | สรุปยอด |
| `งบ` | เงินที่เหลือและค่าอาหาร/เดินทางที่ใช้ได้ต่อวัน |
| `บิล` | บิลที่ยังไม่จ่ายเดือนนี้ |
| `ลบ` | ลบรายการล่าสุด |
| `ช่วย` | วิธีใช้ |
| `ไอดี` | ดู LINE userId ของตัวเอง |
| `เว็บ` | ขอลิงก์เปิดแดชบอร์ด — ทางเข้าสำหรับ iPad และคอมที่ rich menu ไม่แสดง |
| `สมาชิก` | ดูว่าใครใช้บอทนี้บ้าง เข้ามาเมื่อไหร่ (เจ้าของเท่านั้น) |

## Rich Menu ภาษาไทย

สร้างภาพเมนู 6 ช่องขนาด 2500x843 โดยไม่เรียก LINE API:

```bash
bun run line:rich-menu
```

ตั้ง `PUBLIC_BASE_URL` เป็น URL HTTPS ของแดชบอร์ด แล้วใช้ `--setup` เพื่อสร้าง อัปโหลด และตั้งเป็นเมนูเริ่มต้นผ่าน LINE API (คำสั่งนี้ส่งคำขอจริง):

```bash
bun run line:rich-menu --setup
```

ภาพที่สร้างอยู่ที่ `static/line-rich-menu.png` และปุ่ม `สรุป`/`ช่วย` ส่งข้อความ `เดือนนี้`/`ช่วย` กลับเข้าแชท

> Rich menu แสดงเฉพาะแอป LINE บนมือถือ บน iPad และ LINE บนคอมมักไม่ขึ้น — พิมพ์ `เว็บ` เพื่อขอลิงก์แดชบอร์ดแทนได้

ช่องกรอกด้านบนแดชบอร์ดใช้ parser ตัวเดียวกัน — พิมพ์แบบเดียวกับในแชทได้เลย

เว็บมีหน้า `บิล` สำหรับค่าใช้จ่ายรายเดือน/ครั้งเดียวและยอดบัตรเครดิต กดจ่ายแล้วจะสร้างรายจ่ายจริงให้ทันที หน้า `แผนเดือน` ใช้รายรับ เป้าหมายออม ค่าอาหาร ค่าเดินทาง รายจ่ายจริง และบิลค้างเพื่อคำนวณยอดที่ยังใช้ได้ รายการทุกแหล่งอยู่ใน PostgreSQL เดียวกัน จึงแก้จากเว็บแล้วเห็นผลในสรุป LINE ทันที

OCR ทำงานบนเครื่องด้วย Tesseract ภาษาไทย/อังกฤษ รัน `bun run ocr:smoke` หลังติดตั้งครั้งแรกเพื่อดาวน์โหลดและตรวจชุดภาษาไว้ใน `.cache/tesseract` รูปสลิปไม่ถูกส่งให้ LLM

ระบบเตือนบิลทำงานเมื่อเซิร์ฟเวอร์เปิดอยู่ ตั้งเวลาไทยด้วย `REMINDER_HOUR` และจำนวนวันล่วงหน้าด้วย `REMINDER_DAYS_BEFORE`

---

## Deploy บน Railway

โครง production ที่ประหยัดสำหรับบัญชีส่วนตัวมี 3 services ในโปรเจกต์เดียว:

- `web`: รับ LINE webhook และให้บริการ dashboard เปิด Serverless และมี public domain
- `Postgres`: เก็บข้อมูลกลาง ใช้ private `DATABASE_URL`
- `reminders`: Railway Cron รัน `bun run cron:reminders` เวลา `0 2 * * *` (09:00 Asia/Bangkok) ไม่มี public domain

OCR ทำใน `web` เฉพาะตอนมีรูปสลิป (`OCR_MODE=inline`) จึงไม่ต้องเปิด worker ค้างไว้ ส่วน `bun run worker:ocr` มีไว้สำหรับแยก service ภายหลังเมื่อจำนวนสลิปมากขึ้น

รายละเอียดตัวแปร ขั้นตอนเชื่อม GitHub และการควบคุมค่าใช้จ่ายอยู่ใน [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## LLM fallback (ไม่บังคับ)

ถ้ากฎ regex จับหมวดหมู่ไม่ได้ หรือหาจำนวนเงินไม่เจอ (เช่น `จ่ายค่าข้าวไปห้าสิบบาท`)
ระบบจะยิงไปถาม LLM ต่อ ตั้งค่าอย่างใดอย่างหนึ่งใน `.env`

```
ANTHROPIC_API_KEY=sk-ant-...     # ใช้ claude-haiku-4-5
# หรือ
GEMINI_API_KEY=...               # ใช้ gemini-2.5-flash
```

ปล่อยว่างทั้งคู่ = ใช้ rule-based ล้วน ไม่มีค่า API เลย

---

## โครงสร้าง

```
src/
├── lib/
│   ├── categories.ts            หมวดหมู่ + keyword (source of truth เดียว)
│   ├── analytics.ts             แปลงผลรวมเป็น view model + เรขาคณิตของ donut
│   ├── ranges.ts                ช่วงเวลา (วันนี้ / 7 วัน / เดือนนี้ / 30 วัน)
│   ├── components/              StatFigure, DailyChart, CategoryDonut, ...
│   ├── styles/                  design tokens + global
│   ├── utils/                   date (Asia/Bangkok), money
│   └── server/
│       ├── config.ts            อ่าน env ที่เดียว
│       ├── auth.ts              session cookie แบบ stateless (HMAC)
│       ├── db/                  schema + queries (Drizzle)
│       ├── line/                signature, client, handler, ข้อความตอบกลับ
│       └── parser/              rules → llm → hybrid
└── routes/
    ├── +page.svelte             แดชบอร์ด
    ├── transactions/            รายการทั้งหมด + filter
    ├── login/                   password gate
    └── api/line/webhook/        LINE webhook
```

---

## หมายเหตุด้านเวลา

ทุกการรวมยอดรายวันคิดตามเวลา **Asia/Bangkok (UTC+7)** ไม่ใช่ UTC
มิฉะนั้นรายการช่วง 00:00–06:59 น. ของไทยจะถูกนับเป็นวันก่อนหน้าเมื่อใช้วัน UTC
timestamp เก็บเป็น `timestamptz` แล้วแปลงตอน group by ใน Postgres

---

## ความปลอดภัย

- webhook ตรวจ `x-line-signature` (HMAC-SHA256) ก่อน parse body เสมอ
- `webhookEventId` และการเพิ่ม/ลบรายการ commit ใน transaction เดียวกัน ถ้าบันทึกล้มเหลวจะ rollback และตอบ 503 เพื่อให้ LINE retry เมื่อเปิด Webhook redelivery
- เวลาอ้างอิงของข้อความใช้ timestamp เดิมจาก LINE เพื่อไม่ให้ retry ข้ามวันเปลี่ยนวันที่รายการ
- ข้อความยืนยันส่งหลัง commit; ถ้าส่งยืนยันล้มเหลว รายการยังอยู่ แต่ยังไม่มีระบบ retry ข้อความยืนยัน
- แดชบอร์ดปิดด้วย password + signed cookie ผ่าน `hooks.server.ts`
- ไม่มี secret ใน source — อยู่ใน `.env` ซึ่ง gitignore ไว้แล้ว

---

## คำสั่งที่ใช้บ่อย

```bash
bun run dev            # dev server
bun run doctor         # ตรวจ env และฐานข้อมูล โดยไม่แสดง secret หรือส่งข้อความ LINE
bun run ocr:smoke      # ตรวจ OCR และเตรียมชุดภาษาไว้ใน cache
bun run cron:reminders # ตรวจแจ้งเตือนหนึ่งรอบแล้วจบ เหมาะกับ Railway Cron
bun run worker:ocr     # OCR worker แบบเปิดค้าง (ใช้เมื่อปริมาณสลิปมาก)
bun run test:run       # unit tests
bun run check          # type check (svelte-check)
bun run build          # production build
bun run db:push        # sync schema เข้า DB (dev)
bun run db:generate    # สร้างไฟล์ migration
bun run db:seed        # seed หมวดหมู่
bun run db:down        # หยุด Postgres
```
