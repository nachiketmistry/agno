import { describe, expect, test } from "bun:test";
import { unique } from "../support/normalize";
import { AUTH_UNAVAILABLE, auth } from "../support/target";

/** Service accounts mint `agno_pat_` tokens for machines. Needs the target with authorization on. */
describe.skipIf(AUTH_UNAVAILABLE)("service accounts", () => {
  const admin = async () => (await auth()).token({ scopes: ["agent_os:admin"] });

  test("a token is minted once, works for its scopes and stops working when revoked", async () => {
    const { call } = await auth();
    const name = unique("ci-bot");
    const created = await call("POST", "/service-accounts", {
      token: await admin(),
      json: { name, scopes: [{ scope: "agents:read" }] },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name,
      principal: `sa:${name}`,
      user_id: "user-1",
      created_by: "user-1",
      last_used_at: null,
      revoked_at: null,
      scopes: [
        {
          id: null,
          raw: "agents:read",
          namespace: "agents",
          sub_namespace: null,
          permission: "read",
          value: "allow",
        },
      ],
    });
    const token: string = created.body.token;
    expect(token).toStartWith("agno_pat_");
    expect(token).toStartWith(created.body.token_prefix);
    // 90 days by default.
    expect(created.body.expires_at - created.body.created_at).toBe(90 * 24 * 3600);

    const listed = await call("GET", "/service-accounts?limit=100", { token: await admin() });
    const row = listed.body.data.find((item: { id: string }) => item.id === created.body.id);
    expect(row.name).toBe(name);
    expect(row.token).toBeUndefined();

    expect((await call("GET", "/agents", { token })).status).toBe(200);
    const denied = await call("GET", "/company/products", { token });
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ detail: "Insufficient permissions. Required scope(s): products:read" });

    expect(
      (await call("DELETE", `/service-accounts/${created.body.id}`, { token: await admin() })).status,
    ).toBe(204);
    const revoked = await call("GET", "/agents", { token });
    expect(revoked.status).toBe(401);
    expect(revoked.body).toEqual({ detail: "Invalid or expired service account token" });
  });

  test("the default scopes are run and read", async () => {
    const { call } = await auth();
    const created = await call("POST", "/service-accounts", {
      token: await admin(),
      json: { name: unique("default") },
    });
    expect(created.status).toBe(201);
    expect(created.body.scopes.map((scope: { raw: string }) => scope.raw)).toEqual([
      "agents:run",
      "teams:run",
      "workflows:run",
      "sessions:read",
      "config:read",
    ]);
    await call("DELETE", `/service-accounts/${created.body.id}`, { token: await admin() });
  });

  test("names are lowercase slugs and unique among active accounts", async () => {
    const { call } = await auth();
    const bad = await call("POST", "/service-accounts", {
      token: await admin(),
      json: { name: "Bad Name!" },
    });
    expect(bad.status).toBe(422);
    expect(bad.body.detail[0].loc).toEqual(["body", "name"]);

    const name = unique("dup");
    const first = await call("POST", "/service-accounts", { token: await admin(), json: { name } });
    const second = await call("POST", "/service-accounts", { token: await admin(), json: { name } });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      detail: `An active service account named '${name}' already exists. Revoke it first to rotate.`,
    });
    await call("DELETE", `/service-accounts/${first.body.id}`, { token: await admin() });
  });

  test("privileged scopes need an explicit opt-in and deny rules are refused", async () => {
    const { call } = await auth();
    const privileged = await call("POST", "/service-accounts", {
      token: await admin(),
      json: { name: unique("priv"), scopes: [{ scope: "agent_os:admin" }] },
    });
    expect(privileged.status).toBe(400);
    expect(privileged.body.detail).toStartWith(
      "Privileged scope(s) require allow_privileged_scopes=true: agent_os:admin.",
    );

    const deny = await call("POST", "/service-accounts", {
      token: await admin(),
      json: { name: unique("deny"), scopes: [{ scope: "agents:read", effect: "deny" }] },
    });
    expect(deny.status).toBe(422);
    expect(deny.body.detail[0].msg).toContain("effect must be 'allow'");

    const bare = await call("POST", "/service-accounts", {
      token: await admin(),
      json: { name: unique("bare"), scopes: ["agents:read"] },
    });
    expect(bare.status).toBe(422);
  });
});
