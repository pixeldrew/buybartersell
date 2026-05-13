#!/usr/bin/env ts-node
import * as fs from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaAttachment {
    type: "image" | "video" | "audio" | "document" | "sticker" | "gif" | "unknown";
    filename: string | null;
    mentionedInText: boolean;
}

interface RawMessage {
    timestamp: string;
    sender: string;
    phoneNumber: string | null;
    text: string;
    media: MediaAttachment[];
}

interface GearListing extends RawMessage {
    brand: string | null;
    item: string | null;
    size: string | null;
    year: string | null;
    price: string | null;
    currency: string | null;
    condition: string | null;
    sentiment: "selling" | "wanted" | "info" | "unrelated";
}

interface LMStudioResponse {
    choices: Array<{ message: { content: string } }>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const cliArgs  = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const cliFlags = process.argv.slice(2).filter((a) => a.startsWith("--"));

const CONFIG = {
    lmStudioUrl:     (process.env.LMSTUDIO_URL ?? 'http://localhost:1234') + "/api/v1/chat/completions",
    model:           "qwen/qwen3-vl-30b-a3b-instruct",
    inputFile:       cliArgs[0] ?? "_chat.txt",
    outputFile:      cliArgs[1] ?? "listings.json",
    batchSize:       5,
    mergeWindowMs:   5 * 60 * 1000,
    debug:           cliFlags.includes("--debug"),
    maxDebugSamples: 5,
};

const KNOWN_BRANDS = [
    "Cabrinha","Duotone","CORE","F-ONE","Naish","North","Ozone",
    "Slingshot","Liquid Force","Airush","Eleveight","Flysurfer",
    "Nobile","Best","Gin","Reedin","Xenon","Ensis","Manera",
    "ION","Mystic","Prolimit","Dakine","Ride Engine",
    "Axis","Moses","Fanatic","Takoon","Crazyfly","Gaastra",
    "Peter Lynn","Go Foil","GoFoil","AK","Sabfoil","Unifoil",
    "KT","Levitaz","Armstrong","Appletree","BRM",
];

const KNOWN_ITEMS = [
    "kite","bar","lines","board","twin tip","directional","surfboard",
    "foil","hydrofoil","foilboard","mast","fuselage","wing","stabilizer",
    "front wing","rear wing","wetsuit","harness","seat harness",
    "waist harness","impact vest","helmet","pump","bag","bladder",
    "strut","leading edge","leash","spreader bar","wingboard","wing board",
];

// ─── Phone extraction ─────────────────────────────────────────────────────────

function extractPhoneFromSender(sender: string): string | null {
    const m = sender.match(/(?:\+|00)[\d\s\-().]{7,18}\d/);
    return m ? m[0].replace(/[\s\-().]/g, "") : null;
}

function extractPhoneFromText(text: string): string | null {
    const m = text.match(
        /(?:call|contact|whatsapp|wa|text|reach|dm|pm|number|tel|mob(?:ile)?)[^\d+]{0,15}((?:\+|00)[\d\s\-().]{7,18}\d)/i
    );
    if (m) return m[1].replace(/[\s\-().]/g, "");
    const intl = text.match(/(?:\+|00)\d[\d\s\-().]{7,17}\d/);
    return intl ? intl[0].replace(/[\s\-().]/g, "") : null;
}

// ─── Media extraction ─────────────────────────────────────────────────────────

function detectMediaType(filename: string | null, hint: string): MediaAttachment["type"] {
    const lower = (filename ?? hint).toLowerCase();
    if (/\.(jpg|jpeg|png|webp|heic|heif)$/.test(lower) || lower.includes("photo") || lower.startsWith("img-")) return "image";
    if (/\.(mp4|mov|avi|mkv)$/.test(lower) || lower.includes("video") || lower.startsWith("vid-")) return "video";
    if (/\.(opus|ogg|mp3|m4a|aac)$/.test(lower) || lower.startsWith("ptt-")) return "audio";
    if (/\.gif$/.test(lower) || lower.startsWith("gif-")) return "gif";
    if (lower.startsWith("stk-")) return "sticker";
    if (/\.(pdf|doc|docx|xls|xlsx|zip|rar)$/.test(lower) || lower.startsWith("doc-")) return "document";
    return "unknown";
}

function extractMedia(text: string): { media: MediaAttachment[]; cleanText: string } {
    const media: MediaAttachment[] = [];
    let cleanText = text;
    let m: RegExpExecArray | null;

    // <attached: filename>
    const tagRe = /<attached:\s*([\w\-.]+)>/gi;
    while ((m = tagRe.exec(text)) !== null) {
        media.push({ type: detectMediaType(m[1].trim(), ""), filename: m[1].trim(), mentionedInText: false });
        cleanText = cleanText.replace(m[0], "");
    }
    // filename (file attached)
    const fileRe = /([\w\-. ]+\.\w{2,5})\s*\(file attached\)/gi;
    while ((m = fileRe.exec(text)) !== null) {
        media.push({ type: detectMediaType(m[1].trim(), ""), filename: m[1].trim(), mentionedInText: false });
        cleanText = cleanText.replace(m[0], "");
    }
    // image/video omitted
    const omitRe = /\u200e?(image|video|audio|sticker|gif|document)\s+omitted/gi;
    while ((m = omitRe.exec(text)) !== null) {
        media.push({ type: detectMediaType(null, m[1]), filename: null, mentionedInText: false });
        cleanText = cleanText.replace(m[0], "");
    }

    if (/\b(pic(s|ture)?|photo|image|video|clip)\b/i.test(cleanText))
        media.forEach((a) => (a.mentionedInText = true));

    cleanText = cleanText.replace(/[\u200e\u200f\u200b]/g, "").replace(/\s+/g, " ").trim();
    return { media, cleanText };
}

// ─── WhatsApp parser ──────────────────────────────────────────────────────────

function parseWhatsAppExport(filePath: string): RawMessage[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const rawLines = content.split("\n");

    const tsRegex =
        /^[\u200e\u200f]?\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}:\d{2}\s?[AP]M)\]\s(.+?):\s?([\s\S]*)$/;

    type Block = { date: string; time: string; sender: string; lines: string[] };
    const blocks: Block[] = [];
    let current: Block | null = null;

    for (const line of rawLines) {
        const stripped = line.replace(/^[\u200e\u200f]+/, "");
        const m = stripped.match(tsRegex);
        if (m) {
            if (current) blocks.push(current);
            const [, date, time, sender, text] = m;
            current = { date, time, sender: sender.trim(), lines: [text] };
        } else {
            current?.lines.push(line);
        }
    }
    if (current) blocks.push(current);

    // Merge same-sender bursts
    type MergedBlock = Block & { endTime: string };
    const merged: MergedBlock[] = [];

    function parseTs(date: string, time: string): number {
        return new Date(`${date} ${time}`).getTime();
    }

    for (const block of blocks) {
        const last = merged[merged.length - 1];
        const ts = parseTs(block.date, block.time);
        const lastTs = last ? parseTs(last.date, last.endTime) : 0;
        if (last && last.sender === block.sender && ts - lastTs <= CONFIG.mergeWindowMs) {
            last.lines.push(...block.lines);
            last.endTime = block.time;
        } else {
            merged.push({ ...block, endTime: block.time });
        }
    }

    const SKIP = [
        /requested to join/i,
        /this message was deleted/i,
        /waiting for this message/i,
        /changed the (group|subject|icon|description)/i,
        /messages? and calls? are end-to-end encrypted/i,
        /\bwas (added|removed)\b/i,
        /\bjoined using (a|this) (group link|invite link)\b/i,
        /\bleft\b/i,
    ];

    const messages: RawMessage[] = [];
    for (const block of merged) {
        const rawText = block.lines.join(" ");
        const { media, cleanText } = extractMedia(rawText);
        if (SKIP.some((re) => re.test(cleanText)) && media.length === 0) continue;
        if (!cleanText && media.length === 0) continue;

        const sender = block.sender.replace(/^~\s*/, "").trim();
        const phoneNumber = extractPhoneFromSender(sender) ?? extractPhoneFromText(cleanText);

        messages.push({ timestamp: `${block.date} ${block.time}`, sender, phoneNumber, text: cleanText, media });
    }

    return messages;
}

