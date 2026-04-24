# line-support-bot-lambda

LINE OA Support Bot สำหรับทีม Application Support บริษัท CDSCOM
ช่วยตอบปัญหาการใช้งานระบบ Express (โปรแกรมพิธีการศุลกากร)

## Stack

| | เดิม (Express) | Lambda | Lambda + RAG |
|---|---|---|---|
| Runtime | Node.js + Express | AWS Lambda | AWS Lambda |
| Webhook | cloudflared tunnel | API Gateway | API Gateway |
| Chat history | In-memory (หายเมื่อ restart) | DynamoDB (คงอยู่ 24 ชม.) | DynamoDB (คงอยู่ 24 ชม.) |
| Knowledge base | hardcoded ใน prompt | hardcoded ใน prompt.mjs | Upstash Vector (เพิ่มได้ไม่ต้อง redeploy) |
| ค่าใช้จ่าย | ต้องรันเครื่องตลอด | ฟรี (1M req/เดือน) | ฟรี (1M req/เดือน + Upstash free tier) |

## Architecture

### ปัจจุบัน (Lambda + RAG via Upstash Vector)
```
LINE OA
    ↓
API Gateway → POST /webhook
    ↓
Lambda (src/index.mjs)
    ├── Upstash Vector → query Q&A ที่ใกล้เคียง (top 3, score ≥ 0.7)
    │       └── inject Q&A เข้า system prompt
    ├── Groq AI (llama-3.3-70b) → ตอบ text โดยมีข้อมูลครบ
    ├── Groq Vision (llama-4-scout-17b) → อ่านรูป → text → query Upstash → ตอบ
    └── DynamoDB → เก็บประวัติสนทนา 24 ชม.
```

### RAG Runtime Flow — Text Message
```
User: "ยิงใบขนไม่ผ่านทำยังไง"
    ↓
Lambda รับ webhook
    ↓
Query Upstash Vector (input: คำถาม user)
    → แปลงเป็น vector อัตโนมัติ (multilingual-e5-large)
    → ผลลัพธ์ top 3:
        [0.95] ยิงใบขนไม่ผ่าน...
        [0.87] ส่งซ้ำไม่ผ่าน...
        [0.81] รอคำตอบกรมศุลฯ...
    ↓
Build prompt:
    [system prompt (prompt.mjs) — persona + rules + เบอร์ติดต่อ]
    + ข้อมูลที่เกี่ยวข้องกับคำถามนี้:
        Q: ยิงใบขนไม่ผ่าน
        A: ให้ส่งซ้ำผ่านเมนู...
    ↓
Groq AI ตอบโดยมีข้อมูลครบ
    ↓
Reply กลับ LINE user
```

### RAG Runtime Flow — Image Message
```
User ส่งรูป error จากโปรแกรม
    ↓
[1] Groq Vision (llama-4-scout-17b): อ่านรูป → แปลงเป็น text
    → "พบ error DISCHARGE PORT MISMATCH ในโปรแกรม"
    ↓
[2] Query Upstash Vector ด้วย text จาก Vision
    → [0.91] qa-038: DISCHARGE PORT MISMATCH...
    ↓
[3] Groq AI (llama-3.3-70b) + RAG context → ตอบ
    ↓
Reply กลับ LINE user
```

## Project Structure

```
line-support-bot-lambda/
├── CLAUDE.md
├── ARCHITECTURE.md      # Architecture diagram + flow โดยละเอียด
├── Makefile
├── package.json
├── src/
│   ├── index.mjs        # Lambda handler (หัวใจหลัก)
│   ├── prompt.mjs       # System prompt (persona + rules + เบอร์ติดต่อ)
│   ├── knowledge.mjs    # Q&A data 83 คู่ สำหรับ upload ขึ้น Upstash Vector
│   ├── upload-qa.mjs    # Script upload Q&A → Upstash (รันครั้งเดียว)
│   └── rag-qa.md        # Q&A knowledge base ต้นฉบับ (97 คู่, จาก chat log จริง)
├── scripts/
│   └── upload-qa.mjs    # สำเนาของ src/upload-qa.mjs
└── terraform/
    ├── main.tf          # Lambda + API Gateway + DynamoDB + IAM
    ├── variables.tf
    └── outputs.tf
```

## Environment Variables

| ตัวแปร | ใช้ทำอะไร |
|---|---|
| `GROQ_API_KEY` | Groq AI API |
| `LINE_CHANNEL_ACCESS_TOKEN` | ส่งข้อความกลับหา LINE user |
| `LINE_CHANNEL_SECRET` | ตรวจ webhook signature (Basic settings ใน LINE Console) |
| `DYNAMODB_TABLE` | ชื่อ table (set อัตโนมัติโดย Terraform) |
| `UPSTASH_VECTOR_REST_URL` | Upstash Vector endpoint |
| `UPSTASH_VECTOR_REST_TOKEN` | Upstash Vector token |

## RAG Setup (Phase 1 — ทำครั้งเดียว)

### 1. สมัคร Upstash Vector (ฟรี)
- เข้า console.upstash.com → สร้าง Vector Index
- Embedding model: **multilingual-e5-large** (รองรับภาษาไทย)
- คัดลอก `UPSTASH_VECTOR_REST_URL` และ `UPSTASH_VECTOR_REST_TOKEN`

