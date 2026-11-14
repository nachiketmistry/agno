"""Checks that the expectations in packages/core/test match the Python AgentOS.

Run with the reference environment: python agentworker/reference/python/verify_unit_expectations.py
Every line should start with OK; a MISMATCH means a TypeScript unit test asserts something upstream does not do.
"""

from agno.os.scopes import *

m = get_default_scope_mappings(company=True)


def chk(name, got, want):
    print(
        "OK " if got == want else "MISMATCH",
        name,
        "" if got == want else f"got={got!r} want={want!r}",
    )


p = parse_scope("agent_os:admin", "root:all")
chk(
    "custom admin",
    (p.scope_type, p.resource, p.action),
    ("global", "agent_os", "admin"),
)
chk("root admin", parse_scope("root:all", "root:all").scope_type, "admin")
chk(
    "sys per",
    (parse_scope("system:x:read").resource, parse_scope("system:x:read").resource_id),
    ("config", "x"),
)
chk("abcd", parse_scope("a:b:c:d").scope_type, "unknown")
chk("split fold", split_scope("agents:a:b:run"), ("agents", "a:b", "run"))
chk("split bad", split_scope("nonsense"), ("nonsense", None, "unknown"))
H = has_required_scopes
chk("h1", H([], []), True)
chk("h2", H(["system:read"], ["config:read"]), True)
chk("h3", H(["system:read"], ["agents:read"]), False)
chk("h4", H(["config:read"], ["registry:read"]), False)
chk("h5", H(["agent_os:admin"], ["agents:write", "sessions:delete"]), True)
chk("h6", H(["agents:read"], ["agents:read", "sessions:read"]), False)
chk(
    "h7",
    H(["agents:web:run"], ["agents:run"], resource_type="agents", resource_id="web"),
    True,
)
chk(
    "h8",
    H(["agents:web:run"], ["agents:run"], resource_type="agents", resource_id="other"),
    False,
)
chk(
    "h9",
    H(["agents:*:run"], ["agents:run"], resource_type="agents", resource_id="any"),
    True,
)
chk(
    "h10",
    H(["agents:run"], ["agents:run"], resource_type="agents", resource_id="any"),
    True,
)
chk(
    "h11",
    H(
        ["agents:web:read"],
        ["sessions:read"],
        resource_type="agents",
        resource_id="web",
    ),
    False,
)
A = get_accessible_resource_ids
chk("a1", A(["agents:a1:read", "agents:a2:read"], "agents"), {"a1", "a2"})
chk("a2", A(["agents:*:read"], "agents"), {"*"})
chk("a3", A(["agents:read"], "agents"), {"*"})
chk("a4", A(["agent_os:admin"], "agents"), {"*"})
chk("a5", A(["agents:a1:read"], "agents", action="run"), set())
chk("a6", A(["teams:t1:read"], "agents"), set())
R = lambda me, pa: get_required_scopes_for_route(m, me, pa)
chk("r1", R("GET", "/config"), ["config:read"])
chk("r2", R("POST", "/databases/abc/migrate"), ["config:write"])
chk("r3", R("GET", "/registry"), ["registry:read"])
chk("r4", R("DELETE", "/learnings/users/priti@agno.com"), ["learnings:delete"])
chk("r5", R("DELETE", "/company/products/p1"), ["products:delete"])
chk("r6", R("GET", "/totally/unmapped"), [])
chk("r7", get_required_scopes_for_route({"GET /x": ["a:read"]}, "POST", "/x"), [])
chk(
    "r8",
    get_required_scopes_for_route({"GET /x/{id}": ["a:read"]}, "GET", "/x/1"),
    ["a:read"],
)
chk("ctx a2a", get_resource_context_from_path("/a2a/agents/a1"), ("agents", "a1"))
chk(
    "admin route",
    check_route_scopes(["agent_os:admin"], m, "DELETE", "/company/routines/r1").allowed,
    True,
)
for args, want in [
    ((["agents:a1:read"], m, "GET", "/agents"), True),
    ((["agents:a1:read"], m, "POST", "/agents"), False),
    ((["agents:write"], m, "POST", "/agents"), True),
]:
    chk("crs", check_route_scopes(*args).allowed, want)
from agno.os.middleware.jwt import is_reserved_principal

chk("res1", is_reserved_principal("sa:ci-bot"), True)
chk("res2", is_reserved_principal("user-1"), False)
chk("res3", is_reserved_principal(None), False)
from agno.os.service_accounts import SERVICE_ACCOUNT_NAME_PATTERN as P
from agno.os.service_accounts import generate_token

for n, w in [
    ("ci-bot", True),
    ("a", True),
    ("bot_2", True),
    ("0day", True),
    ("", False),
    ("Upper", False),
    ("sa:evil", False),
    ("_internal", False),
    ("me@agno.com", False),
    ("a.b", False),
    ("x\n", False),
    ("a" * 64, False),
]:
    chk("name " + repr(n), bool(P.match(n)), w)
