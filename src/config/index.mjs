export const TABLE = process.env.DYNAMODB_TABLE || "line-support-bot-history";
export const TTL_SECONDS = 60 * 60 * 24;

export const MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
];

export const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export const LIFF_URL = "https://liff.line.me/2009887373-F9GIcCMR";

export const LIFF_KEYWORDS = ["เว็บ", "web", "chat", "แชท", "ลิ้งค์", "ลิงก์", "link", "url", "liff", "หน้าเว็บ", "เปิดเว็บ", "webchat"];

export const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
