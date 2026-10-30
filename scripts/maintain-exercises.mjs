import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { z } from "zod";
import {
  addedImageFile,
  buildState,
  discardPending,
  loadOpenGymCatalog,
  newOpId,
  opInput,
  OPS_FILE,
  pendingChanges,
  PROPOSALS_FILE,
  readOps,
  recordOp,
  removeOp,
  writeOps,
} from "./lib/exercise-maintenance.mjs";
import { imageContentType, imageSourceUrl } from "./lib/exercise-image-sources.mjs";
import { readJson, slug } from "./lib/exercisedb-vocab.mjs";

const PORT = Number(process.env.PORT ?? 4319);
const PAGE = join(import.meta.dirname, "maintain-exercises.html");
const MAX_BODY = 20 * 1024 * 1024;

const openGym = loadOpenGymCatalog();
const openGymIds = new Set(openGym.map((c) => c.id));
const proposals = existsSync(PROPOSALS_FILE) ? readJson(PROPOSALS_FILE) : { same: {}, close: {} };
let ops = readOps();

function committedIds() {
  try {
    const text = execFileSync("git", ["show", `HEAD:${OPS_FILE.slice(process.cwd().length + 1)}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set((JSON.parse(text).ops ?? []).map((o) => o.id));
  } catch {
    return new Set();
  }
}

const snapshot = () => {
  const committed = committedIds();
  return {
    exercises: [...buildState(ops).values()],
    ops: ops.map((o) => ({ ...o, committed: committed.has(o.id) })),
  };
};

const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
};

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function checkOp(op, state) {
  const s = state.get(op.code);
  if (op.type === "create") return s ? "Código já existe." : null;
  if (!s) return "Exercício não encontrado.";
  if (op.type === "update" && op.fields.images) {
    if (op.fields.images.some((k) => !s.images.includes(k))) return "Imagem desconhecida.";
  }
  if (op.type === "link" && op.openGymId !== null) {
    if (!openGymIds.has(op.openGymId)) return "Exercício do openGym desconhecido.";
    if (s.archived) return "Exercício arquivado.";
  }
  if (op.type === "add-substitute") {
    const sub = state.get(op.substitute);
    if (!sub || sub.archived) return "Substituto não encontrado.";
    if (sub.code === op.code) return "Um exercício não substitui a si mesmo.";
  }
  return null;
}

function newCode(name, state) {
  const base = `custom-${slug(name)}`;
  let code = base;
  for (let i = 2; state.has(code); i++) code = `${base}-${i}`;
  return code;
}

function record(input) {
  const state = buildState(ops);
  if (input?.type === "create" && input.fields?.name) input.code = newCode(input.fields.name, state);
  const parsed = opInput.safeParse(input);
  if (!parsed.success) {
    return { status: 422, body: { error: "Dados inválidos.", issues: parsed.error.issues } };
  }
  const error = checkOp(parsed.data, state);
  if (error) return { status: 409, body: { error } };
  ops = recordOp(ops, committedIds(), { id: newOpId(), at: new Date().toISOString(), ...parsed.data });
  writeOps(ops);
  return { status: 200, body: { ...snapshot(), code: parsed.data.code } };
}

const bulkArchive = z.object({ codes: z.array(z.string().min(1).max(120)).min(1).max(5000) });

function archiveAll(body) {
  const parsed = bulkArchive.safeParse(body);
  if (!parsed.success) return { status: 422, body: { error: "Lista inválida." } };
  const state = buildState(ops);
  const codes = [...new Set(parsed.data.codes)];
  const missing = codes.find((c) => !state.has(c));
  if (missing) return { status: 404, body: { error: `Exercício não encontrado: ${missing}` } };
  const committed = committedIds();
  const at = new Date().toISOString();
  for (const code of codes.filter((c) => !state.get(c).archived)) {
    ops = recordOp(ops, committed, { id: newOpId(), at, type: "archive", code });
  }
  writeOps(ops);
  return { status: 200, body: snapshot() };
}

const imageUpload = z.object({
  code: z.string().min(1).max(120),
  data: z.string().min(1),
  credit: z
    .object({
      author: z.string().trim().max(200),
      license: z.string().trim().max(100),
      licenseUrl: z.string().trim().max(500).default(""),
      sourceUrl: z.string().trim().max(500).default(""),
      aiGenerated: z.boolean().default(false),
    })
    .nullable(),
});

async function addImage(body) {
  const parsed = imageUpload.safeParse(body);
  if (!parsed.success) return { status: 422, body: { error: "Imagem inválida." } };
  const { code, data, credit } = parsed.data;
  if (!buildState(ops).has(code)) return { status: 404, body: { error: "Exercício não encontrado." } };
  let webp;
  try {
    webp = await sharp(Buffer.from(data.replace(/^data:[^,]+,/, ""), "base64"))
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return { status: 422, body: { error: "Não foi possível ler a imagem." } };
  }
  const key = `added/${slug(code).replace(/_/g, "-")}/${newOpId()}.webp`;
  const file = addedImageFile(key);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, webp);
  const usable = credit && credit.author && credit.license ? credit : null;
  const result = record({ type: "add-image", code, key, credit: usable });
  if (result.status !== 200) rmSync(file, { force: true });
  return result;
}

function drop(next, removed) {
  ops = next;
  writeOps(ops);
  for (const op of removed) if (op.type === "add-image") rmSync(addedImageFile(op.key), { force: true });
  return { status: 200, body: snapshot() };
}

function deleteOp(id) {
  const result = removeOp(ops, committedIds(), id);
  if (!result.ok) return { status: 409, body: { error: result.error } };
  return drop(result.ops, result.removed);
}

function deletePending() {
  const result = discardPending(ops, committedIds());
  return drop(result.ops, result.removed);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(readFileSync(PAGE));
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/image/")) {
    const key = decodeURIComponent(url.pathname.slice("/image/".length));
    if (key.startsWith("added/")) {
      const file = addedImageFile(key);
      if (!file.startsWith(addedImageFile("added/")) || !existsSync(file)) {
        send(res, 404, { error: "Imagem não encontrada." });
        return;
      }
      res.writeHead(200, { "content-type": imageContentType(key) });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(302, { location: imageSourceUrl(key) });
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/data") {
    send(res, 200, { ...snapshot(), openGym, proposals });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/ops") {
    const result = record(await readBody(req));
    send(res, result.status, result.body);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/archive") {
    const result = archiveAll(await readBody(req));
    send(res, result.status, result.body);
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/images") {
    const result = await addImage(await readBody(req));
    send(res, result.status, result.body);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/pending") {
    send(res, 200, { changes: pendingChanges(ops, committedIds()) });
    return;
  }
  if (req.method === "DELETE" && url.pathname === "/api/ops") {
    const result = deletePending();
    send(res, result.status, result.body);
    return;
  }
  const opMatch = url.pathname.match(/^\/api\/ops\/([a-z0-9-]+)$/);
  if (req.method === "DELETE" && opMatch) {
    const result = deleteOp(opMatch[1]);
    send(res, result.status, result.body);
    return;
  }
  send(res, 404, { error: "Não encontrado." });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Exercise maintenance: http://localhost:${PORT}`);
  console.log(`  ${ops.length} operations · saving to drizzle/data/exercise-maintenance.json`);
});
