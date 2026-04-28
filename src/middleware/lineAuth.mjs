import crypto from "crypto";

export function verifySignature(rawBody, signature) {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret) return true;
    const hash = crypto.createHmac("sha256", secret)
        .update(rawBody)
        .digest("base64");
    return hash === signature;
}
