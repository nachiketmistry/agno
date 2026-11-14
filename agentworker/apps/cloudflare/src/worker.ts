import { createReferenceApp } from "@agentworker/server";

interface Env {
  JWT_VERIFICATION_KEY?: string;
}

// Skeleton entry. The Durable Object, Workflow, Queue and R2 adapters attach here
// once the ports in @agentworker/core have Cloudflare implementations.
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const app = createReferenceApp({
      jwtVerificationKeys: env.JWT_VERIFICATION_KEY ? [env.JWT_VERIFICATION_KEY] : undefined,
    });
    return app.fetch(request);
  },
};
