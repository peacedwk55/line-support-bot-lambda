import { MongoClient } from "mongodb";
import { MONGODB_URI, MONGODB_DB, MONGODB_COLLECTION, GOOGLE_AI_API_KEY } from "../config/index.mjs";

let client = null;

async function getCollection() {
    if (!client) {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
    }
    return client.db(MONGODB_DB).collection(MONGODB_COLLECTION);
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
    if (!res.ok) throw new Error(`Google Embedding error: ${res.status}`);
    const data = await res.json();
    return data.embedding.values;
}

export async function searchKnowledge(query) {
    if (!MONGODB_URI || !GOOGLE_AI_API_KEY) return [];
    try {
        const queryVector = await getEmbedding(query);
        const collection = await getCollection();
        const results = await collection.aggregate([
            {
                $vectorSearch: {
                    index: "vector_index",
                    path: "embedding",
                    queryVector,
                    numCandidates: 50,
                    limit: 3,
                },
            },
            {
                $project: {
                    q: 1,
                    a: 1,
                    score: { $meta: "vectorSearchScore" },
                },
            },
        ]).toArray();
        return results
            .filter(r => r.score >= 0.7)
            .map(r => ({ metadata: { q: r.q, a: r.a }, score: r.score }));
    } catch (err) {
        console.log("MongoDB search failed:", err.message);
        return [];
    }
}

export function buildKnowledgeContext(matches) {
    if (matches.length === 0) return "";
    const lines = matches.map(m => `Q: ${m.metadata.q}\nA: ${m.metadata.a}`).join("\n\n");
    return `\n\nข้อมูลที่เกี่ยวข้องกับคำถามนี้:\n${lines}`;
}
