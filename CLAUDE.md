# line-support-bot-lambda

LINE OA Support Bot + LIFF Web Chat สำหรับทีม Application Support บริษัท CDSCOM
ช่วยตอบปัญหาการใช้งานระบบ Express (โปรแกรมพิธีการศุลกากร)

## Stack

| | เดิม (Express) | Lambda | Lambda + RAG | Lambda + RAG + LIFF |
|---|---|---|---|---|
| Runtime | Node.js + Express | AWS Lambda | AWS Lambda | AWS Lambda |
| Webhook | cloudflared tunnel | API Gateway | API Gateway | API Gateway |
| Chat history | In-memory (หายเมื่อ restart) | DynamoDB (24 ชม.) | DynamoDB (24 ชม.) | DynamoDB (24 ชม.) |
| Knowledge base | hardcoded ใน prompt | hardcoded ใน prompt.mjs | Upstash Vector | Upstash Vector |
| Web Chat | ไม่มี | ไม่มี | ไม่มี | LIFF + GitHub Pages |
| ค่าใช้จ่าย | ต้องรันเครื่องตลอด | ฟรี | ฟรี | ฟรีทั้งหมด |

## Architecture

### ปัจจุบัน — 2 ช่องทาง

```
ช่องทาง 1: LINE OA (DM)
─────────────────────────────────────────────────────
LINE OA
    ↓
API Gateway → POST /webhook (ตรวจ x-line-signature)
    ↓
Lambda (src/index.mjs)
    ├── Upstash Vector → query Q&A (top 3, score ≥ 0.7)
    ├── Groq AI (llama-3.3-70b) → ตอบ text
    ├── Groq Vision (llama-4-scout-17b) → อ่านรูป → RAG → ตอบ
    └── DynamoDB → เก็บประวัติสนทนา 24 ชม.

ช่องทาง 2: LIFF Web Chat (ลิงก์ใน LINE)
─────────────────────────────────────────────────────
User คลิกลิงก์ https://liff.line.me/2009887373-F9GIcCMR
    ↓
GitHub Pages (docs/index.html) — LIFF SDK → ดึง userId จาก LINE
    ↓
API Gateway → POST /chat (CORS enabled)
    ↓
Lambda (src/index.mjs) — handleWebChat()
    ├── Text: RAG → Groq AI → reply
    └── Image: compress (canvas) → Vision → RAG → Groq AI → reply
```

### RAG Runtime Flow — Text Message (ทั้ง 2 ช่องทาง)
```
User: "ยิงใบขนไม่ผ่านทำยังไง"
    ↓
Query Upstash Vector → top 3 matches (score ≥ 0.7)
    [0.95] ยิงใบขนไม่ผ่าน...
    [0.87] ส่งซ้ำไม่ผ่าน...
    ↓
Build prompt:
    [system prompt] + [RAG context] + [history] + [user msg]
    ↓
Groq AI → ตอบ → reply กลับ user
```

### RAG Runtime Flow — Image Message (ทั้ง 2 ช่องทาง)
```
User ส่งรูป error จากโปรแกรม
    ↓
[LINE OA]  Lambda ดาวน์โหลดจาก LINE API → base64
[Web Chat] Frontend compress ด้วย canvas → base64 → ส่ง API

    ↓
Groq Vision (llama-4-scout-17b): วิเคราะห์รูป → text
    → "พบ error DISCHARGE PORT MISMATCH ในโปรแกรม"
    ↓
Query Upstash Vector → RAG context
    ↓
Groq AI → ตอบ → reply กลับ user
```

## Project Structure

```
line-support-bot-lambda/
├── CLAUDE.md
├── ARCHITECTURE.md
├── Makefile             # ใช้ได้เฉพาะ WSL/Linux เท่านั้น (CRLF issue บน Windows)
├── package.json
├── docs/
│   └── index.html       # LIFF Web Chat UI (host บน GitHub Pages)
├── src/
│   ├── index.mjs        # Lambda handler — /webhook + /chat
│   ├── prompt.mjs       # System prompt (persona + rules + เบอร์ติดต่อ)
│   ├── knowledge.mjs    # Q&A data 83 คู่ สำหรับ upload ขึ้น Upstash Vector
│   ├── upload-qa.mjs    # Script upload Q&A → Upstash (รันครั้งเดียว)
│   └── rag-qa.md        # Q&A knowledge base ต้นฉบับ (97 คู่, จาก chat log จริง)
├── scripts/
│   └── upload-qa.mjs    # สำเนาของ src/upload-qa.mjs
└── terraform/
    ├── main.tf          # Lambda + API Gateway (CORS) + DynamoDB + IAM
    ├── variables.tf
    └── outputs.tf
```

## Environment Variables

| ตัวแปร | ใช้ทำอะไร | ดูได้จาก |
|---|---|---|
| `GROQ_API_KEY` | Groq AI API | console.groq.com |
| `LINE_CHANNEL_ACCESS_TOKEN` | ส่งข้อความกลับหา LINE user | LINE Developers → Messaging API |
| `LINE_CHANNEL_SECRET` | ตรวจ webhook signature (security) | LINE Developers → Basic settings |
| `DYNAMODB_TABLE` | ชื่อ table (set อัตโนมัติโดย Terraform) | — |
| `UPSTASH_VECTOR_REST_URL` | Upstash Vector endpoint | console.upstash.com |
| `UPSTASH_VECTOR_REST_TOKEN` | Upstash Vector token | console.upstash.com |

## LIFF Web Chat Setup (ทำครั้งเดียว)

### 1. สร้าง LINE Login Channel
- LINE Developers Console → Provider → **Create channel** → **LINE Login**
- App type: **Web app**

