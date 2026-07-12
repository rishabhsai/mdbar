import { DurableObject } from "cloudflare:workers";
import type {
  ChangesResponse,
  CreateSpaceResponse,
  NoteResponse,
  PutNoteRequest,
} from "./protocol";

interface Env {
  SYNC_SPACES: DurableObjectNamespace<SyncSpace>;
  MDBAR_ADMIN_SECRET: string;
  ALLOWED_ORIGIN?: string;
}

const encoder = new TextEncoder();

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });
}

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : null;
}

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(left: string | null, right: string | undefined): boolean {
  if (!left || !right) return false;
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a[index] ^ b[index];
  return mismatch === 0;
}

function cors(request: Request, env: Env): HeadersInit {
  const origin = env.ALLOWED_ORIGIN === "*"
    ? "*"
    : request.headers.get("origin") === env.ALLOWED_ORIGIN
      ? env.ALLOWED_ORIGIN
      : "null";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,PUT,DELETE,POST,OPTIONS",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const headers = cors(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/health") return json({ ok: true }, 200, headers);

    if (url.pathname === "/v1/spaces" && request.method === "POST") {
      if (!safeEqual(bearer(request), env.MDBAR_ADMIN_SECRET)) {
        return json({ error: "unauthorized" }, 401, headers);
      }
      const id = env.SYNC_SPACES.newUniqueId();
      const token = randomSecret();
      const stub = env.SYNC_SPACES.get(id);
      const initialized = await stub.fetch("https://space.internal/bootstrap", {
        method: "POST",
        body: JSON.stringify({ tokenHash: await digest(token) }),
      });
      if (!initialized.ok) return json({ error: "space_initialization_failed" }, 500, headers);
      return json({ spaceId: id.toString(), token } satisfies CreateSpaceResponse, 201, headers);
    }

    const match = url.pathname.match(/^\/v1\/spaces\/([a-f0-9]{64})(\/.*)?$/);
    if (!match) return json({ error: "not_found" }, 404, headers);

    let id: DurableObjectId;
    try {
      id = env.SYNC_SPACES.idFromString(match[1]);
    } catch {
      return json({ error: "invalid_space" }, 400, headers);
    }
    const forwardedURL = new URL(request.url);
    forwardedURL.pathname = match[2] || "/";
    const response = await env.SYNC_SPACES.get(id).fetch(new Request(forwardedURL, request));
    const outgoing = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) outgoing.set(key, value);
    return new Response(response.body, { status: response.status, headers: outgoing });
  },
} satisfies ExportedHandler<Env>;

interface NoteRow {
  [key: string]: SqlStorageValue;
  path: string;
  content: string;
  revision: number;
  modified_at: string;
  deleted: number;
}

interface ChangeRow extends NoteRow {
  sequence: number;
}

