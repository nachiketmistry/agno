"""Export openapi.json and recorded fixtures from the reference AgentOS."""

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent))
from reference_os import build_agent_os

OUT = Path(__file__).resolve().parents[2] / "packages" / "contract"


def record(client: TestClient, method: str, path: str, **kwargs):
    response = client.request(method, path, **kwargs)
    try:
        body = response.json()
    except ValueError:
        body = response.text
    headers = {
        key: value
        for key, value in response.headers.items()
        if key.lower().startswith("access-control")
        or key.lower() in ("content-type", "vary")
    }
    return {
        "request": {
            "method": method,
            "path": path,
            **{k: v for k, v in kwargs.items() if k in ("json", "headers")},
        },
        "status": response.status_code,
        "headers": headers,
        "body": body,
    }


def main() -> None:
    agent_os = build_agent_os()
    app = agent_os.get_app()
    (OUT / "fixtures").mkdir(parents=True, exist_ok=True)
    (OUT / "openapi.json").write_text(
        json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
    )
    from agno.os.scopes import get_default_scope_mappings

    (OUT / "scope-mappings.json").write_text(
        json.dumps(get_default_scope_mappings(company=True), indent=2, sort_keys=True)
        + "\n"
    )
    fixtures = {}
    with TestClient(app) as client:
        fixtures["health"] = record(client, "GET", "/health")
        fixtures["home"] = record(client, "GET", "/")
        fixtures["config"] = record(client, "GET", "/config")
        fixtures["info"] = record(client, "GET", "/info")
        fixtures["agents"] = record(client, "GET", "/agents")
        fixtures["agent"] = record(client, "GET", "/agents/assistant")
        fixtures["agent_not_found"] = record(client, "GET", "/agents/missing")
        fixtures["teams"] = record(client, "GET", "/teams")
        fixtures["workflows"] = record(client, "GET", "/workflows")
        fixtures["sessions_empty"] = record(
            client, "GET", "/sessions", params={"type": "agent"}
        )
        fixtures["schedules_empty"] = record(client, "GET", "/schedules")
        fixtures["cors_preflight"] = record(
            client,
            "OPTIONS",
            "/config",
            headers={
                "Origin": "https://os.agno.com",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )
        fixtures["cors_get"] = record(
            client, "GET", "/health", headers={"Origin": "https://os.agno.com"}
        )
        fixtures["cors_foreign_origin"] = record(
            client, "GET", "/health", headers={"Origin": "https://evil.example"}
        )
        fixtures["validation_error"] = record(
            client, "POST", "/company/products", json={}
        )
        fixtures["company_details"] = record(client, "GET", "/company/details")
        product = record(
            client,
            "POST",
            "/company/products",
            json={"name": "SDK", "purpose": "Ship the SDK"},
        )
        fixtures["company_product_created"] = product
        product_id = (
            product["body"].get("id") if isinstance(product["body"], dict) else None
        )
        fixtures["company_products"] = record(client, "GET", "/company/products")
        if product_id:
            project = record(
                client,
                "POST",
                "/company/projects",
                json={"product_id": product_id, "name": "Release"},
            )
            fixtures["company_project_created"] = project
            task = record(
                client,
                "POST",
                "/company/tasks",
                json={
                    "product_id": product_id,
                    "project_id": project["body"].get("id"),
                    "title": "Draft release notes",
                    "brief": "Summarize reviewed changes",
                    "evidence": [{"reference": "Reviewed release changes"}],
                },
            )
            fixtures["company_task_created"] = task
            fixtures["company_tasks"] = record(
                client, "GET", "/company/tasks", params={"product_id": product_id}
            )
            routine = record(
                client,
                "POST",
                "/company/routines",
                json={
                    "product_id": product_id,
                    "name": "Weekly summary",
                    "instructions": "Summarize the week",
                    "cron_expr": "0 9 * * 1",
                },
            )
            fixtures["company_routine_created"] = routine
            fixtures["company_routines"] = record(
                client, "GET", "/company/routines", params={"product_id": product_id}
            )
            fixtures["company_attention"] = record(client, "GET", "/company/attention")
            fixtures["company_product_deleted"] = record(
                client, "DELETE", "/company/products/" + product_id
            )
            fixtures["company_product_restored"] = record(
                client, "POST", "/company/products/" + product_id + "/restore"
            )
    for name, fixture in fixtures.items():
        (OUT / "fixtures" / (name + ".json")).write_text(
            json.dumps(fixture, indent=2, sort_keys=True, default=str) + "\n"
        )
    print(
        "operations:",
        sum(len(v) for v in app.openapi()["paths"].values()),
        "fixtures:",
        len(fixtures),
    )
    for name, fixture in fixtures.items():
        print(name, fixture["status"])


if __name__ == "__main__":
    main()
