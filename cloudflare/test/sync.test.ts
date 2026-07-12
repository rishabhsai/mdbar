import { SELF, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => reset());

async function createSpace() {
  const response = await SELF.fetch("https://mdbar.test/v1/spaces", {
    method: "POST",
    headers: { authorization: "Bearer test-admin-secret" },
  });
  expect(response.status).toBe(201);
  return response.json<{ spaceId: string; token: string }>();
}

describe("mdbar sync protocol", () => {
  it("creates a private space and synchronizes a note", async () => {
    const { spaceId, token } = await createSpace();
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const noteURL = `https://mdbar.test/v1/spaces/${spaceId}/notes/daily/2026-07-11.md`;
    const write = await SELF.fetch(noteURL, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        baseRevision: 0,
        content: "- [ ] Test sync #carry",
        modifiedAt: "2026-07-11T18:00:00Z",
        idempotencyKey: "write-integration-0001",
      }),
    });
    expect(write.status).toBe(200);
    expect(await write.json()).toMatchObject({ revision: 1, deleted: false });

    const today = await SELF.fetch(
      `https://mdbar.test/v1/spaces/${spaceId}/today?date=2026-07-11`,
      { headers },
    );
    expect(await today.json()).toMatchObject({ content: "- [ ] Test sync #carry" });

    const changes = await SELF.fetch(
      `https://mdbar.test/v1/spaces/${spaceId}/changes?since=0`,
      { headers },
    );
    expect(await changes.json()).toMatchObject({
      cursor: 1,
      changes: [{ path: "daily/2026-07-11.md", revision: 1 }],
    });
  });

  it("makes retries idempotent and rejects stale revisions", async () => {
    const { spaceId, token } = await createSpace();
    const url = `https://mdbar.test/v1/spaces/${spaceId}/notes/notes/idea.md`;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    const body = JSON.stringify({
      baseRevision: 0,
      content: "First",
      modifiedAt: "2026-07-11T18:00:00Z",
      idempotencyKey: "idempotent-write-0001",
    });
    const first = await SELF.fetch(url, { method: "PUT", headers, body });
    const retry = await SELF.fetch(url, { method: "PUT", headers, body });
    expect(await first.json()).toMatchObject({ revision: 1 });
    expect(await retry.json()).toMatchObject({ revision: 1 });

    const conflict = await SELF.fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        baseRevision: 0,
        content: "Stale",
        modifiedAt: "2026-07-11T18:01:00Z",
        idempotencyKey: "stale-write-0000001",
      }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({
      error: "revision_conflict",
      current: { revision: 1, content: "First" },
    });
  });

  it("authenticates reads and records deletion tombstones", async () => {
    const { spaceId, token } = await createSpace();
    const url = `https://mdbar.test/v1/spaces/${spaceId}/notes/notes/private.md`;
    expect((await SELF.fetch(url)).status).toBe(401);
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    await SELF.fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        baseRevision: 0,
        content: "Private",
        modifiedAt: "2026-07-11T18:00:00Z",
        idempotencyKey: "private-write-000001",
      }),
    });
    const deleted = await SELF.fetch(url, {
      method: "DELETE",
      headers,
      body: JSON.stringify({
        baseRevision: 1,
        modifiedAt: "2026-07-11T18:02:00Z",
        idempotencyKey: "delete-write-000001",
      }),
    });
    expect(await deleted.json()).toMatchObject({ revision: 2, deleted: true });
    expect((await SELF.fetch(url, { headers })).status).toBe(404);
  });
});
