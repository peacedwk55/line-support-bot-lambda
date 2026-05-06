// รันครั้งเดียวเพื่ออัพโหลด Q&A ขึ้น MongoDB Atlas
// MONGODB_URI=<uri> GOOGLE_AI_API_KEY=<key> node scripts/upload-qa.mjs

import { MongoClient } from "mongodb";
import { QA_PAIRS } from "../src/knowledge.mjs";

const { MONGODB_URI, GOOGLE_AI_API_KEY } = process.env;

if (!MONGODB_URI || !GOOGLE_AI_API_KEY) {
    console.error("กรุณาตั้งค่า MONGODB_URI และ GOOGLE_AI_API_KEY");
    process.exit(1);
}

async function getEmbedding(text) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GOOGLE_AI_API_KEY}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: { parts: [{ text }] },
            outputDimensionality: 768,
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google Embedding error: ${res.status} ${err}`);
    }
    const data = await res.json();
    return data.embedding.values;
}

const client = new MongoClient(MONGODB_URI);
await client.connect();
const collection = client.db("line-support-bot").collection("knowledge");

// ล้างข้อมูลเก่า
await collection.deleteMany({});
console.log("ล้างข้อมูลเก่าแล้ว");
console.log(`กำลังอัพโหลด ${QA_PAIRS.length} Q&A pairs ขึ้น MongoDB Atlas...`);

for (const pair of QA_PAIRS) {
    const text = `${pair.q} ${pair.a}`;
    const embedding = await getEmbedding(text);
    await collection.insertOne({
        _id: pair.id,
        q: pair.q,
        a: pair.a,
        embedding,
    });
    console.log(`✓ ${pair.id}: ${pair.q.substring(0, 40)}...`);
}

await client.close();
console.log("\nเสร็จแล้ว! ตรวจสอบได้ที่ MongoDB Atlas");
