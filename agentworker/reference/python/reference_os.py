"""Reference AgentOS used to export the API contract and record fixtures.

Run from the repository root with an environment that has agno[os,sqlite,openai] installed:
    python agentworker/reference/python/export_contract.py
    python agentworker/reference/python/reference_os.py   # serves on http://localhost:7777

Set PORT to change the port. Set JWT_VERIFICATION_KEY to a PEM public key to turn on JWT authorization.
"""

import os
from tempfile import mkdtemp

from agno.agent import Agent
from agno.db.sqlite import SqliteDb
from agno.models.openai import OpenAIResponses
from agno.os import AgentOS, CompanyConfig
from agno.team import Team
from agno.workflow import Step, StepInput, StepOutput, Workflow

OS_ID = "reference-os"


def echo(step_input: StepInput) -> StepOutput:
    return StepOutput(content="echo: " + str(step_input.input))


def build_agent_os(db_file: str | None = None) -> AgentOS:
    os.environ.setdefault("OPENAI_API_KEY", "not-a-real-key")
    db = SqliteDb(
        db_file=db_file
        or os.path.join(mkdtemp(prefix="agentworker-ref-"), "reference.db")
    )
    assistant = Agent(
        id="assistant",
        name="Assistant",
        description="Reference agent",
        model=OpenAIResponses(id="gpt-5.6-luna"),
        db=db,
        telemetry=False,
    )
    crew = Team(
        id="crew",
        name="Crew",
        members=[assistant],
        model=OpenAIResponses(id="gpt-5.6-luna"),
        db=db,
        telemetry=False,
    )
    echo_flow = Workflow(
        id="echo-flow",
        name="Echo flow",
        db=db,
        steps=[Step(name="Echo", executor=echo)],
        telemetry=False,
    )
    return AgentOS(
        id=OS_ID,
        name="Reference OS",
        description="Reference AgentOS for the AgentWorker contract",
        db=db,
        agents=[assistant],
        teams=[crew],
        workflows=[echo_flow],
        company=CompanyConfig(model=OpenAIResponses(id="gpt-5.6-luna")),
        scheduler=True,
        scheduler_base_url="http://127.0.0.1:" + os.environ.get("PORT", "7777"),
        # JWT RBAC is on when a verification key is present; the audience is the OS id.
        authorization=bool(os.environ.get("JWT_VERIFICATION_KEY")),
        telemetry=False,
    )


if __name__ == "__main__":
    agent_os = build_agent_os()
    app = agent_os.get_app()
    agent_os.serve(app=app, port=int(os.environ.get("PORT", "7777")))
