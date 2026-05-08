// Fix UTF-8 Thai text that was stored as Latin-1 garbled characters
// Usage: node scripts/decode-chat.mjs "[LINE]CDS Paperless.txt"

import fs from "fs";

const inputPath = process.argv[2];
if (!inputPath) {
    console.error("Usage: node scripts/decode-chat.mjs <garbled-file.txt>");
    process.exit(1);
}

// Read as latin1: each byte maps 1:1 to a character (no multi-byte interpretation)
// This recovers the original UTF-8 bytes that were misread as Latin-1
const raw = fs.readFileSync(inputPath, "latin1");
const bytes = Buffer.from(raw, "latin1");
const thai = bytes.toString("utf-8");

const finalPath = inputPath.includes("-decoded") ? inputPath : inputPath.replace(/\.txt$/, "-decoded.txt");

fs.writeFileSync(finalPath, thai, "utf-8");
console.log(`Decoded → ${finalPath}`);
console.log(`Lines: ${thai.split("\n").length}`);
console.log("\nPreview (first 10 lines):");
thai.split("\n").slice(0, 10).forEach((l, i) => console.log(`${i + 1}: ${l}`));
