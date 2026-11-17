# AI Canvas Studio — original MVP scaffold

A small Higgsfield Canvas-inspired educational prototype. No reverse-engineered proprietary code, no private endpoints, no Higgsfield branding, and no real media generation. An independent workflow editor with a typed DAG engine.

## Features
- Canvas with Prompt, Image, Image Edit, Video, Output nodes and typed handles.
- Drag/edit/connect/delete nodes and edges (React Flow).
- Frontend and backend prevent mismatched ports, cyclic graphs, and missing required dependencies.
- Mock pipeline execution in topological order (a `mock://` ID is **not an image/video**).
- Save/load workflow in a local SQLite file.
- API docs available at http://localhost:8000/docs.

## Run

Terminal 1 (Python 3.10+):

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Terminal 2 (Node 18+; Node 20 recommended):

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Default graph already connects Prompt → Image → Video → Output. Click `Validate` and `Run Mock`.

## Automated tests

```bash
cd backend
python -m pytest -q
```

## REST API

| Method | URL | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/workflows/validate` | Graph port, DAG and required-input validation |
| POST | `/api/workflows/run` | Mock graph execution, synchronous |
| PUT | `/api/workflows/{id}` | Persist workflow JSON |
| GET | `/api/workflows/{id}` | Restore workflow JSON |

## Roadmap
1. Real async queue + per-node statuses, retries, cancellation, SSE/WebSocket events.
2. Asset upload + S3-compatible storage, signed URLs, metadata and thumbnails.
3. Provider adapters (official image/video model APIs), model-specific input schemas, cost estimates.
4. User authentication, workspaces, permissions, billing, quotas.
5. Collaboration, undo/redo, reusable templates, scalable execution and audit logs.

## Design rules
- The backend is the authority for graph validation; client validation is for UX only.
- Node execution state and media assets belong to a **run**, not to the persistent graph definition.
- Separate `sourceHandle` / `targetHandle` type compatibility from canvas presentation.
- Do not put provider API keys in frontend code.
- `run` is synchronous in this learning MVP; **do not** treat it as production-ready.
