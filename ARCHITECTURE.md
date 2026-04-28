# Architecture — LINE Support Bot + RAG + LIFF Web Chat

## ภาพรวมระบบทั้งหมด

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              LINE Support Bot (RAG + LIFF Web Chat Edition)                 │
│                    ทีม Application Support — CDS Express                    │
└─────────────────────────────────────────────────────────────────────────────┘

ช่องทาง 1: LINE OA
  ┌──────────┐  ส่งข้อความ  ┌──────────────────┐  POST /webhook
  │  User    │ ────────────▶│    LINE OA        │ ─────────────▶ API Gateway
  │ (LINE)   │              │  (Messaging API)  │   (verify sig)
  └──────────┘              └──────────────────┘
       ▲                                                  │
       │ reply                                            ▼
       └──────────────────────────────────────── AWS Lambda (index.mjs)
                                                          │
ช่องทาง 2: LIFF Web Chat                                  │
  ┌──────────┐  คลิกลิงก์  ┌──────────────────┐          │
  │  User    │ ────────────▶│  GitHub Pages    │          │
  │ (LINE)   │              │  (docs/index.html│          │
  └──────────┘              │   LIFF SDK)      │          │
       ▲                    └────────┬─────────┘          │
       │ reply                       │ POST /chat          │
       │                             ▼                    │
       │                      API Gateway ────────────────┘
       │                       (CORS enabled)
       │
       └──────────────────────────────────── Lambda ──┬── Upstash Vector
                                                       ├── Groq AI
                                                       └── DynamoDB
```

---

## ไฟล์ในโปรเจค และหน้าที่

```
line-support-bot-lambda/
│
├── docs/
│   └── index.html         ← LIFF Web Chat UI (GitHub Pages)
│                             - สีแดง CDSCOM branding
│                             - ปุ่มแนบรูป + compress ด้วย canvas
│                             - LIFF SDK → ดึง userId จาก LINE
│
├── src/
│   ├── index.mjs          ← Lambda handler
│   │                         - POST /webhook → LINE OA (verify signature)
│   │                         - POST /chat    → LIFF Web Chat (CORS)
│   ├── prompt.mjs         ← System prompt (persona + rules + เบอร์ติดต่อ)
│   ├── knowledge.mjs      ← Q&A data 83 คู่ (สำหรับ upload Upstash)
│   ├── upload-qa.mjs      ← Script upload ขึ้น Upstash (รันครั้งเดียว)
│   └── rag-qa.md          ← Knowledge base ต้นฉบับ (97 Q&A จาก chat log จริง)
│
├── scripts/
│   └── upload-qa.mjs      ← สำเนาของ src/upload-qa.mjs
│
├── terraform/
│   ├── main.tf            ← Lambda + API Gateway (CORS, payload v2.0)
│   │                         + DynamoDB + IAM
│   │                         routes: POST /webhook, POST /chat
│   ├── variables.tf       ← รับ env vars (Groq, LINE, Upstash keys)
│   └── outputs.tf         ← webhook_url, chat_api_url
│
├── Makefile               ← ใช้ได้เฉพาะ WSL (CRLF issue บน Windows)
├── package.json           ← dependencies (@upstash/vector, axios, aws-sdk)
├── ARCHITECTURE.md        ← เอกสาร architecture นี้
└── CLAUDE.md              ← เอกสารโปรเจค (อ่านนี้ก่อน)
```

---

## Flow: LINE OA — Text Message

```
User พิมพ์: "ยิงใบขนไม่ผ่านทำยังไง"
│
▼
[1] LINE webhook → API Gateway → Lambda
     ├── ตรวจ x-line-signature (HMAC-SHA256 + LINE_CHANNEL_SECRET)
     ├── ตรวจสอบ event type (text / image)
     ├── ถ้าอยู่ในกลุ่ม: text ต้อง mention @bot / บอท ก่อน
     │   (image ในกลุ่ม: ไม่ตอบ เพราะตรวจ mention ไม่ได้)
     └── userId = ev.source.userId (รายคน ไม่แชร์กลุ่ม)

[2] DynamoDB: getHistory(userId)
     └── โหลดประวัติสนทนา 10 รายการล่าสุด (TTL 24 ชม.)

[3] Upstash Vector: searchKnowledge(userMsg)
     ├── แปลงข้อความ → vector (multilingual-e5-large)
     ├── ค้นหา top 3 (score ≥ 0.7)
     └── [0.95] Q: ยิงใบขนไม่ผ่าน...  A: ให้ส่งซ้ำผ่านเมนู...

[4] Build prompt:
     [system prompt] + [RAG context] + [history] + [user msg]

[5] Groq AI (llama-3.3-70b) → ตอบ
     └── fallback: llama-3.1-8b → gemma2-9b

[6] DynamoDB: saveHistory(userId, history) + TTL 24 ชม.

[7] LINE reply → ส่งคำตอบกลับ user
```

---

## Flow: LINE OA — Image Message

```
User ส่งรูป error จากโปรแกรม
│
▼
[1] Lambda ดาวน์โหลดรูปจาก LINE API → base64

