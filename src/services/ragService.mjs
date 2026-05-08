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

function normalizeQuery(text) {
    return text
        .replace(/@\S+/g, "")          // ลบ @mention
        .replace(/\s+/g, " ")           // ลด whitespace
        .trim()
        .substring(0, 500);             // จำกัดความยาว
}

// Extract error codes and technical keywords from query for keyword matching
// e.g. "NUMERIC OR VALUE ERROR", "VSED-0061", "PYWZ000000333"
function extractKeywords(text) {
    const patterns = [
        /[A-Z][A-Z0-9_-]{2,}/g,        // ERROR CODES: NUMERIC, VSED-0061, CMAN
        /[A-Z]{2,}\d{4,}/g,             // Doc numbers: PYWZ000000333
    ];
    const keywords = new Set();
    for (const p of patterns) {
        const matches = text.match(p) || [];
        for (const m of matches) {
            // Skip common English words that aren't error codes
            if (!["THE", "AND", "FOR", "WITH", "FROM", "THAT", "THIS", "ARE", "NOT", "CDS"].includes(m)) {
                keywords.add(m);
            }
        }
    }
    return [...keywords];
}

// Keyword-based search for exact error codes/terms (no embedding needed)
async function keywordSearch(collection, query) {
    const keywords = extractKeywords(query);
    if (keywords.length === 0) return [];

    const regexParts = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = regexParts.join("|");
    const regex = new RegExp(pattern, "i");

    const results = await collection.find(
        { $or: [{ q: regex }, { a: regex }] },
        { projection: { q: 1, a: 1, _id: 1 } }
    ).limit(3).toArray();

    return results.map(r => ({ _id: r._id, q: r.q, a: r.a, score: 0.85, source: "keyword" }));
}

export async function searchKnowledge(query) {
    if (!MONGODB_URI || !GOOGLE_AI_API_KEY) return [];
    try {
        const normalized = normalizeQuery(query);
        const collection = await getCollection();

        // Run vector search and keyword search in parallel
        const [vectorResults, kwResults] = await Promise.all([
            collection.aggregate([
                {
                    $vectorSearch: {
                        index: "vector_index",
                        path: "embedding",
                        queryVector: await getEmbedding(normalized),
                        numCandidates: 150,
                        limit: 5,
                    },
                },
                { $project: { q: 1, a: 1, score: { $meta: "vectorSearchScore" } } },
            ]).toArray().then(r =>
                r.filter(r => r.score >= 0.65).map(r => ({ ...r, source: "vector" }))
            ),
            keywordSearch(collection, normalized),
        ]);

        // Merge: keyword hits first (exact match), then vector hits (deduplicated by _id)
        const seen = new Set();
        const merged = [];
        for (const r of [...kwResults, ...vectorResults]) {
            const id = String(r._id);
            if (!seen.has(id)) {
                seen.add(id);
                merged.push(r);
            }
        }

        if (kwResults.length > 0) {
            console.log(`RAG keyword: พบ ${kwResults.length} keyword matches`);
        }

        return merged
            .slice(0, 5)
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
