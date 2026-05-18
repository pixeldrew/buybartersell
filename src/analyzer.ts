import {
  getUnanalyzedListingThreadsFromLastHour,
  updateAnalysisForMessages,
  updateListingThreadAnalysis,
  type GearAnalysis,
} from './db.ts';

// ─── Config ───────────────────────────────────────────────────────────────────

const LM_STUDIO_URL = (process.env.LMSTUDIO_URL ?? 'http://localhost:1234') + '/api/v1/chat/completions';
const MODEL         = process.env.LMSTUDIO_MODEL ?? 'qwen/qwen3-vl-30b-a3b-instruct';

// ─── Prompt ───────────────────────────────────────────────────────────────────

const KNOWN_BRANDS = [
  'Cabrinha', 'Duotone', 'CORE', 'F-ONE', 'Naish', 'North', 'Ozone',
  'Slingshot', 'Liquid Force', 'Airush', 'Eleveight', 'Flysurfer',
  'Nobile', 'Best', 'Gin', 'Reedin', 'Xenon', 'Ensis', 'Manera',
  'ION', 'Mystic', 'Prolimit', 'Dakine', 'Ride Engine',
  'Axis', 'Moses', 'Fanatic', 'Takoon', 'Crazyfly', 'Gaastra',
  'Peter Lynn', 'Go Foil', 'GoFoil', 'AK', 'Sabfoil', 'Unifoil',
  'KT', 'Levitaz', 'Armstrong', 'Appletree', 'BRM',
];

const SYSTEM_PROMPT = `Extract structured data from watersports gear buy/sell WhatsApp messages.

Fields (null if unknown):
- brand: gear brand
- item: gear type (kite/board/foil/wing/mast/bar/harness/wetsuit/etc)
- size: size with unit (e.g. "12m", "75cm", "142cm")
- year: model year
- price: numeric string only (e.g. "330")
- currency: ISO code (USD/EUR/GBP/ARS/etc)
- condition: condition description
- sentiment: "selling" | "wanted" | "info" | "unrelated"

Known brands: ${KNOWN_BRANDS.join(', ')}`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    brand:     { type: ['string', 'null'] },
    item:      { type: ['string', 'null'] },
    size:      { type: ['string', 'null'] },
    year:      { type: ['string', 'null'] },
    price:     { type: ['string', 'null'] },
    currency:  { type: ['string', 'null'] },
    condition: { type: ['string', 'null'] },
    sentiment: { type: 'string', enum: ['selling', 'wanted', 'info', 'unrelated'] },
  },
  required: ['brand', 'item', 'size', 'year', 'price', 'currency', 'condition', 'sentiment'],
  additionalProperties: false,
};

function buildUserPrompt(text: string, mediaCount: number): string {
  const mediaNote = mediaCount > 0 ? ` [${mediaCount} media attached]` : '';
  return `"For sale Dakine 5 meter Cyclone version 2, used never had a repair, well taken care of. Asking $330 usd . In Coconut Grove."
{"brand":"Dakine","item":"wing","size":"5m","year":null,"price":"330","currency":"USD","condition":"like new","sentiment":"selling"}
"2025 North Orbit 10m and 12m. Basically brand new (ridden 2 times each) paid $1200 for the 10m. DM me. Located in South Beach."
{"brand":"North","item":"kite","size":"10m","year":"2025","price":"1200","currency":"USD","condition":"like new","sentiment":"selling"}
"Parawing for sale $600 BRM Kanaha 5.5m Perfect condition"
{"brand":"BRM","item":"wing","size":"5.5m","year":null,"price":"600","currency":"USD","condition":"perfect","sentiment":"selling"}
"looking for a 75 cm red axis mast"
{"brand":"Axis","item":"mast","size":"75cm","year":null,"price":null,"currency":null,"condition":null,"sentiment":"wanted"}
"Looking for a 12m Duotone kite"
{"brand":"Duotone","item":"kite","size":"12m","year":null,"price":null,"currency":null,"condition":null,"sentiment":"wanted"}
"Kite Paradise in Curry Hammock"
{"brand":null,"item":null,"size":null,"year":null,"price":null,"currency":null,"condition":null,"sentiment":"info"}
"You need the holes or you're essentially water boarding yourself"
{"brand":null,"item":null,"size":null,"year":null,"price":null,"currency":null,"condition":null,"sentiment":"unrelated"}

"${text}"${mediaNote}
/no_think`;
}

// ─── Analyze ──────────────────────────────────────────────────────────────────

export async function analyzeMessage(text: string, mediaCount = 0): Promise<GearAnalysis> {
  const res = await fetch(LM_STUDIO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      "Authorization": `Bearer ${process.env.ORKEY ?? ""}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: buildUserPrompt(text, mediaCount) },
      ],
      temperature: 0.0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name:   'gear_analysis',
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM request failed with HTTP ${res.status}${body ? `: ${body}` : ''}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM response did not include message content');

  return JSON.parse(content) as GearAnalysis;
}

// ─── Batch runner ─────────────────────────────────────────────────────────────

export async function runBatchAnalysis(): Promise<void> {
  const listingThreads = await getUnanalyzedListingThreadsFromLastHour();
  console.log(`[analyzer] ${listingThreads.length} unanalyzed listing thread(s) in the last hour`);
  for (const thread of listingThreads) {
    try {
      const analysis = await analyzeMessage(thread.combinedText, thread.mediaCount);
      await updateListingThreadAnalysis(String(thread._id), analysis);
      await updateAnalysisForMessages(thread.messageIds, analysis);
      console.log(`[analyzer] thread ${thread._id} (${thread.messageIds.length} msg) → ${analysis.sentiment}`);
    } catch (err) {
      console.error(`[analyzer] thread ${thread._id} failed:`, (err as Error).message);
    }
  }
}