[2] Groq Vision (llama-4-scout-17b): วิเคราะห์รูป → text
     → "พบ error DISCHARGE PORT MISMATCH ในโปรแกรม"

[3] Upstash Vector: searchKnowledge(visionText) → RAG context

[4] Groq AI + RAG → ตอบ

[5] DynamoDB: saveHistory

[6] LINE reply → ส่งคำตอบกลับ user
```

---

## Flow: LIFF Web Chat — Text Message

```
User เปิด https://liff.line.me/2009887373-F9GIcCMR ใน LINE
│
▼
[1] LIFF SDK: init → login → getProfile() → userId

[2] User พิมพ์ข้อความ → fetch POST /chat
     { userId, message }

[3] API Gateway (CORS: Allow-Origin *) → Lambda handleWebChat()

[4] Lambda: RAG → Groq AI → reply (เหมือน LINE OA flow)

[5] DynamoDB: saveHistory(userId, history)

[6] Response: { reply } → แสดงใน chat bubble
```

---

## Flow: LIFF Web Chat — Image Message

```
User กดปุ่มรูป → เลือกไฟล์
│
▼
[1] Frontend: canvas compress (max 1024px, quality 0.8) → base64

[2] fetch POST /chat
     { userId, imageBase64, mimeType: "image/jpeg" }

[3] Lambda handleWebChat()
     → describeImage(base64) → Groq Vision → text description
     → searchKnowledge(text) → RAG context
     → askAI() → reply

[4] Response: { reply } → แสดงใน chat bubble
```

---

## Flow: Setup Knowledge Base (ทำครั้งเดียว)

```
[1] สมัคร Upstash Vector (ฟรี)
     console.upstash.com → สร้าง Index
     embedding: multilingual-e5-large

[2] เตรียม Q&A
     src/rag-qa.md (97 คู่ ต้นฉบับ)
         ↓
     src/knowledge.mjs (83 คู่ สำหรับ upload)

[3] Upload
     node src/upload-qa.mjs

[4] Deploy Lambda (WSL)
     npm install
     zip -r deploy.zip src/ node_modules/ package.json
     cd terraform && terraform apply -auto-approve -var=...
```

---

## Flow: อัปเดต Q&A (ไม่ต้อง redeploy)

```
เพิ่ม Q&A ใหม่ใน src/knowledge.mjs
    ↓
node src/upload-qa.mjs
    ↓
ระบบฉลาดขึ้นทันที
```

---

## Build & Deploy (WSL เท่านั้น)

```bash
# Build
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda
npm install
zip -r deploy.zip src/ node_modules/ package.json

# Deploy Lambda + Infrastructure
cd terraform && terraform apply -auto-approve \
  -var="groq_api_key=..." \
  -var="line_channel_access_token=..." \
  -var="line_channel_secret=..." \
  -var="upstash_vector_rest_url=..." \
  -var="upstash_vector_rest_token=..."

# Update frontend only (ไม่ต้อง rebuild)
git add docs/index.html && git commit -m "..." && git push
```

---

## Environment Variables

| ตัวแปร | ที่มา | ใช้ใน |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com | Lambda → Groq AI + Vision |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API | Lambda → reply + download image |
| `LINE_CHANNEL_SECRET` | LINE Developers → Basic settings | Lambda → verify webhook signature |
| `DYNAMODB_TABLE` | Terraform auto-set | Lambda → chat history |
| `UPSTASH_VECTOR_REST_URL` | console.upstash.com | Lambda + upload-qa.mjs |
| `UPSTASH_VECTOR_REST_TOKEN` | console.upstash.com | Lambda + upload-qa.mjs |

---

## AWS Resources

| Resource | ชื่อ | Free Tier |
|---|---|---|
| Lambda | line-support-bot | 1M req/เดือน |
| API Gateway | line-support-bot-api | 1M req/เดือน |
| DynamoDB | line-support-bot-history | 25GB |
| IAM Role | line-support-bot-role | ฟรี |
| Upstash Vector | (สร้างเอง) | 10K queries/วัน |
| GitHub Pages | peacedwk55.github.io | ฟรีตลอด |

---

## AI Models

| ใช้ทำอะไร | Model | Fallback |
|---|---|---|
| ตอบข้อความ (text) | llama-3.3-70b-versatile | llama-3.1-8b → gemma2-9b |
| วิเคราะห์รูปภาพ (vision) | llama-4-scout-17b | — |
| Embedding (RAG) | multilingual-e5-large | — (Upstash built-in) |

---

## Security

| จุด | วิธีป้องกัน |
|---|---|
| LINE webhook | ตรวจ HMAC-SHA256 signature ทุก request |
| Web Chat (/chat) | CORS restrict + userId จาก LIFF (LINE authenticated) |
| API Keys | เก็บใน Lambda env vars ผ่าน Terraform (ไม่ hardcode) |
| Chat history | DynamoDB TTL 24 ชม. (ลบอัตโนมัติ) |
