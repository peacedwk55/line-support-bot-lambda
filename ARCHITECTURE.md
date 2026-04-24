# Architecture — LINE Support Bot + RAG

## ภาพรวมระบบทั้งหมด

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LINE Support Bot (RAG Edition)                      │
│                    ทีม Application Support — CDS Express                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐   ส่งข้อความ   ┌─────────────────┐   POST /webhook
  │  User    │ ─────────────▶ │   LINE OA        │ ────────────────▶ API Gateway
  │ (LINE)   │               │  (Messaging API)  │
  └──────────┘               └─────────────────┘
       ▲                                                        │
       │                                                        ▼
       │  reply                                        ┌─────────────────┐
       └───────────────────────────────────────────────│  AWS Lambda     │
                                                       │  (index.mjs)   │
                                                       └────────┬────────┘
                                                                │
                            ┌───────────────────────────────────┤
                            │                                   │
                            ▼                                   ▼
                   ┌─────────────────┐               ┌─────────────────┐
                   │  Upstash Vector │               │    DynamoDB     │
                   │  (RAG search)   │               │  (chat history) │
                   └────────┬────────┘               └─────────────────┘
                            │
                            ▼
                   ┌─────────────────┐
                   │    Groq AI      │
                   │ (llama-3.3-70b) │
                   └─────────────────┘
```

---

## ไฟล์ในโปรเจค และหน้าที่

```
line-support-bot-lambda/
│
├── src/
│   ├── index.mjs          ← Lambda handler (หัวใจหลัก)
│   ├── prompt.mjs         ← System prompt (persona + rules + เบอร์ติดต่อ)
│   ├── knowledge.mjs      ← Q&A data 83 คู่ (สำหรับ upload Upstash)
│   ├── upload-qa.mjs      ← Script upload ขึ้น Upstash (รันครั้งเดียว)
│   └── rag-qa.md          ← Knowledge base ต้นฉบับ (97 Q&A จาก chat log จริง)
│
├── scripts/
│   └── upload-qa.mjs      ← สำเนาของ src/upload-qa.mjs
│
├── terraform/
│   ├── main.tf            ← สร้าง Lambda + API Gateway + DynamoDB + IAM
│   ├── variables.tf       ← รับ env vars (Groq, LINE, Upstash keys)
│   └── outputs.tf         ← แสดง Webhook URL หลัง deploy
│
├── Makefile               ← คำสั่ง deploy/destroy ง่ายๆ
├── package.json           ← dependencies (@upstash/vector, axios, aws-sdk)
├── ARCHITECTURE.md        ← เอกสาร architecture นี้
└── CLAUDE.md              ← เอกสารโปรเจค (อ่านนี้ก่อน)
```

---

## Flow การทำงาน — เมื่อ User ส่งข้อความ

```
User พิมพ์: "ยิงใบขนไม่ผ่านทำยังไง"
│
▼
[1] LINE webhook → API Gateway → Lambda (index.mjs)
     ├── ตรวจสอบ event type (text / image)
     ├── ถ้าอยู่ในกลุ่ม ต้อง mention @bot ก่อน
     └── ดึง userId / groupId

[2] DynamoDB: getHistory(userId)
     └── โหลดประวัติสนทนา 10 รายการล่าสุด (คงอยู่ 24 ชม.)

[3] Upstash Vector: searchKnowledge(userMsg)
     ├── แปลงข้อความ → vector (multilingual-e5-large)
     ├── ค้นหา Q&A ที่ใกล้เคียง top 3
     ├── กรองเฉพาะ score ≥ 0.7
     └── ผลลัพธ์ตัวอย่าง:
           [0.95] Q: ยิงใบขนไม่ผ่าน...  A: ให้ส่งซ้ำผ่านเมนู...
           [0.87] Q: ส่งซ้ำไม่ผ่าน...   A: ต้องทำสำเนา...

[4] Build prompt:
     ┌────────────────────────────────────────────────┐
     │ [SYSTEM] prompt.mjs (persona + rules)          │
     │                                                │
     │ ข้อมูลที่เกี่ยวข้องกับคำถามนี้:               │
     │ Q: ยิงใบขนไม่ผ่าน...                          │
     │ A: ให้ส่งซ้ำผ่านเมนู...                       │
     │                                                │
     │ [HISTORY] บทสนทนาก่อนหน้า...                  │
     │ [USER] ยิงใบขนไม่ผ่านทำยังไง                  │
     └────────────────────────────────────────────────┘

