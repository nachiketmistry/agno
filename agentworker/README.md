# AgentWorker

A TypeScript implementation of the Agno AgentOS API, built to run on Cloudflare and anywhere else Bun or Node runs. This workspace is the starting point: the API contract exported from the Python AgentOS, the test suites that specify the behaviour, and a server skeleton that fails them.

It lives in `agentworker/` inside the agno fork so it can be read next to the Python code it mirrors. Nothing here imports from the Python tree at run time, so the directory can be moved to its own repository as is.

## Where things stand

`bun run status` prints the current numbers. At the first commit:

| Suite | Passing on the TypeScript app | Passing on the Python reference |
| --- | --- | --- |
| Contract unit | 8 of 8 | n/a |
| Core unit | 49 of 176 | n/a (each expectation was checked against the Python functions) |
| Server unit | 6 of 6 | n/a |
| Conformance (HTTP contract) | 16 of 674 | 674 of 674 |
| Behaviour (HTTP scenarios) | 0 of 76 | 76 of 76 |

The TypeScript server answers `/health`, handles CORS the way the Python AgentOS does, and routes every other operation in the contract to a `501` that names the operation. The work is to make the failing tests pass.

## Layout

```
packages/contract   openapi.json, scope mappings and recorded responses from the Python AgentOS
packages/core       portable logic: scopes, JWT, service accounts, SSE, cron, CompanyOS rules, adapter ports
packages/server     the HTTP app (Hono), no platform code
apps/local          Bun server on http://localhost:7777
apps/cloudflare     Worker entry and wrangler config (skeleton)
tests/conformance   one test per contract operation, recorded responses, CORS, errors, schemas, JWT and scopes
tests/behavior      scenarios: CompanyOS, schedules, workflow runs and SSE, sessions, memories, components
reference/python    the reference AgentOS and the scripts that export the contract from it
```

`packages/core/src/ports.ts` holds the eight adapter interfaces (state, scheduler, durable steps, event stream, queue, blobs, vectors, sandbox). The core and the server depend only on those, which is what lets the same agents run on Cloudflare, Railway or Kubernetes.

## Commands

```bash
bun install
bun run dev            # the local server on :7777
bun run test           # every suite
bun run test:unit      # contract, core and server unit tests
bun run test:conformance
bun run test:behavior
bun run status         # pass counts per suite
bun run typecheck
bun run lint           # biome
bun run format
```

## How the tests are kept honest

The HTTP suites send requests through `tests/support/target.ts`. With no environment set they call the TypeScript app in process. With `AGENTWORKER_BASE_URL` set they call that server instead, so the same tests run against the Python AgentOS. A test is only accepted into the suite when it passes there.

```bash
# 1. A Python environment with the reference dependencies
python -m venv .venv-ref && .venv-ref/bin/pip install -e "../libs/agno[os,sqlite,openai,mcp]"

# 2. Keys for the JWT tests, then two reference servers: one open, one with authorization on
bun run reference:keys
PORT=7777 .venv-ref/bin/python reference/python/reference_os.py &
PORT=7778 JWT_VERIFICATION_KEY="$(cat .keys/public.pem)" .venv-ref/bin/python reference/python/reference_os.py &

# 3. Run the suites against them
AGENTWORKER_BASE_URL=http://127.0.0.1:7777 AGENTWORKER_AUTH_BASE_URL=http://127.0.0.1:7778 bun run --cwd tests test
```

The unit tests in `packages/core/test` are ports of the Python unit tests plus cases checked by `reference/python/verify_unit_expectations.py`, which calls the Python functions with the same inputs.

When the Python AgentOS changes, refresh the contract:

```bash
PYTHON=$PWD/.venv-ref/bin/python bun run contract:export     # openapi.json, scope mappings, recorded responses
AGENTWORKER_BASE_URL=... AGENTWORKER_AUTH_BASE_URL=... bun run contract:probes   # per-operation probes
```

## Coverage

Three guards, each of which fails the build when it slips:

1. **Every API operation.** `tests/conformance/operations.test.ts` and `auth.test.ts` generate three tests for each of the 195 operations in `openapi.json`: it answers a bare request the way the reference does, it is `401` without a token, and a token with no scopes gets the reference's answer. A test asserts the recorded probes cover the whole contract, so a new upstream operation cannot go untested.
2. **Success paths.** `bun run coverage` reads a log of the requests the suites made against the reference and writes `tests/COVERAGE.md`. Every operation must either have a test that got a 2xx from it, or an entry in `tests/coverage-exemptions.json` saying what the reference OS needs before it can be tested. Today 136 operations have a success-path test and 59 are exempt, most of them because agent and team runs need a model stub.
3. **Every core export.** `packages/core/test/exports.test.ts` fails when an export of the core is not named in a unit test. `bun test --coverage` in `packages/core` reports line coverage.

```bash
AGENTWORKER_COVERAGE_FILE=/tmp/requests.log AGENTWORKER_BASE_URL=... AGENTWORKER_AUTH_BASE_URL=... bun run --cwd tests test
AGENTWORKER_COVERAGE_FILE=/tmp/requests.log bun run coverage
```

## Connecting os.agno.com to localhost

The control plane is a browser app, so it reaches a local AgentOS directly from the browser. Run `bun run dev`, then add `http://localhost:7777` as an OS in os.agno.com. What it needs, in the order the tests cover it:

1. CORS for `https://os.agno.com` with credentials (done).
2. `/health`, `/info` and `/config` (health is done; the recorded responses in `packages/contract/fixtures` are the target for the other two).
3. Agents, teams, workflows, sessions and runs with SSE.
4. JWT verification with the key the control plane issues, and scopes.

## Known gaps

- Agent and team runs are not specified yet beyond routing, auth and error shapes. They need a fake model endpoint so runs are deterministic on both servers. This is the next piece of the test harness.
- The reference OS has no knowledge base, durable queue, media storage, tracing or agent filesystem, so those operations have contract tests only. `tests/COVERAGE.md` lists each one.
- The Python AgentOS does not check the JWT `aud` claim unless the OS opts in. The tests record that default.
