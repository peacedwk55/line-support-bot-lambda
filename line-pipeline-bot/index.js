import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { SYSTEM_PROMPT } from "./prompt.js";

dotenv.config();
const app = express();
app.use(express.json());

// เก็บประวัติสนทนาแยกตาม userId (สูงสุด 10 ข้อความต่อคน)
const chatHistory = {};

// เก็บสถานะรอ confirm "หมายถึงโปรเจคนี้ไหม"
const pendingConfirm = {};

const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it"
];

// ─── Groq AI ────────────────────────────────────────────────────────────────

async function askAI(messages, modelsOverride = MODELS) {
    for (const model of modelsOverride) {
        try {
            const res = await axios.post(
                "https://api.groq.com/openai/v1/chat/completions",
                { model, messages },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );
            return res.data.choices?.[0]?.message?.content;
        } catch (err) {
            const errMsg = err.response?.data?.error?.message || err.message;
            console.log(`Model ${model} failed: ${errMsg}`);
            if (err.response?.status === 429) break;
        }
    }
    return null;
}

// ใช้เฉพาะ model ที่รองรับภาษาไทยได้ดี ไม่ fallback ไป model เล็ก
const askAIThai = async (messages) => {
    const result = await askAI(messages, ["llama-3.3-70b-versatile"]);
    // กรอง CJK characters (จีน/ญี่ปุ่น/เกาหลี) ออก
    return result?.replace(/[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/g, "") || null;
};

async function askAIWithImage(base64Image, mimeType = "image/jpeg") {
    try {
        const res = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: [
                            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
                            { type: "text", text: "ช่วยดูรูปนี้และอธิบายในแง่ DevOps/Pipeline ด้วยนะคะ" }
                        ]
                    }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );
        return res.data.choices?.[0]?.message?.content;
    } catch (err) {
        const errMsg = err.response?.data?.error?.message || err.message;
        console.log(`Vision model failed: ${errMsg}`);
        return null;
    }
}

// ─── Azure DevOps ────────────────────────────────────────────────────────────

const AZURE_BASE = `https://${process.env.AZURE_DEVOPS_ORG}.visualstudio.com`;
const azureAuth = () =>
    `Basic ${Buffer.from(`:${process.env.AZURE_DEVOPS_PAT}`).toString("base64")}`;

// Cache รายชื่อโปรเจค 5 นาที
let _projectsCache = null;
let _projectsCacheTime = 0;
async function getCachedProjects() {
    if (_projectsCache && Date.now() - _projectsCacheTime < 5 * 60 * 1000) return _projectsCache;
    _projectsCache = await listProjects();
    _projectsCacheTime = Date.now();
    return _projectsCache;
}

// หาชื่อโปรเจคที่ใกล้เคียงที่สุด
function findClosestProject(input, projects) {
    const q = input.toLowerCase().replace(/[_\s]/g, "");
    const exact = projects.find(p => p.toLowerCase() === input.toLowerCase());
    if (exact) return exact;
    const sub = projects.find(p =>
        p.toLowerCase().replace(/[_\s]/g, "").includes(q) ||
        q.includes(p.toLowerCase().replace(/[_\s]/g, ""))
    );
    if (sub) return sub;
    // score ตามจำนวน char ที่ตรง
    let best = null, bestScore = 0;
    for (const p of projects) {
        const pq = p.toLowerCase().replace(/[_\s]/g, "");
        let score = 0;
        for (let i = 0; i < Math.min(q.length, pq.length); i++) {
            if (q[i] === pq[i]) score++;
        }
        score /= Math.max(q.length, pq.length);
        if (score > bestScore) { bestScore = score; best = p; }
    }
    return bestScore >= 0.5 ? best : null;
}

async function listProjects() {
    const res = await axios.get(
        `${AZURE_BASE}/_apis/projects?api-version=7.1`,
        { headers: { Authorization: azureAuth() } }
    );
    return (res.data.value || []).map(p => p.name).sort();
}

async function getLatestBuild(project) {
    const res = await axios.get(
        `${AZURE_BASE}/${project}/_apis/build/builds?$top=1&api-version=7.1`,
        { headers: { Authorization: azureAuth() } }
    );
    return res.data.value?.[0] || null;
}

async function getBuildById(project, buildId) {
    const res = await axios.get(
        `${AZURE_BASE}/${project}/_apis/build/builds/${buildId}?api-version=7.1`,
        { headers: { Authorization: azureAuth() } }
    );
    return res.data || null;
}