[5] Groq AI (llama-3.3-70b): ตอบโดยมีข้อมูลครบ
     └── fallback: llama-3.1-8b → gemma2-9b ถ้า model หลักล้มเหลว

[6] DynamoDB: saveHistory(userId, history)
     └── เก็บบทสนทนา + ตั้ง TTL 24 ชม.

[7] LINE reply → ส่งคำตอบกลับ user
```

---

## Flow การทำงาน — เมื่อ User ส่งรูปภาพ

```
User ส่งรูป error จากโปรแกรม
│
▼
[1] Lambda ดาวน์โหลดรูปจาก LINE API → base64

[2] Groq Vision (llama-4-scout-17b): วิเคราะห์รูป → แปลงเป็น text
     → "พบ error DISCHARGE PORT MISMATCH ในโปรแกรม"

[3] Upstash Vector: searchKnowledge(visionText)
     ├── ใช้ text จาก Vision เป็น query
     ├── ค้นหา Q&A ที่ตรงกัน top 3 (score ≥ 0.7)
     └── [0.91] qa-038: DISCHARGE PORT MISMATCH...

[4] Build prompt + RAG context (เหมือน text flow)

[5] Groq AI (llama-3.3-70b) + RAG context → ตอบ

[6] LINE reply → ส่งคำตอบกลับ user
```

---

## Flow การ Setup Knowledge Base (ทำครั้งเดียว)

```
ขั้นตอน Setup RAG:

[1] สมัคร Upstash Vector (ฟรี)
     └── console.upstash.com → สร้าง Index
         embedding: multilingual-e5-large (รองรับภาษาไทย)

[2] เตรียม Q&A data
     src/knowledge.mjs ← แก้ไขไฟล์นี้
     format: [ { id, q, a }, ... ]

     ที่มาของ Q&A:
     src/rag-qa.md (97 คู่ จาก LINE group chat Feb–Apr 2026)
         ↓ คัดกรองและแปลง
     src/knowledge.mjs (83 คู่ สำหรับ upload)

[3] รัน upload script
     export UPSTASH_VECTOR_REST_URL=https://...
     export UPSTASH_VECTOR_REST_TOKEN=...
     node src/upload-qa.mjs

     → แปลง Q&A แต่ละข้อ → vector → upsert ขึ้น Upstash
     → ทดสอบ query อัตโนมัติหลัง upload

[4] Deploy Lambda (พร้อม Upstash credentials)
     make deploy \
       GROQ_API_KEY=... \
       LINE_CHANNEL_ACCESS_TOKEN=... \
       UPSTASH_VECTOR_REST_URL=... \
       UPSTASH_VECTOR_REST_TOKEN=...
```

---

## Flow การอัปเดต Q&A (ไม่ต้อง redeploy Lambda)

```
พบปัญหาใหม่ที่ user ถามบ่อย
│
▼
แก้ไข src/knowledge.mjs
เพิ่ม { id: "qa-084", q: "คำถาม", a: "คำตอบ" }
│
▼
node src/upload-qa.mjs
│
▼
ระบบฉลาดขึ้นทันที (ไม่ต้อง deploy Lambda ใหม่)
```

---

## Environment Variables ที่ต้องใช้

| ตัวแปร | ที่มา | ใช้ใน |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com | Lambda → เรียก Groq AI |
| `LINE_CHANNEL_ACCESS_TOKEN` | developers.line.biz | Lambda → ส่งข้อความกลับ LINE |
| `DYNAMODB_TABLE` | Terraform auto-set | Lambda → เก็บ chat history |
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

---

## AI Models

| ใช้ทำอะไร | Model | Fallback |
|---|---|---|
| ตอบข้อความ (text) | llama-3.3-70b-versatile | llama-3.1-8b → gemma2-9b |
| วิเคราะห์รูปภาพ (vision) | llama-4-scout-17b | — |
| Embedding (RAG) | multilingual-e5-large | — (Upstash built-in) |
