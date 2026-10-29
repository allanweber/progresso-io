const MODEL = process.env.EXERCISEDB_LLM_MODEL || "anthropic/claude-sonnet-5.5";
const BASE = (process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");

export function requireKey() {
  const key = (process.env.LLM_API_KEY ?? "").trim();
  if (!key) throw new Error("LLM_API_KEY is not set (.env / .env.local)");
  return key;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in answer");
  return JSON.parse(text.slice(start, end + 1));
}

export async function askJson({ system, user, validate, attempts = 3 }) {
  const key = requireKey();
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0,
          max_tokens: 16000,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const body = await res.json();
      const answer = extractJson(body.choices?.[0]?.message?.content ?? "");
      validate(answer);
      return answer;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastError;
}

export async function inBatches(items, size, concurrency, run) {
  const batches = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const index = next++;
      await run(batches[index], index, batches.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
}

export { MODEL };