### 2. เตรียม Q&A data
- แก้ไขไฟล์ `src/knowledge.mjs`
- Format: `[ { id: "qa-001", q: "คำถาม", a: "คำตอบ" }, ... ]`
- ต้นฉบับอยู่ที่ `src/rag-qa.md` (97 Q&A จาก LINE group chat จริง Feb–Apr 2026)
- ไฟล์ `src/knowledge.mjs` ปัจจุบันมี 83 คู่

### 3. Upload Q&A ขึ้น Upstash
```bash
UPSTASH_VECTOR_REST_URL=<url> \
UPSTASH_VECTOR_REST_TOKEN=<token> \
node src/upload-qa.mjs
```

## RAG Update (Phase 3 — เพิ่ม Q&A ทีหลัง)

ไม่ต้อง redeploy Lambda เลย:
```bash
# 1. เพิ่ม Q&A ใหม่ใน src/knowledge.mjs
# 2. Upload ใหม่
node src/upload-qa.mjs
# ระบบฉลาดขึ้นทันที
```

## Commands

### Deploy (ครั้งแรก)
```bash
# ใน WSL
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda

make init

make deploy \
  GROQ_API_KEY=<your_groq_key> \
  LINE_CHANNEL_ACCESS_TOKEN=<your_line_token> \
  LINE_CHANNEL_SECRET=<your_line_secret> \
  UPSTASH_VECTOR_REST_URL=<your_upstash_url> \
  UPSTASH_VECTOR_REST_TOKEN=<your_upstash_token>
```

จะได้ Webhook URL ออกมา เช่น:
```
https://xxxxxxxxxx.execute-api.ap-southeast-1.amazonaws.com/webhook
```

### ตั้งค่า Webhook ใน LINE Developers Console
1. เข้า developers.line.biz
2. เลือก Channel → Messaging API
3. Webhook URL → ใส่ URL ที่ได้จาก terraform output
4. กด Verify → ควรขึ้น Success

### Update code (deploy ซ้ำ)
```bash
make deploy \
  GROQ_API_KEY=<your_groq_key> \
  LINE_CHANNEL_ACCESS_TOKEN=<your_line_token> \
  LINE_CHANNEL_SECRET=<your_line_secret> \
  UPSTASH_VECTOR_REST_URL=<your_upstash_url> \
  UPSTASH_VECTOR_REST_TOKEN=<your_upstash_token>
```

Webhook URL ไม่เปลี่ยน

### ดู Webhook URL ที่ deploy ไปแล้ว
```bash
cd terraform && terraform output webhook_url
```

### Destroy (ลบทุกอย่าง)
```bash
make destroy \
  GROQ_API_KEY=<your_groq_key> \
  LINE_CHANNEL_ACCESS_TOKEN=<your_line_token>
```

จะลบ Lambda + API Gateway + DynamoDB ทั้งหมด

## AWS Resources ที่สร้าง

| Resource | ชื่อ | Free tier |
|---|---|---|
| Lambda | line-support-bot | 1M requests/เดือน |
| API Gateway | line-support-bot-api | 1M requests/เดือน |
| DynamoDB | line-support-bot-history | 25GB |
| IAM Role | line-support-bot-role | ฟรี |
| Upstash Vector | (สร้างเอง) | 10K queries/วัน |

## AI Models

| ใช้ทำอะไร | Model | Fallback |
|---|---|---|
| ตอบข้อความ (text) | llama-3.3-70b-versatile | llama-3.1-8b → gemma2-9b |
| วิเคราะห์รูปภาพ (vision) | llama-4-scout-17b | — |
| Embedding (RAG) | multilingual-e5-large | — (Upstash built-in) |

## หมายเหตุ

- Chat history หมดอายุอัตโนมัติใน 24 ชม. (DynamoDB TTL)
- Lambda timeout ตั้งไว้ 30 วินาที (Groq AI อาจช้าบางครั้ง)
- ถ้า Groq model หลักล้มเหลว จะ fallback ไป model ถัดไปอัตโนมัติ
- Knowledge base (rag-qa.md) มี 97 Q&A จาก LINE group chat จริง Feb–Apr 2026
- knowledge.mjs (อัปโหลดจริง) มี 83 คู่
- เพิ่ม Q&A ใหม่ได้ตลอดโดยไม่ต้อง redeploy Lambda
- รูปภาพก็ผ่าน RAG เหมือนกัน: Vision แปลงรูป → text → Upstash → Groq

## AWS Console Links

Lambda → Functions → line-support-bot
https://ap-southeast-1.console.aws.amazon.com/lambda/home?region=ap-southeast-1#/functions

API Gateway → line-support-bot-api
https://ap-southeast-1.console.aws.amazon.com/apigateway/main/apis?region=ap-southeast-1

## AWS CLI

```bash
# ดู Lambda function
aws lambda get-function --function-name line-support-bot --output table

# ดู logs ล่าสุด (ต้องใช้บ่อยสุด)
aws logs tail /aws/lambda/line-support-bot --follow

# ดู DynamoDB — chat history ที่เก็บอยู่
aws dynamodb scan --table-name line-support-bot-history --output table

# ดู API Gateway
aws apigatewayv2 get-apis --output table
```