t = generate_token()
print("token", t[0][:14], len(t[0]), t[2])
from agno.scheduler.cron import compute_next_run, validate_cron_expr, validate_timezone

for e, w in [
    ("0 * * * *", True),
    ("0 9 * * 1", True),
    ("*/15 * * * *", True),
    ("0 0 1 1 *", True),
    ("nope", False),
    ("* * * *", False),
    ("61 * * * *", False),
    ("0 25 * * *", False),
]:
    chk("cron " + repr(e), validate_cron_expr(e), w)
chk(
    "tz",
    (
        validate_timezone("UTC"),
        validate_timezone("America/Los_Angeles"),
        validate_timezone("Mars/Olympus"),
    ),
    (True, True, False),
)
import inspect

print(inspect.signature(compute_next_run))
from agno.company.declarations import AutoAccept, Routine

chk(
    "aa default",
    AutoAccept().model_dump(),
    {
        "default_executor": "miniagent",
        "executors": None,
        "source_ids": None,
        "work_scope": None,
        "required_checks": ["executor_registered"],
        "limits": None,
        "complete_projects": False,
        "approve_projects": True,
        "max_open": 5,
    },
)


def raises(f):
    try:
        f()
        return None
    except Exception as e:  # noqa: BLE001 - the check reports whatever the call raised
        return str(e)[:160].replace("\n", " | ")


print("aa surprise:", raises(lambda: AutoAccept(surprise=1)))
print("aa max_open:", raises(lambda: AutoAccept(max_open=0)))
print("aa checks:", raises(lambda: AutoAccept(required_checks=[])))
a = AutoAccept.model_validate({"executor_type": "workflow", "executor_id": "draft"})
chk(
    "aa legacy",
    (a.default_executor, a.executors, a.approve_projects),
    ("draft", ["draft"], False),
)
print(
    "aa one field:", raises(lambda: AutoAccept.model_validate({"executor_id": "draft"}))
)
print(
    "aa disagree:",
    raises(
        lambda: AutoAccept.model_validate(
            {"executor_type": "agent", "executor_id": "a", "default_executor": "b"}
        )
    ),
)
print(
    "aa limits:",
    raises(lambda: AutoAccept.model_validate({"limits": {"max_acceptances": 3}})),
)
chk(
    "routine default",
    Routine(name="Weekly summary", instructions="Summarize the week").model_dump(),
    {
        "name": "Weekly summary",
        "template": None,
        "executor_type": "agent",
        "executor_id": "miniagent",
        "cron_expr": None,
        "timezone": "UTC",
        "enabled": True,
        "instructions": "Summarize the week",
        "auto_accept": False,
    },
)
for label, kw in [
    ("blank", {"name": "x", "template": "intake", "instructions": "  "}),
    ("tz", {"name": "x", "instructions": "do", "timezone": "Mars/Olympus"}),
    ("exec", {"name": "x", "instructions": "do", "executor_id": "draft"}),
    ("empty", {"name": "", "instructions": "do"}),
    ("long", {"name": "n" * 256, "instructions": "do"}),
    ("extra", {"name": "x", "instructions": "do", "extra": True}),
]:
    print("routine", label, ":", raises(lambda kw=kw: Routine(**kw)))
chk("routine tmpl", Routine(name="Intake", template="intake").template, "intake")
chk(
    "routine aa",
    Routine(name="x", template="intake", auto_accept=True).auto_accept.max_open,
    5,
)
from agno.db.schemas.tasks import task_transition_blocker as B

bk = {"status": "backlog", "transitions": []}
ac = {
    "status": "ready",
    "executor_type": "agent",
    "executor_id": "miniagent",
    "transitions": [],
}
chk("b1", B(bk, "in_progress"), "Only accepted work can be started")
chk("b2", B(ac, "in_progress"), None)
chk(
    "b3",
    B({**ac, "executor_type": None}, "in_progress"),
    "Select a registered agent, team or workflow executor",
)
chk(
    "b4",
    B({**ac, "status": "in_review"}, "in_progress"),
    "A revision requires a previous Task attempt",
)
chk("b5", B(bk, "in_review"), "Review requires a previous Task attempt")
chk("b6", B(bk, "done"), "Completion requires a previous Task attempt")
at = {"status": "ready", "transitions": [{"attempt": 1}]}
chk("b7", (B(at, "in_review"), B(at, "done")), (None, None))
chk("b8", B({"status": "in_progress"}, "in_review"), None)
chk("b9", B(bk, "backlog"), "Invalid task transition from backlog to backlog")
chk(
    "b10",
    B({"status": "in_progress", "job_id": "j1"}, "ready", True),
    "Cancel the run with POST /company/runs/j1/cancel to leave In progress",
)
d = {"status": "done", "transitions": [{"attempt": 1}]}
chk("b11", (B(d, "cancelled"), B(d, "backlog")), (None, None))
