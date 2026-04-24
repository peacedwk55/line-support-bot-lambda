// รันครั้งเดียวเพื่ออัพโหลด Q&A ขึ้น Upstash Vector
// node scripts/upload-qa.mjs

import { Index } from "@upstash/vector";
import { QA_PAIRS } from "../src/knowledge.mjs";

const { UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN } = process.env;

if (!UPSTASH_VECTOR_REST_URL || !UPSTASH_VECTOR_REST_TOKEN) {
    console.error("กรุณาตั้งค่า UPSTASH_VECTOR_REST_URL และ UPSTASH_VECTOR_REST_TOKEN");
    process.exit(1);
}

const index = new Index({
    url: UPSTASH_VECTOR_REST_URL,
    token: UPSTASH_VECTOR_REST_TOKEN,
});

console.log(`กำลังอัพโหลด ${QA_PAIRS.length} Q&A pairs ขึ้น Upstash Vector...`);

for (const pair of QA_PAIRS) {
    await index.upsert({
        id: pair.id,
        data: `${pair.q} ${pair.a}`,
        metadata: { q: pair.q, a: pair.a },
    });
    console.log(`✓ ${pair.id}: ${pair.q.substring(0, 40)}...`);
}

console.log("\nเสร็จแล้ว! ตรวจสอบได้ที่ Upstash Console");