async function getFailedTasks(project, buildId) {
    const res = await axios.get(
        `${AZURE_BASE}/${project}/_apis/build/builds/${buildId}/timeline?api-version=7.1`,
        { headers: { Authorization: azureAuth() } }
    );
    const records = res.data.records || [];

    // จัดกลุ่ม record ตาม id เพื่อ lookup parent
    const byId = Object.fromEntries(records.map(r => [r.id, r]));

    // กรองเฉพาะ Task ที่ fail และมี log
    return records
        .filter(r => r.type === "Task" && r.result === "failed" && r.log?.url)
        .map(r => {
            // ไล่หา Job → Stage จาก parentId
            const job = byId[r.parentId];
            const stage = job ? byId[job.parentId] : null;
            return {
                stage: stage?.name || "-",
                job: job?.name || "-",
                task: r.name,
                logUrl: r.log.url
            };
        });
}

async function fetchLogText(logUrl) {
    const res = await axios.get(logUrl, { headers: { Authorization: azureAuth() } });
    const raw = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
    // เอาแค่ 2000 ตัวอักษรสุดท้ายต่อ task
    return raw.slice(-2000);
}

// ตรวจจับว่าถามรายชื่อโปรเจค
function detectListProjects(text) {
    const t = text.toLowerCase();
    return ["โปรเจคอะไรบ้าง", "โปรเจคไหนบ้าง", "มีโปรเจค", "list project", "รายชื่อโปรเจค"].some(w => t.includes(w));
}

// ตรวจจับว่า user ถามเรื่อง build ของโปรเจคไหน และ build ID ถ้ามี
function detectBuildQuery(text) {
    // จับ build ID (ตัวเลข 4-6 หลัก)
    const idMatch = text.match(/\b(\d{4,6})\b/);
    const buildId = idMatch ? idMatch[1] : null;

    // จับชื่อโปรเจค — มี uppercase (PascalCase) หรือ lowercase ล้วนก็ได้
    const words = text.match(/\b[a-zA-Z][a-zA-Z0-9_]{2,}\b/g) || [];
    const skipWords = ["build", "pipeline", "deploy", "status", "branch", "stage", "task", "job", "log"];
    const project = words.find(w => /[A-Z]/.test(w))
        || words.find(w => !skipWords.includes(w.toLowerCase()))
        || null;

    if (project) return { project, buildId };

    const t = text.toLowerCase();
    const buildWords = ["build", "pipeline", "deploy", "เฟล", "failed", "ล้มเหลว", "สถานะ", "status"];
    if (buildId && buildWords.some(w => t.includes(w))) return { project: null, buildId };

    return null;
}

async function handleBuildQuery({ project, buildId }, userId) {
    if (!project) return `ระบุชื่อโปรเจคด้วยนะคะ เช่น "MDHPortalSystem build ${buildId} เป็นยังไง"`;

    let build;
    try {
        build = buildId
            ? await getBuildById(project, buildId)
            : await getLatestBuild(project);
    } catch (err) {
        const status = err.response?.status;
        if (status === 404 || status === 400) {
            // หาชื่อโปรเจคที่ใกล้เคียง
            const projects = await getCachedProjects();
            const closest = findClosestProject(project, projects);
            if (closest && closest.toLowerCase() !== project.toLowerCase()) {
                pendingConfirm[userId] = { project: closest, buildId };
                return `ไม่พบโปรเจค "${project}" ค่ะ\nหมายถึง "${closest}" ใช่ไหมค่ะ?`;
            }
            // ไม่มีชื่อใกล้เคียง → แสดงรายชื่อทั้งหมด
            return `ไม่พบโปรเจค "${project}" ค่ะ\n\nโปรเจคทั้งหมด (${projects.length}):\n${projects.join("\n")}`;
        }
        return `เรียก Azure DevOps ไม่สำเร็จ (${status || err.message}) ค่ะ`;
    }
    if (!build) return buildId
        ? `ไม่พบ build #${buildId} ในโปรเจค "${project}" ค่ะ`
        : `ไม่พบ build ในโปรเจค "${project}" ค่ะ`;

    const statusEmoji = { succeeded: "✅", failed: "❌", inProgress: "🔄", canceled: "⏹️" };
    const emoji = statusEmoji[build.result || build.status] || "❓";
    const buildUrl = `${AZURE_BASE}/${project}/_build/results?buildId=${build.id}&view=results`;
    const finishTime = build.finishTime ? new Date(build.finishTime).toLocaleString("th-TH") : "-";

    if (build.result !== "failed") {
        return `${emoji} Build #${build.id} — ${project}\nBranch: ${build.sourceBranch?.replace("refs/heads/", "")}\nStatus: ${build.result || build.status}\nเวลา: ${finishTime}\n\n🔗 ${buildUrl}`;
    }

    // ถ้า failed → ดึง timeline หา task ที่ fail พร้อม log
    let failedTasks = [];
    try {
        failedTasks = await getFailedTasks(project, build.id);
    } catch (err) {
        console.log("getFailedTasks error:", err.message);
    }

    // สร้าง summary ของ task ที่ fail
    let taskSummary = "";
    let logsContext = "";

    if (failedTasks.length > 0) {
        taskSummary = failedTasks
            .map(t => `  Stage: ${t.stage} > Job: ${t.job} > Task: ${t.task}`)
            .join("\n");

        // ดึง log ของแต่ละ task ที่ fail (สูงสุด 3 tasks)
        const logParts = await Promise.all(
            failedTasks.slice(0, 3).map(async t => {
                try {
                    const text = await fetchLogText(t.logUrl);
                    return `[${t.stage} > ${t.task}]\n${text}`;
                } catch {
                    return `[${t.stage} > ${t.task}]\n(ดึง log ไม่ได้)`;
                }
            })
        );
        logsContext = logParts.join("\n\n");
    }

    const analysisPrompt = logsContext
        ? `[IMPORTANT: Use ONLY Thai language in your response. Never use Chinese, Japanese, or Korean characters.]\n\nBuild #${build.id} ของโปรเจค ${project} ล้มเหลวที่:\n${taskSummary}\n\nLog:\n${logsContext}\n\nวิเคราะห์สาเหตุที่ fail และแนวทางแก้ไข กระชับ ไม่เกิน 5 บรรทัด`
        : `[IMPORTANT: Use ONLY Thai language in your response. Never use Chinese, Japanese, or Korean characters.]\n\nBuild #${build.id} ของโปรเจค ${project} มีสถานะ failed แต่ดึง log ไม่ได้ แนะนำแนวทาง debug เบื้องต้น`;

    const analysis = await askAIThai([
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: analysisPrompt }
    ]);

    const taskBlock = taskSummary ? `\nTask ที่ fail:\n${taskSummary}\n` : "";
    return `❌ Build #${build.id} — ${project}\nBranch: ${build.sourceBranch?.replace("refs/heads/", "")}\nเวลา: ${finishTime}\n${taskBlock}\n${analysis || "วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้งค่ะ"}\n\n🔗 ${buildUrl}`;
}