export class SyncSpace extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS notes (
        path TEXT PRIMARY KEY,
        content TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL,
        modified_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS changes (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        revision INTEGER NOT NULL,
        modified_at TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS idempotency (
        key TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS changes_sequence ON changes(sequence);
    `);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/bootstrap" && request.method === "POST") return this.bootstrap(request);
    if (!(await this.authorized(request))) return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/changes" && request.method === "GET") return this.changes(url);
    if (url.pathname === "/today" && request.method === "GET") return this.today(url);

    const noteMatch = url.pathname.match(/^\/notes\/(.+)$/);
    if (!noteMatch) return json({ error: "not_found" }, 404);
    let path: string;
    try {
      path = decodeURIComponent(noteMatch[1]);
    } catch {
      return json({ error: "invalid_path" }, 400);
    }
    if (!this.validPath(path)) return json({ error: "invalid_path" }, 400);
    if (request.method === "GET") return this.getNote(path);
    if (request.method === "PUT") return this.putNote(path, request);
    if (request.method === "DELETE") return this.deleteNote(path, request);
    return json({ error: "method_not_allowed" }, 405);
  }

  private async bootstrap(request: Request): Promise<Response> {
    const existing = [...this.ctx.storage.sql.exec<{ value: string }>(
      "SELECT value FROM metadata WHERE key = 'token_hash'",
    )][0];
    if (existing) return json({ error: "already_initialized" }, 409);
    const body = await request.json<{ tokenHash?: string }>();
    if (!body.tokenHash?.match(/^[a-f0-9]{64}$/)) return json({ error: "invalid_token_hash" }, 400);
    this.ctx.storage.sql.exec(
      "INSERT INTO metadata (key, value) VALUES ('token_hash', ?)",
      body.tokenHash,
    );
    return json({ ok: true }, 201);
  }

  private async authorized(request: Request): Promise<boolean> {
    const token = bearer(request);
    if (!token) return false;
    const row = [...this.ctx.storage.sql.exec<{ value: string }>(
      "SELECT value FROM metadata WHERE key = 'token_hash'",
    )][0];
    return !!row && safeEqual(await digest(token), row.value);
  }

  private changes(url: URL): Response {
    const rawCursor = Number(url.searchParams.get("since") ?? "0");
    const cursor = Number.isSafeInteger(rawCursor) && rawCursor >= 0 ? rawCursor : 0;
    const rows = [...this.ctx.storage.sql.exec<ChangeRow>(
      `SELECT sequence, path, content, revision, modified_at, deleted
       FROM changes WHERE sequence > ? ORDER BY sequence ASC LIMIT 1000`,
      cursor,
    )];
    const newest = rows.at(-1)?.sequence ?? cursor;
    const changes = rows.map((row) => this.change(row));
    return json({ cursor: newest, changes } satisfies ChangesResponse);
  }

  private today(url: URL): Response {
    const date = url.searchParams.get("date");
    if (!date?.match(/^\d{4}-\d{2}-\d{2}$/)) return json({ error: "invalid_date" }, 400);
    return this.getNote(`daily/${date}.md`);
  }

  private getNote(path: string): Response {
    const row = this.note(path);
    if (!row || row.deleted) return json({ error: "not_found" }, 404);
    return json(this.response(row));
  }

  private async putNote(path: string, request: Request): Promise<Response> {
    const body = await request.json<Partial<PutNoteRequest>>();
    if (!this.validWrite(body)) return json({ error: "invalid_body" }, 400);
    const duplicate = this.idempotent(body.idempotencyKey);
    if (duplicate) return json(duplicate);
    const current = this.note(path);
    const currentRevision = current?.revision ?? 0;
    if (body.baseRevision !== currentRevision) {
      return json({ error: "revision_conflict", current: current ? this.response(current) : null }, 409);
    }
    const revision = currentRevision + 1;
    const result: NoteResponse = {
      path,
      revision,
      modifiedAt: body.modifiedAt,
      deleted: false,
      content: body.content,
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO notes (path, content, revision, modified_at, deleted) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(path) DO UPDATE SET content = excluded.content, revision = excluded.revision,
         modified_at = excluded.modified_at, deleted = 0`,
        path, body.content, revision, body.modifiedAt,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO changes (path, content, revision, modified_at, deleted) VALUES (?, ?, ?, ?, 0)",
        path, body.content, revision, body.modifiedAt,
      );
      this.remember(body.idempotencyKey, result);
    });
    return json(result);
  }

  private async deleteNote(path: string, request: Request): Promise<Response> {
    const body = await request.json<{ baseRevision?: number; idempotencyKey?: string; modifiedAt?: string }>();
    if (!Number.isSafeInteger(body.baseRevision) || !body.idempotencyKey || !body.modifiedAt) {
      return json({ error: "invalid_body" }, 400);
    }
    const idempotencyKey = body.idempotencyKey;
    const modifiedAt = body.modifiedAt;
    const duplicate = this.idempotent(idempotencyKey);
    if (duplicate) return json(duplicate);
    const current = this.note(path);
    const currentRevision = current?.revision ?? 0;
    if (body.baseRevision !== currentRevision) {
      return json({ error: "revision_conflict", current: current ? this.response(current) : null }, 409);
    }
    const result: NoteResponse = {
      path,
      revision: currentRevision + 1,
      modifiedAt,
      deleted: true,
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO notes (path, content, revision, modified_at, deleted) VALUES (?, '', ?, ?, 1)
         ON CONFLICT(path) DO UPDATE SET content = '', revision = excluded.revision,
         modified_at = excluded.modified_at, deleted = 1`,
        path, result.revision, modifiedAt,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO changes (path, content, revision, modified_at, deleted) VALUES (?, '', ?, ?, 1)",
        path, result.revision, modifiedAt,
      );
      this.remember(idempotencyKey, result);
    });
    return json(result);
  }

  private validWrite(body: Partial<PutNoteRequest>): body is PutNoteRequest {
    return Number.isSafeInteger(body.baseRevision)
      && typeof body.content === "string"
      && body.content.length <= 2_000_000
      && typeof body.modifiedAt === "string"
      && !Number.isNaN(Date.parse(body.modifiedAt))
      && typeof body.idempotencyKey === "string"
      && body.idempotencyKey.length >= 16
      && body.idempotencyKey.length <= 128;
  }

  private validPath(path: string): boolean {
    return path.length <= 512
      && !path.startsWith("/")
      && !path.includes("..")
      && path.endsWith(".md")
      && (path.startsWith("daily/") || path.startsWith("notes/"));
  }

  private note(path: string): NoteRow | undefined {
    return [...this.ctx.storage.sql.exec<NoteRow>(
      "SELECT path, content, revision, modified_at, deleted FROM notes WHERE path = ?",
      path,
    )][0];
  }

  private response(row: NoteRow): NoteResponse {
    return {
      path: row.path,
      revision: row.revision,
      modifiedAt: row.modified_at,
      deleted: !!row.deleted,
      ...(row.deleted ? {} : { content: row.content }),
    };
  }

  private change(row: ChangeRow) {
    return {
      sequence: row.sequence,
      ...this.response(row),
    };
  }

  private idempotent(key: string): NoteResponse | null {
    const row = [...this.ctx.storage.sql.exec<{ response: string }>(
      "SELECT response FROM idempotency WHERE key = ?",
      key,
    )][0];
    return row ? JSON.parse(row.response) as NoteResponse : null;
  }

  private remember(key: string, response: NoteResponse): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO idempotency (key, response, created_at) VALUES (?, ?, ?)",
      key, JSON.stringify(response), new Date().toISOString(),
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM idempotency WHERE created_at < ?",
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }
}
