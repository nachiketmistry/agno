import { beforeAll, describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { call } from "../support/target";

describe("CompanyOS sources, wiki and decisions", () => {
  let productId: string;

  beforeAll(async () => {
    productId = (await call("POST", "/company/products", { json: { name: unique("knowledge") } })).body?.id;
  });

  test("a website source is attached to a product", async () => {
    const source = await call("POST", "/company/sources", {
      json: { type: "website", reference: "https://example.com/docs", product_id: productId },
    });
    expect(source.status).toBe(201);
    expect(source.body).toMatchObject({
      product_id: productId,
      type: "website",
      reference: "https://example.com/docs",
      credential_ref: null,
      config: {},
      deleted_at: null,
    });
    const listed = await call("GET", `/company/sources?product_id=${productId}`);
    expect(listed.body.data.map((item: { id: string }) => item.id)).toContain(source.body.id);
  });

  test("a source type outside git, markdown and website is 422", async () => {
    const result = await call("POST", "/company/sources", {
      json: { type: "ftp", reference: "x", product_id: productId },
    });
    expect(result.status).toBe(422);
    expect(result.body.detail[0]).toMatchObject({
      type: "literal_error",
      msg: "Input should be 'git', 'markdown' or 'website'",
    });
  });

  test("a source can be archived and restored", async () => {
    const source = await call("POST", "/company/sources", {
      json: { type: "website", reference: "https://example.com/archive", product_id: productId },
    });
    expect((await call("DELETE", `/company/sources/${source.body.id}`)).status).toBe(204);
    const listed = await call("GET", `/company/sources?product_id=${productId}`);
    expect(listed.body.data.map((item: { id: string }) => item.id)).not.toContain(source.body.id);
    const restored = await call("POST", `/company/sources/${source.body.id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.deleted_at).toBeNull();
  });

  test("a new product has a brief and a status page in its wiki", async () => {
    const wiki = await call("GET", `/company/products/${productId}/wiki`);
    expect(wiki.status).toBe(200);
    expect(wiki.body.data.map((page: { path: string }) => page.path).sort()).toEqual([
      "brief.md",
      "status.md",
    ]);
    expect(wiki.body.data[0]).toMatchObject({ version: 1, user_id: null });
  });

  test("wiki writes are versioned and reject a stale version", async () => {
    const path = `/company/products/${productId}/wiki/notes/${unique("page")}.md`;
    const created = await call("PUT", path, { json: { content: "# A", expected_version: 0 } });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ size_bytes: 3, version: 1 });

    const stale = await call("PUT", path, { json: { content: "# B", expected_version: 0 } });
    expect(stale.status).toBe(409);

    const updated = await call("PUT", path, { json: { content: "# B", expected_version: 1 } });
    expect(updated.status).toBe(200);
    expect(updated.body.version).toBe(2);

    const read = await call("GET", path);
    expect(read.status).toBe(200);
    expect(read.body.content).toBe("# B");
    expect(read.body.metadata.version).toBe(2);
  });

  test("a missing wiki page is 404", async () => {
    const result = await call("GET", `/company/products/${productId}/wiki/nope.md`);
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ detail: "Wiki page not found" });
  });

  test("the company wiki has a shared brief", async () => {
    const list = await call("GET", "/company/wiki");
    expect(list.body.data.map((page: { path: string }) => page.path)).toContain("brief.md");
    const brief = await call("GET", "/company/wiki/brief.md");
    expect(brief.status).toBe(200);
    expect(brief.body.content).toBeString();
    expect(brief.body.metadata.path).toBe("brief.md");
  });

  test("a decision is recorded and listed", async () => {
    const decision = unique("Use R2 for uploads");
    const created = await call("POST", "/company/decisions", {
      json: { decision, reasoning: "Customers upload files" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      decision,
      reasoning: "Customers upload files",
      context: null,
      outcome: null,
    });
    expect(created.body.id).toBeString();
    const listed = await call("GET", "/company/decisions?limit=100");
    expect(listed.body.data.map((item: { id: string }) => item.id)).toContain(created.body.id);
  });

  test("a decision needs its text", async () => {
    const result = await call("POST", "/company/decisions", { json: { reasoning: "no decision" } });
    expect(result.status).toBe(422);
    expect(result.body.detail[0].loc).toEqual(["body", "decision"]);
  });
});