// ─── Pre-filter ───────────────────────────────────────────────────────────────

function likelyGearRelated(msg: RawMessage): boolean {
    if (msg.media.length > 0) return true;
    const lower = msg.text.toLowerCase();
    return [
        ...KNOWN_BRANDS.map((b) => b.toLowerCase()),
        ...KNOWN_ITEMS,
        "sell","sale","selling","sold","wts","wtb","wanted","looking for",
        "asking","€","$","£","price","offer","nego","obo","firm",
        "condition","used","new","mint","good","great","excellent",
        "sessions","hours","pickup","ship","dm","pm","demo",
    ].some((kw) => lower.includes(kw));
}

// ─── JSON repair helpers ──────────────────────────────────────────────────────

/**
 * Best-effort repair of malformed JSON that small models commonly produce.
 * Kept as a fallback for non-structured-output paths.
 */
function repairJson(raw: string): string {
    const braceMatch = raw.match(/\{[\s\S]*\}/);
    if (!braceMatch) return raw;
    let s = braceMatch[0];

    s = s.replace(/:\s*(None|none|NULL|undefined)\b/g, ": null");
    s = s.replace(/:\s*True\b/g, ": true").replace(/:\s*False\b/g, ": false");
    s = s.replace(/,\s*([}\]])/g, "$1");
    s = s.replace(/"price"\s*:\s*"[$€£]?(\d+(?:\.\d+)?)"/, '"price": "$1"');
    s = s.replace(/\\'/g, "'");

    const out: string[] = [];
    let inString = false;
    let escaped = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (escaped) { out.push(ch); escaped = false; continue; }
        if (ch === "\\") { out.push(ch); escaped = true; continue; }
        if (ch === '"') {
            if (!inString) {
                inString = true;
                out.push(ch);
            } else {
                const rest = s.slice(i + 1).trimStart();
                if (/^[:,}\]]/.test(rest)) {
                    inString = false;
                    out.push(ch);
                } else {
                    out.push('\\"');
                }
            }
            continue;
        }
        out.push(ch);
    }
    return out.join("");
}

