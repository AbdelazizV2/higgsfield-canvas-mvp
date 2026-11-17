from fastapi.testclient import TestClient
from app import app

client = TestClient(app)


def flow(edges=None):
    return {
        "nodes": [
            {"id": "a", "type": "prompt", "data": {"text": "A watch"}},
            {"id": "b", "type": "image", "data": {}},
            {"id": "c", "type": "video", "data": {}},
            {"id": "d", "type": "output", "data": {}},
        ],
        "edges": edges if edges is not None else [
            {"id": "1", "source": "a", "sourceHandle": "text", "target": "b", "targetHandle": "prompt"},
            {"id": "2", "source": "b", "sourceHandle": "image", "target": "c", "targetHandle": "image"},
            {"id": "3", "source": "c", "sourceHandle": "video", "target": "d", "targetHandle": "asset"},
        ],
    }


def test_happy_path():
    data = flow()
    check = client.post("/api/workflows/validate", json=data)
    assert check.status_code == 200
    assert check.json()["valid"] is True
    result = client.post("/api/workflows/run", json=data)
    assert result.status_code == 200
    assert result.json()["order"] == ["a", "b", "c", "d"]
    assert result.json()["results"]["d"]["outputs"]["asset"].startswith("mock://video/")


def test_missing_dependency():
    data = flow([])
    result = client.post("/api/workflows/validate", json=data).json()
    assert result["valid"] is False
    assert any("missing required input" in e for e in result["errors"])
    assert client.post("/api/workflows/run", json=data).status_code == 422


def test_cycle_detected():
    data = {
        "nodes": [{"id": "edit", "type": "image_edit", "data": {}}],
        "edges": [{"id": "loop", "source": "edit", "sourceHandle": "image", "target": "edit", "targetHandle": "image"}],
    }
    result = client.post("/api/workflows/validate", json=data).json()
    assert result["valid"] is False
    assert any("cycle" in e for e in result["errors"])
    assert client.post("/api/workflows/run", json=data).status_code == 422


def test_type_mismatch():
    data = flow()
    data["edges"][0]["sourceHandle"] = "invalid"
    assert client.post("/api/workflows/validate", json=data).json()["valid"] is False
