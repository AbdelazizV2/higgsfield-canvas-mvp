"""A small, original node workflow service. Models are mocked; no AI calls made."""
from __future__ import annotations

from collections import defaultdict, deque
from pathlib import Path
from typing import Any
import json
import sqlite3
import uuid

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="AI Canvas MVP", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["*"],
)

DATABASE = Path(__file__).resolve().parent / "data" / "workflows.db"

# Port specifications are authoritative on the server. The frontend mirrors them for UX.
SPECS = {
    "prompt": {"inputs": {}, "outputs": {"text": "text"}},
    "image": {"inputs": {"prompt": ("text", True)}, "outputs": {"image": "image"}},
    "video": {"inputs": {"image": ("image", True), "prompt": ("text", False)}, "outputs": {"video": "video"}},
    "image_edit": {"inputs": {"image": ("image", True), "prompt": ("text", False)}, "outputs": {"image": "image"}},
    "output": {"inputs": {"asset": ("image|video", True)}, "outputs": {}},
}


class FlowNode(BaseModel):
    id: str
    type: str
    position: dict[str, float] = Field(default_factory=dict)
    data: dict[str, Any] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None
    targetHandle: str | None = None


class Workflow(BaseModel):
    nodes: list[FlowNode]
    edges: list[FlowEdge]


def analyze(workflow: Workflow) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    ids = [n.id for n in workflow.nodes]
    if len(set(ids)) != len(ids):
        errors.append("Duplicate node IDs")
    node_map = {n.id: n for n in workflow.nodes}
    for node in workflow.nodes:
        if node.type not in SPECS:
            errors.append(f"Node {node.id} has unsupported type {node.type}")
        if node.type == "prompt" and not str(node.data.get("text", "")).strip():
            errors.append(f"Prompt node {node.id} has no text")

    graph: dict[str, list[str]] = defaultdict(list)
    indegree = {node_id: 0 for node_id in ids}
    received: set[tuple[str, str]] = set()
    for edge in workflow.edges:
        src, dst = node_map.get(edge.source), node_map.get(edge.target)
        if src is None or dst is None:
            errors.append(f"Edge {edge.id} refers to an unknown node")
            continue
        if src.type not in SPECS or dst.type not in SPECS:
            continue
        source_type = SPECS[src.type]["outputs"].get(edge.sourceHandle)
        target_spec = SPECS[dst.type]["inputs"].get(edge.targetHandle)
        if source_type is None or target_spec is None:
            errors.append(f"Edge {edge.id} has an invalid source/target port")
            continue
        target_type, _required = target_spec
        if source_type not in target_type.split("|"):
            errors.append(f"Edge {edge.id}: {source_type} cannot connect to {target_type}")
        target_port = (edge.target, str(edge.targetHandle))
        if target_port in received:
            errors.append(f"Node {edge.target} has multiple connections to {edge.targetHandle}")
        received.add(target_port)
        graph[edge.source].append(edge.target)
        indegree[edge.target] += 1

    for node in workflow.nodes:
        if node.type not in SPECS:
            continue
        for port, (_type, required) in SPECS[node.type]["inputs"].items():
            if required and (node.id, port) not in received:
                errors.append(f"Node {node.id} is missing required input '{port}'")

    ready = deque(node_id for node_id in ids if indegree[node_id] == 0)
    ordered: list[str] = []
    while ready:
        current = ready.popleft()
        ordered.append(current)
        for nxt in graph[current]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
    if len(ordered) != len(ids):
        errors.append("Workflow contains a directed cycle")
    return errors, ordered


def run_mock(workflow: Workflow) -> dict[str, Any]:
    errors, order = analyze(workflow)
    if errors:
        raise ValueError("; ".join(errors))
    nodes = {n.id: n for n in workflow.nodes}
    produced: dict[str, dict[str, str]] = {}
    results: dict[str, dict[str, Any]] = {}
    incoming: dict[str, list[FlowEdge]] = defaultdict(list)
    for edge in workflow.edges:
        incoming[edge.target].append(edge)

    for node_id in order:
        node = nodes[node_id]
        inputs = {
            str(edge.targetHandle): produced[edge.source][str(edge.sourceHandle)]
            for edge in incoming[node_id]
        }
        if node.type == "prompt":
            outputs = {"text": str(node.data["text"])}
        elif node.type == "image":
            outputs = {"image": f"mock://image/{uuid.uuid4().hex[:10]}"}
        elif node.type == "video":
            outputs = {"video": f"mock://video/{uuid.uuid4().hex[:10]}"}
        elif node.type == "image_edit":
            outputs = {"image": f"mock://edited-image/{uuid.uuid4().hex[:10]}"}
        elif node.type == "output":
            outputs = {"asset": inputs["asset"]}
        else:
            raise ValueError(f"Unsupported type {node.type}")
        produced[node_id] = outputs
        results[node_id] = {"status": "completed", "inputs": inputs, "outputs": outputs}
    return {"run_id": str(uuid.uuid4()), "order": order, "results": results,
            "notice": "MOCK MODE: no image or video was generated"}


def get_connection() -> sqlite3.Connection:
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE)
    conn.execute("CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, content TEXT NOT NULL)")
    return conn


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "mock"}


@app.post("/api/workflows/validate")
def validate(workflow: Workflow) -> dict[str, Any]:
    errors, order = analyze(workflow)
    return {"valid": not errors, "errors": errors, "execution_order": order}


@app.post("/api/workflows/run")
def run(workflow: Workflow) -> dict[str, Any]:
    try:
        return run_mock(workflow)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.put("/api/workflows/{workflow_id}")
def save(workflow_id: str, workflow: Workflow) -> dict[str, str]:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO workflows (id, content) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET content=excluded.content",
            (workflow_id, json.dumps(workflow.model_dump())),
        )
    return {"id": workflow_id, "status": "saved"}


@app.get("/api/workflows/{workflow_id}")
def load(workflow_id: str) -> Workflow:
    with get_connection() as conn:
        row = conn.execute("SELECT content FROM workflows WHERE id=?", (workflow_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return Workflow.model_validate_json(row[0])