// ─── LLM extraction ───────────────────────────────────────────────────────────

let debugSamplesShown = 0;

async function extractGear(msg: RawMessage): Promise<GearListing> {
    const FALLBACK: GearListing = {
        timestamp: msg.timestamp, sender: msg.sender, phoneNumber: msg.phoneNumber, text: msg.text, media: msg.media,
        brand: null, item: null, size: null, year: null,
        price: null, currency: null, condition: null,
        sentiment: "unrelated",
    };

    const mediaNote = msg.media.length > 0 ? ` [${msg.media.length} media attached]` : "";

    const systemPrompt = `Extract structured data from watersports gear buy/sell WhatsApp messages.

Fields (null if unknown):
- brand: gear brand
- item: gear type (kite/board/foil/wing/mast/bar/harness/wetsuit/etc)
- size: size with unit (e.g. "12m", "75cm", "142cm")
- year: model year
- price: numeric string only (e.g. "330")
- currency: ISO code (USD/EUR/GBP/ARS/etc)
- condition: condition description
- sentiment: "selling" | "wanted" | "info" | "unrelated"

Known brands: ${KNOWN_BRANDS.join(", ")}`;

    const userPrompt = `timestamp: ${msg.timestamp}
sender: ${msg.sender}
phoneNumber: ${msg.phoneNumber ?? "unknown"}
media: ${JSON.stringify(msg.media)}
text: "${msg.text}"${mediaNote}
/no_think`;

    const nullable = (t: string) => ({ anyOf: [{ type: t }, { type: "null" }] });

    const responseSchema = {
        type: "object",
        properties: {
            timestamp:   { type: "string" },
            sender:      { type: "string" },
            phoneNumber: nullable("string"),
            text:        { type: "string" },
            media: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type:            { type: "string", enum: ["image", "video", "audio", "document", "sticker", "gif", "unknown"] },
                        filename:        nullable("string"),
                        mentionedInText: { type: "boolean" },
                    },
                    required: ["type", "filename", "mentionedInText"],
                    additionalProperties: false,
                },
            },
            brand:     nullable("string"),
            item:      nullable("string"),
            size:      nullable("string"),
            year:      nullable("string"),
            price:     nullable("string"),
            currency:  nullable("string"),
            condition: nullable("string"),
            sentiment: { type: "string", enum: ["selling", "wanted", "info", "unrelated"] },
        },
        required: ["timestamp", "sender", "phoneNumber", "text", "media", "brand", "item", "size", "year", "price", "currency", "condition", "sentiment"],
        additionalProperties: false,
    };

    let rawResponse = "";
    try {
        const response = await fetch(CONFIG.lmStudioUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.ORKEY ?? ""}`,
            },
            body: JSON.stringify({
                model: CONFIG.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user",   content: userPrompt },
                ],
                temperature: 0.0,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name:   "gear_listing",
                        strict: true,
                        schema: responseSchema,
                    },
                },
            }),
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as LMStudioResponse;
        rawResponse = data.choices[0].message.content ?? "";

        if (CONFIG.debug && debugSamplesShown < CONFIG.maxDebugSamples) {
            console.log("\n[DEBUG] ─────────────────────────────────");
            console.log("[DEBUG] Message :", msg.text.slice(0, 100));
            console.log("[DEBUG] Response:", rawResponse.slice(0, 400));
            debugSamplesShown++;
        }

        return JSON.parse(rawResponse) as GearListing;
    } catch (err) {
        if (CONFIG.debug) {
            console.log("[DEBUG] ⚠ Parse error:", (err as Error).message);
            console.log("[DEBUG]   Raw     :", rawResponse.slice(0, 300));
            console.log("[DEBUG]   Repaired:", repairJson(rawResponse).slice(0, 300));
        }
        return FALLBACK;
    }
}

// ─── Batch processor ──────────────────────────────────────────────────────────

async function processBatch(messages: RawMessage[]): Promise<GearListing[]> {
    const results = await Promise.allSettled(
        messages.map((msg) => extractGear(msg))
    );
    return results
        .filter((r): r is PromiseFulfilledResult<GearListing> => r.status === "fulfilled")
        .map((r) => r.value);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(listings: GearListing[]): void {
    const selling = listings.filter((l) => l.sentiment === "selling");
    const wanted  = listings.filter((l) => l.sentiment === "wanted");
    const info    = listings.filter((l) => l.sentiment === "info");

    const brandCounts: Record<string, number> = {};
    const itemCounts:  Record<string, number> = {};
    for (const l of [...selling, ...wanted]) {
        if (l.brand) brandCounts[l.brand] = (brandCounts[l.brand] ?? 0) + 1;
        if (l.item)  itemCounts[l.item]   = (itemCounts[l.item]  ?? 0) + 1;
    }

    const withPhone  = listings.filter((l) => l.phoneNumber !== null).length;
    const withMedia  = listings.filter((l) => l.media.length > 0).length;
    const totalMedia = listings.reduce((s, l) => s + l.media.length, 0);
    const mediaTypeCounts: Record<string, number> = {};
    for (const l of listings)
        for (const m of l.media)
            mediaTypeCounts[m.type] = (mediaTypeCounts[m.type] ?? 0) + 1;

    console.log("\n══════════════════════════════════════════");
    console.log("  📊  WATERSPORTS GROUP ANALYSIS SUMMARY ");
    console.log("══════════════════════════════════════════");
    console.log(`  Total listings processed : ${listings.length}`);
    console.log(`  For sale                 : ${selling.length}`);
    console.log(`  Wanted / WTB             : ${wanted.length}`);
    console.log(`  Info / events            : ${info.length}`);
    console.log(`  With phone number        : ${withPhone}`);
    console.log(`  With media               : ${withMedia} (${totalMedia} files total)`);

    if (Object.keys(mediaTypeCounts).length > 0) {
        console.log("\n  📎  Media breakdown:");
        Object.entries(mediaTypeCounts)
            .sort(([, a], [, b]) => b - a)
            .forEach(([type, count]) => console.log(`     ${type.padEnd(12)} ${count}x`));
    }

    if (Object.keys(brandCounts).length > 0) {
        console.log("\n  🏷️  Top Brands:");
        Object.entries(brandCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .forEach(([brand, count]) => console.log(`     ${brand.padEnd(20)} ${count}x`));
    }

    if (Object.keys(itemCounts).length > 0) {
        console.log("\n  🪁  Top Items:");
        Object.entries(itemCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .forEach(([item, count]) => console.log(`     ${item.padEnd(20)} ${count}x`));
    }

    const priced = selling.filter((l) => l.price !== null);
    if (priced.length > 0) {
        const prices = priced.map((l) => parseFloat(l.price!)).filter((p) => !isNaN(p));
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const currency = priced.find((l) => l.currency)?.currency ?? "?";
        console.log(`\n  💰  Avg asking price       : ${avg.toFixed(0)} ${currency}`);
    }

    console.log("══════════════════════════════════════════\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log("🌊  WhatsApp Watersports Gear Parser");
    console.log(`    Model  : ${CONFIG.model}`);
    console.log(`    Input  : ${CONFIG.inputFile}`);
    console.log(`    Output : ${CONFIG.outputFile}`);
    if (CONFIG.debug) console.log("    Mode   : DEBUG (showing LLM samples)\n");
    else console.log("");

    // 1. Check Ollama
    try {
        if (!process.env.ORKEY) throw new Error("ORKEY not set");
        const health = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { "Authorization": `Bearer ${process.env.ORKEY}` },
        });
        if (!health.ok) throw new Error(`HTTP ${health.status}`);
        console.log("✅  OpenRouter reachable");
    } catch (err) {
        console.error(`❌  OpenRouter check failed: ${(err as Error).message}`);
        process.exit(1);
    }

    // 2. Parse
    if (!fs.existsSync(CONFIG.inputFile)) {
        console.error(`❌  File not found: ${CONFIG.inputFile}`);
        console.error("    Usage: npx ts-node watersports-parser.ts <_chat.txt> [listings.json] [--debug]");
        process.exit(1);
    }

    console.log("📂  Parsing WhatsApp export...");
    const allMessages = parseWhatsAppExport(CONFIG.inputFile);
    console.log(`    Found ${allMessages.length} messages (after burst-merge)`);

    // 3. Pre-filter
    const relevant = allMessages.filter(likelyGearRelated);
    console.log(`    ${relevant.length} look gear-related → sending to LLM\n`);

    // 4. Batch process
    const allListings: GearListing[] = [];
    const batches: RawMessage[][] = [];
    for (let i = 0; i < relevant.length; i += CONFIG.batchSize)
        batches.push(relevant.slice(i, i + CONFIG.batchSize));

    for (let i = 0; i < batches.length; i++) {
        process.stdout.write(`\r    Batch ${i + 1}/${batches.length} ...`);
        allListings.push(...(await processBatch(batches[i])));
    }
    console.log("\n");

    // 5. Keep everything except unrelated
    const gearListings = allListings.filter((l) => l.sentiment !== "unrelated");

    // 6. Save
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(gearListings, null, 2), "utf-8");
    console.log(`💾  Saved ${gearListings.length} listings → ${CONFIG.outputFile}`);

    // 7. Summary
    printSummary(gearListings);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});