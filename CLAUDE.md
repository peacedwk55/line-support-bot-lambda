# LINE Support Bot — CDSCOM

AWS Lambda + RAG chatbot สำหรับทีม Application Support ตอบปัญหาระบบ Express (พิธีการศุลกากร)

## Stack

| ส่วน           | เทคโนโลยี |
| Runtime       | AWS Lambda (Node.js 20.x) |
| API           | API Gateway v2 HTTP API |
| AI (text)     | Groq — llama-3.3-70b → llama-3.1-8b → gemma2-9b |
| AI (vision)   | Groq — llama-4-scout-17b |
| Embedding     | Google Gemini Embedding API — gemini-embedding-001 (v1beta, dim 768) |
| Knowledge base| MongoDB Atlas M0 Free — Vector Search Index (cosine, 768 dim) |
| Chat history  | DynamoDB (TTL 24 ชม., เก็บ 10 messages ต่อ user) |
| Web Chat UI   | GitHub Pages (`docs/index.html`) + LIFF SDK |

## Project Structure

```
src/
├── index.mjs                  # Lambda entry — routing /webhook และ /chat
├── prompt.mjs                 # System prompt (persona, rules, เบอร์ติดต่อ)
├── knowledge.mjs              # Q&A data 333 คู่ (จาก chat history จริง)
├── rag-qa.md                  # Q&A ต้นฉบับ markdown (reference)
├── config/index.mjs           # Constants, env vars, CORS, model list
├── middleware/lineAuth.mjs    # ตรวจ x-line-signature (HMAC-SHA256)
├── services/
│   ├── groqService.mjs        # askAI, describeImage, downloadLineImage, replyToLine
│   ├── ragService.mjs         # Hybrid search: Vector + Keyword, buildKnowledgeContext
│   └── historyService.mjs     # getHistory, saveHistory
└── controllers/
    ├── lineController.mjs     # จัดการ LINE webhook events
    └── chatController.mjs     # จัดการ LIFF Web Chat requests

docs/index.html                # Web Chat UI (GitHub Pages)
scripts/
├── upload-qa.mjs              # Upload Q&A → embed ด้วย Google → insert MongoDB
├── parse-chat.mjs             # แปลง LINE chat export → Q&A pairs (thread-based)
└── decode-chat.mjs            # Decode garbled Thai encoding จาก LINE export
terraform/                     # Infrastructure as Code (Lambda + API GW + DynamoDB)
```

## Flow การทำงาน

### ช่องทาง 1 — LINE OA (`POST /webhook`)

```
User ส่งข้อความ/รูป
  → LINE → API Gateway → Lambda
  → verifySignature (HMAC-SHA256)
  → lineController.handleLineEvent()
      ├── [กลุ่ม] ต้อง mention @bot / "bot" / "บอท" ก่อน (รูปในกลุ่ม: ไม่ตอบ)
      ├── [text]  RAG → Groq AI → replyToLine
      └── [image] downloadLineImage → Vision → RAG → Groq AI → replyToLine
```

### ช่องทาง 2 — LIFF Web Chat (`POST /chat`)

```
User เปิด https://liff.line.me/2009887373-F9GIcCMR
  → GitHub Pages (LIFF SDK) → ดึง userId จาก LINE
  → fetch POST /chat { userId, message | imageBase64 }
  → API Gateway (CORS) → Lambda
  → chatController.handleWebChat()
      ├── [text]  RAG → Groq AI → { reply }
      └── [image] compress canvas (1024px) → Vision → RAG → Groq AI → { reply }
```

### RAG Pipeline — Hybrid Search (ทั้ง 2 ช่องทาง)

