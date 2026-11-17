# Functional reverse engineering plan — Higgsfield Canvas-inspired product

**Scope:** Reproduce documented, externally observable *capabilities* via independent implementation. Do not copy source code or proprietary assets. Use only published interfaces, documentation, and permitted product interactions; avoid undocumented private API use and automated scraping.

## Observation log: verified product behavior vs. unknown internals

| Documented behavior | Architectural implication (hypothesis, not an internal Higgsfield fact) | What to build |
|---|---|---|
| Infinite board with prompt, media, model nodes | A client-side graph editor | React Flow canvas |
| Connect generation outputs to downstream inputs | Typed graph + dependency resolver | Port-based validation |
| Trigger nodes individually or as sequence | Dependency-aware runner | DAG executor |
| Parallel branches | Scheduler with concurrent eligible nodes | Worker pool (future) |
| Save workflows as templates | JSON flow persistence | SQLite now; PostgreSQL later |
| Multi-user collaboration | Live graph synchronization | Post-MVP CRDT/WebSocket |
| Model/API requests are asynchronous | Run and request ID lifecycle | Queue + worker + callbacks later |

Sources:
- https://higgsfield.ai/creator-hub/help-center/tools/how-do-i-use-canvas
- https://higgsfield.ai/canvas-intro
- https://open.higgsfield.ai/quick-start
- https://reactflow.dev/learn/customization/handles

## Input/output types

- `text` output of `prompt`, consumed by `image.prompt` and optionally `video.prompt` and `image_edit.prompt`.
- `image` output of `image` or `image_edit`, consumed by `video.image` or `image_edit.image`, accepted by `output.asset`.
- `video` output of `video`, accepted by `output.asset`.
- `asset` is polymorphic, allowed input types `image | video`.

## Pipeline example

`Text Prompt -(text)-> Image Generation -(image)-> Image Edit -(image)-> Video Generation -(video)-> Output`

Prompt also may link to `video.prompt` or `image_edit.prompt`.

## Execution lifecycle (target system)

- Graph saved separately from execution runs.
- User initiates run; graph is validated for required input ports, type compatibility and cycles.
- Nodes with no unresolved dependencies enter `ready`; scheduler dispatches them.
- Worker calls selected provider adapter, storing provider request ID.
- Worker polls or receives webhook; media is downloaded/registered in object storage.
- Completed node unlocks dependents; results and logs belong to the run, not the graph.
- UI streams node states `pending → queued → running → completed | failed | canceled`.
- Errors have retry policies, timeouts, and configurable run cancellation. User-facing costs calculated before execution.

**In the included starter** this lifecycle is deliberately simplified to synchronous mock execution with stable typed graph validation; a `mock://` URL is a placeholder.

## Definition of done for MVP

1. User can add, move, connect, delete nodes and edges on canvas.
2. Text input and model dropdown can be edited.
3. Invalid port connections and cycles cannot be saved as valid runnable workflows.
4. Backend validation supplies clear errors for missing mandatory inputs.
5. Valid graph runs in topological order and results appear on nodes.
6. Workflow can be saved to and loaded from local SQLite.
7. Next milestone: first real image model call, authenticated server-side, with generated asset preview.

## Investigation worksheet (fill from permitted observation)

For each observed Canvas feature, record: Date, version, action, initial state, observed UI behavior, input constraints, output type, error case, source link/screenshot, confidence (Confirmed/Assumed). Don't claim hidden data formats or database technologies without evidence.
