import { Index } from "@upstash/vector";

let vectorIndex = null;

function getVectorIndex() {
    if (!vectorIndex && process.env.UPSTASH_VECTOR_REST_URL && process.env.UPSTASH_VECTOR_REST_TOKEN) {
        vectorIndex = new Index({
            url: process.env.UPSTASH_VECTOR_REST_URL,
            token: process.env.UPSTASH_VECTOR_REST_TOKEN,
        });
    }
    return vectorIndex;
}

export async function searchKnowledge(query) {
    const idx = getVectorIndex();
    if (!idx) return [];
    try {
        const results = await idx.query({ data: query, topK: 3, includeMetadata: true });
        return results.filter(r => r.score >= 0.7);
    } catch (err) {
        console.log("Upstash query failed:", err.message);
        return [];
    }
}

export function buildKnowledgeContext(matches) {
    if (matches.length === 0) return "";
    const lines = matches.map(m => `Q: ${m.metadata.q}\nA: ${m.metadata.a}`).join("\n\n");
    return `\n\nข้อมูลที่เกี่ยวข้องกับคำถามนี้:\n${lines}`;
}
