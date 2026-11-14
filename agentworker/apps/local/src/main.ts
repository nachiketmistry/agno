import { createReferenceApp } from "@agentworker/server";

// 7777 is the AgentOS default port, so the control plane's "local" endpoint works unchanged.
const port = Number(process.env.PORT ?? 7777);
const keys = process.env.JWT_VERIFICATION_KEY ? [process.env.JWT_VERIFICATION_KEY] : undefined;
const app = createReferenceApp({ jwtVerificationKeys: keys });

Bun.serve({ port, fetch: app.fetch, idleTimeout: 255 });
console.log(`AgentWorker listening on http://localhost:${port}`);