```
user message / vision text
  → normalizeQuery (ลบ @mention, trim)
  → [parallel]
      ├── Vector Search: Google Embedding → MongoDB $vectorSearch (top 5, score ≥ 0.65)
      └── Keyword Search: ดึง error codes (ALL_CAPS) → MongoDB $regex (top 3, score 0.85)
  → merge: keyword results ก่อน (exact match), dedup by _id, สูงสุด 5 results
  → buildKnowledgeContext → ต่อท้าย system prompt
  → [system + RAG context + history + user msg] → Groq AI → reply
  → saveHistory (DynamoDB)
```

**หมายเหตุ Keyword Search:** ดักจับ error codes เช่น `NUMERIC OR VALUE ERROR`, `INVALID STATISTIC CODE`, `VSED-0061` ได้แม่นกว่า vector search เพราะ match ตรงๆ

---

## Environment Variables

| ตัวแปร                       | ที่มา |
| `GROQ_API_KEY`              | console.groq.com |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API |
| `LINE_CHANNEL_SECRET`       | LINE Developers → Basic settings |
| `DYNAMODB_TABLE`            | Terraform (set อัตโนมัติ) |
| `MONGODB_URI`               | MongoDB Atlas → Connect → Drivers |
| `GOOGLE_AI_API_KEY`         | aistudio.google.com → Get API Key |

---

## คำสั่งที่ใช้บ่อย

> **สำคัญ:** Build/Deploy ต้องรันใน **WSL เท่านั้น** (Makefile มีปัญหา CRLF บน Windows)

### Deploy / Update Lambda code
```bash
cd /mnt/d/Project/Demo-chatbot/line-support-bot-lambda
zip -r deploy.zip src/ node_modules/ package.json
cd terraform && terraform apply -auto-approve \
  -var="groq_api_key=<key>" \
  -var="line_channel_access_token=<token>" \
  -var="line_channel_secret=<secret>" \
  -var="mongodb_uri=<uri>" \
  -var="google_ai_api_key=<key>"
```

> `npm install` ต้องรันใหม่เฉพาะเมื่อเพิ่ม/เปลี่ยน package เท่านั้น

### เพิ่ม Q&A จาก LINE chat export
```bash
# 1. แปลง chat log → Q&A pairs
node scripts/parse-chat.mjs "ชื่อไฟล์.txt"
# ผลออกมาที่ scripts/parsed-qa.txt → review แล้ว append เข้า src/knowledge.mjs

# 2. Upload ขึ้น MongoDB (ล้างเก่า + อัพใหม่ทั้งหมด)
MONGODB_URI=<uri> GOOGLE_AI_API_KEY=<key> node scripts/upload-qa.mjs
```

### Update Web Chat UI (ไม่ต้อง redeploy)
```bash
git add docs/index.html && git commit -m "Update UI" && git push
```

### ดู Logs (debug)
```bash
aws logs tail /aws/lambda/line-support-bot --follow
```

### ดู URLs ที่ deploy แล้ว
```bash
cd terraform && terraform output
```

---

## แก้อะไร → ทำอะไร

| แก้                                  | คำสั่ง |
| Lambda code / prompt (`src/`)       | deploy (WSL) |
| Web Chat UI (`docs/index.html`)     | `git push` |
| Q&A knowledge (`src/knowledge.mjs`) | `upload-qa.mjs` → ไม่ต้อง redeploy |

---

## MongoDB Atlas Setup

- Cluster: Cluster0 (M0 Free) — `cluster0.lztuuhq.mongodb.net`
- Database: `line-support-bot`
- Collection: `knowledge`
- Vector Search Index name: `vector_index`
- Index config:
```json
{
  "fields": [{
    "type": "vector",
    "path": "embedding",
    "numDimensions": 768,
    "similarity": "cosine"
  }]
}
```

## Google Embedding

- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`
- `outputDimensionality: 768` ต้องตรงกับ MongoDB index
- `text-embedding-004` และ `embedding-001` ใช้ไม่ได้จาก IP ไทย → ใช้ `gemini-embedding-001` เท่านั้น
- API key ได้จาก aistudio.google.com (ฟรี)