// ─── LINE Webhook ─────────────────────────────────────────────────────────────

async function downloadLineImage(messageId) {
    const res = await axios.get(
        `https://api-data.line.me/v2/bot/message/${messageId}/content`,
        {
            headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
            responseType: "arraybuffer"
        }
    );
    return Buffer.from(res.data).toString("base64");
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    for (const event of req.body.events) {
        if (event.type !== "message") continue;

        const userId = event.source.userId || event.source.groupId || event.source.roomId;
        const msgType = event.message.type;

        if (msgType !== "text" && msgType !== "image") continue;

        if (!chatHistory[userId]) {
            chatHistory[userId] = [];
        }

        try {
            let reply;

            if (msgType === "image") {
                const base64Image = await downloadLineImage(event.message.id);
                reply = await askAIWithImage(base64Image) || "ขออภัย ลองใหม่อีกครั้งค่ะ";
            } else {
                const userMsg = event.message.text;

                const isYes = /^(ใช่|yes|ok|โอเค|ใช่ครับ|ใช่ค่ะ|ได้เลย|ถูกต้อง)/i.test(userMsg.trim());

                // ตรวจว่ามี pending confirm รออยู่ไหม
                if (pendingConfirm[userId]) {
                    const pending = pendingConfirm[userId];
                    delete pendingConfirm[userId];
                    if (isYes) {
                        reply = await handleBuildQuery(pending, userId);
                    } else {
                        reply = "ยกเลิกค่ะ ลองพิมพ์ชื่อโปรเจคใหม่ได้เลยค่ะ";
                    }
                // ตรวจว่าถามรายชื่อโปรเจค
                } else if (detectListProjects(userMsg)) {
                    const projects = await listProjects();
                    reply = projects.length
                        ? `โปรเจคทั้งหมด (${projects.length}):\n${projects.join("\n")}`
                        : "ไม่พบโปรเจคค่ะ";
                // ตรวจว่าถามเรื่อง build หรือเปล่า
                } else if (detectBuildQuery(userMsg)) {
                    reply = await handleBuildQuery(detectBuildQuery(userMsg), userId);
                } else {
                    chatHistory[userId].push({ role: "user", content: userMsg });
                    if (chatHistory[userId].length > 10) {
                        chatHistory[userId] = chatHistory[userId].slice(-10);
                    }
                    const messages = [
                        { role: "system", content: SYSTEM_PROMPT },
                        ...chatHistory[userId]
                    ];
                    reply = await askAI(messages) || "ขออภัย ลองใหม่อีกครั้งค่ะ";
                    chatHistory[userId].push({ role: "assistant", content: reply });
                }
            }

            await axios.post(
                "https://api.line.me/v2/bot/message/reply",
                {
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: reply }]
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
                        "Content-Type": "application/json"
                    }
                }
            );
        } catch (err) {
            console.error("Error:", err.response?.data || err.message);
        }
    }
});

app.listen(3002, () => console.log("Server running on 3002"));