### 2. สร้าง LIFF App
- LINE Login channel → แถบ **LIFF** → **Add**
- Size: **Full**
- Endpoint URL: `https://peacedwk55.github.io/line-support-bot-lambda/`
- Scopes: **openid + profile**
- Add friend option: **Off**
- ได้ LIFF ID: `2009887373-F9GIcCMR`
- LIFF URL: `https://liff.line.me/2009887373-F9GIcCMR`

### 3. GitHub Pages
- repo: `github.com/peacedwk55/line-support-bot-lambda` (Public)
- Settings → Pages → Branch: `main` / Folder: `/docs`
- URL: `https://peacedwk55.github.io/line-support-bot-lambda/`

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

## RAG Update — เพิ่ม Q&A ใหม่ (ไม่ต้อง redeploy)

```bash
# 1. เพิ่ม Q&A ใหม่ใน src/knowledge.mjs
# 2. Upload ใหม่
node src/upload-qa.mjs
# ระบบฉลาดขึ้นทันที
```

## Commands

> **สำคัญ:** Makefile มีปัญหา CRLF บน Windows PowerShell — ให้รันใน **WSL เท่านั้น**

### Deploy ครั้งแรก (WSL)
```bash
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda

# 1. Init Terraform (ครั้งแรกครั้งเดียว)
cd terraform && terraform init && cd ..

# 2. Build + Deploy
npm install
zip -r deploy.zip src/ node_modules/ package.json
cd terraform && terraform apply -auto-approve \
  -var="groq_api_key=<your_groq_key>" \
  -var="line_channel_access_token=<your_line_token>" \
  -var="line_channel_secret=<your_line_secret>" \
  -var="upstash_vector_rest_url=<your_upstash_url>" \
  -var="upstash_vector_rest_token=<your_upstash_token>"
```

จะได้ output:
```
webhook_url  = "https://xxx.execute-api.ap-southeast-1.amazonaws.com/webhook"
chat_api_url = "https://xxx.execute-api.ap-southeast-1.amazonaws.com/chat"
```

### ตั้งค่า Webhook ใน LINE Developers Console
1. เข้า developers.line.biz → Messaging API channel
2. Webhook URL → ใส่ค่า `webhook_url` จาก terraform output
3. กด **Verify** → ควรขึ้น **Success**

### Update Lambda code (WSL)
```bash
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda
npm install
zip -r deploy.zip src/ node_modules/ package.json
cd terraform && terraform apply -auto-approve \
  -var="groq_api_key=<key>" \
  -var="line_channel_access_token=<token>" \
  -var="line_channel_secret=<secret>" \
  -var="upstash_vector_rest_url=<url>" \
  -var="upstash_vector_rest_token=<token>"
```

### Update frontend เท่านั้น (ไม่ต้อง rebuild Lambda)
```bash
# แก้ไข docs/index.html แล้ว push
git add docs/index.html
git commit -m "Update web chat UI"
git push
# GitHub Pages อัปเดตอัตโนมัติภายใน 1-2 นาที
```

### ดู URLs ที่ deploy ไปแล้ว
```bash
cd terraform && terraform output
```

### Destroy (ลบทุกอย่างบน AWS)
```bash
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda/terraform
terraform destroy -auto-approve \
  -var="groq_api_key=<key>" \
  -var="line_channel_access_token=<token>" \
  -var="line_channel_secret=<secret>" \
  -var="upstash_vector_rest_url=<url>" \
  -var="upstash_vector_rest_token=<token>"
```

## AWS Resources ที่สร้าง

| Resource | ชื่อ | Free tier |
|---|---|---|
| Lambda | line-support-bot | 1M requests/เดือน |
| API Gateway | line-support-bot-api | 1M requests/เดือน |
| DynamoDB | line-support-bot-history | 25GB |
| IAM Role | line-support-bot-role | ฟรี |
| Upstash Vector | (สร้างเอง) | 10K queries/วัน |
| GitHub Pages | peacedwk55.github.io | ฟรีตลอด |

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
- รูปภาพผ่าน RAG ทั้ง LINE OA และ Web Chat: Vision → text → Upstash → Groq
- Image ในกลุ่ม LINE: bot ไม่ตอบ (ตรวจ mention ไม่ได้สำหรับรูป)
- History เก็บรายคน (userId) ไม่แชร์ข้ามกลุ่ม
- Web Chat compress รูปด้วย canvas ก่อนส่ง (max 1024px, quality 0.8)
- Makefile ใช้ได้เฉพาะ WSL — อย่ารันบน Windows PowerShell

## AWS Console Links

Lambda → Functions → line-support-bot
https://ap-southeast-1.console.aws.amazon.com/lambda/home?region=ap-southeast-1#/functions

API Gateway → line-support-bot-api
https://ap-southeast-1.console.aws.amazon.com/apigateway/main/apis?region=ap-southeast-1

## AWS CLI

```bash
# ดู logs ล่าสุด (ใช้บ่อยสุด)
aws logs tail /aws/lambda/line-support-bot --follow

# ดู Lambda function
aws lambda get-function --function-name line-support-bot --output table

# ดู DynamoDB — chat history ที่เก็บอยู่
aws dynamodb scan --table-name line-support-bot-history --output table

# ดู API Gateway
aws apigatewayv2 get-apis --output table
```
แก้อะไร	ทำอะไร
แก้ Lambda code (src/)	rebuild ใน WSL → npm install + zip + terraform apply
แก้ Web Chat UI (docs/)	git push อย่างเดียว
เพิ่ม Q&A	node src/upload-qa.mjs อย่างเดียว
ไม่กระทบ LIFF หรือ LINE channel เลยครับ