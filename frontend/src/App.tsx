import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow, Background, Controls, MiniMap, Handle, Position,
  useNodesState, useEdgesState, addEdge,
  type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
type Port = { id: string; type: string; required?: boolean };
type Spec = { title: string; accent: string; inputs: Port[]; outputs: Port[] };
type NodeKind = "prompt" | "image" | "image_edit" | "video" | "output";
type CanvasData = Record<string, unknown> & {
  text?: string;
  model?: string;
  status?: string;
  result?: string;
  update?: (nodeId: string, key: string, value: string) => void;
};
type CanvasNode = Node<CanvasData, NodeKind>;

type RunResult = {
  notice: string;
  order: string[];
  results: Record<string, { status: string; outputs: Record<string, string> }>;
};

const specs: Record<NodeKind, Spec> = {
  prompt: { title: "Text Prompt", accent: "#38bdf8", inputs: [], outputs: [{ id: "text", type: "text" }] },
  image: { title: "Image Generation", accent: "#a78bfa", inputs: [{ id: "prompt", type: "text", required: true }], outputs: [{ id: "image", type: "image" }] },
  image_edit: { title: "Image Edit", accent: "#fb7185", inputs: [{ id: "image", type: "image", required: true }, { id: "prompt", type: "text" }], outputs: [{ id: "image", type: "image" }] },
  video: { title: "Video Generation", accent: "#fbbf24", inputs: [{ id: "image", type: "image", required: true }, { id: "prompt", type: "text" }], outputs: [{ id: "video", type: "video" }] },
  output: { title: "Output", accent: "#4ade80", inputs: [{ id: "asset", type: "image|video", required: true }], outputs: [] },
};

const starterNodes: CanvasNode[] = [
  { id: "prompt1", type: "prompt", position: { x: 50, y: 160 }, data: { text: "A luxury watch in dramatic studio lighting" } },
  { id: "image1", type: "image", position: { x: 325, y: 110 }, data: { model: "mock-image-v1" } },
  { id: "video1", type: "video", position: { x: 600, y: 110 }, data: { model: "mock-video-v1" } },
  { id: "output1", type: "output", position: { x: 880, y: 145 }, data: {} },
];
const starterEdges: Edge[] = [
  { id: "e1", source: "prompt1", sourceHandle: "text", target: "image1", targetHandle: "prompt" },
  { id: "e2", source: "image1", sourceHandle: "image", target: "video1", targetHandle: "image" },
  { id: "e3", source: "video1", sourceHandle: "video", target: "output1", targetHandle: "asset" },
];

function WorkflowNode({ id, type, data }: NodeProps<CanvasNode>) {
  const kind = type as NodeKind;
  const spec = specs[kind];
  const update = data.update;
  return (
    <div className="workflow-node" style={{ borderColor: spec.accent }}>
      <header style={{ borderLeft: `4px solid ${spec.accent}` }}>{spec.title}
        <span className="status">{String(data.status || "idle")}</span>
      </header>
      <div className="node-body">
        {kind === "prompt" && <textarea className="nodrag" value={String(data.text || "")} onChange={e => update?.(id, "text", e.target.value)} rows={3} placeholder="Enter prompt..." />}
        {(kind === "image" || kind === "image_edit" || kind === "video") && <label className="small-label">Model
          <select className="nodrag" value={String(data.model || `mock-${kind}-v1`)} onChange={e => update?.(id, "model", e.target.value)}>
            <option value={`mock-${kind}-v1`}>Mock {kind} v1</option>
            <option value={`mock-${kind}-v2`}>Mock {kind} v2</option>
          </select>
        </label>}
        {kind === "output" && <div className="muted">Final media result</div>}
        {data.result && <div className="result" title={String(data.result)}>{String(data.result)}</div>}
      </div>
      {spec.inputs.map((port, i) => (
        <div key={port.id} className="port-label port-in" style={{ top: 67 + i * 22 }}>
          <Handle id={port.id} type="target" position={Position.Left} style={{ background: spec.accent }} />
          {port.id}{port.required ? " *" : ""}
        </div>
      ))}
      {spec.outputs.map((port, i) => (
        <div key={port.id} className="port-label port-out" style={{ top: 67 + i * 22 }}>
          {port.id}
          <Handle id={port.id} type="source" position={Position.Right} style={{ background: spec.accent }} />
        </div>
      ))}
    </div>
  );
}

const nodeTypes = { prompt: WorkflowNode, image: WorkflowNode, image_edit: WorkflowNode, video: WorkflowNode, output: WorkflowNode };

function reaches(from: string, destination: string, edges: Edge[]): boolean {
  const stack = [from], seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (node === destination) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const edge of edges) if (edge.source === node) stack.push(edge.target);
  }
  return false;
}

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(starterNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(starterEdges);
  const [runData, setRunData] = useState<RunResult | null>(null);
  const [feedback, setFeedback] = useState("Ready — mock generation mode");
  const [busy, setBusy] = useState(false);

  const updateNode = useCallback((nodeId: string, key: string, value: string) => {
    setNodes(current => current.map(n => n.id === nodeId ? { ...n, data: { ...n.data, [key]: value } } : n));
    setRunData(null);
  }, [setNodes]);

  const renderedNodes = useMemo(() => nodes.map(node => {
    const out = runData?.results[node.id]?.outputs;
    return { ...node, data: { ...node.data, update: updateNode,
      status: runData?.results[node.id]?.status ?? "idle",
      result: out ? Object.values(out)[0] : undefined,
    } };
  }), [nodes, runData, updateNode]);

  const graph = useCallback(() => ({
    nodes: nodes.map(n => ({ id: n.id, type: n.type, position: n.position, data: {
      ...(n.type === "prompt" ? { text: n.data.text || "" } : {}),
      ...(n.type === "image" || n.type === "image_edit" || n.type === "video" ? { model: n.data.model || "" } : {}),
    } })),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
  }), [nodes, edges]);

  const validConnection = useCallback((c: Connection | Edge) => {
    if (!c.source || !c.target || !c.sourceHandle || !c.targetHandle) return false;
    if (c.source === c.target || reaches(c.target, c.source, edges)) return false;
    const src = nodes.find(n => n.id === c.source);
    const dst = nodes.find(n => n.id === c.target);
    if (!src || !dst || !src.type || !dst.type) return false;
    const source = specs[src.type as NodeKind]?.outputs.find(p => p.id === c.sourceHandle);
    const target = specs[dst.type as NodeKind]?.inputs.find(p => p.id === c.targetHandle);
    if (!source || !target || !target.type.split("|").includes(source.type)) return false;
    return !edges.some(e => e.target === c.target && e.targetHandle === c.targetHandle);
  }, [nodes, edges]);

  const onConnect = useCallback((connection: Connection) => {
    if (validConnection(connection)) {
      setEdges(current => addEdge({ ...connection, id: `e_${crypto.randomUUID()}`, animated: true }, current));
      setRunData(null);
    }
  }, [validConnection, setEdges]);

  const perform = async (action: "save" | "load" | "validate" | "run") => {
    setBusy(true);
    try {
      if (action === "save") {
        await api("/api/workflows/demo", "PUT", graph());
        setFeedback("Workflow saved to local SQLite");
      } else if (action === "load") {
        const loaded = await api("/api/workflows/demo");
        setNodes(loaded.nodes);
        setEdges(loaded.edges);
        setRunData(null);
        setFeedback("Workflow loaded");
      } else if (action === "validate") {
        const check = await api("/api/workflows/validate", "POST", graph());
        setFeedback(check.valid ? `Valid DAG: ${check.execution_order.join(" → ")}` : check.errors.join(" | "));
      } else {
        const result: RunResult = await api("/api/workflows/run", "POST", graph());
        setRunData(result);
        setFeedback(`Mock run completed: ${result.order.join(" → ")}`);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Unexpected error");
    } finally { setBusy(false); }
  };

  const addNode = (type: NodeKind) => {
    setNodes(prev => [...prev, {
      id: `${type}_${crypto.randomUUID().slice(0, 6)}`, type,
      position: { x: 140 + (prev.length % 3) * 245, y: 250 + Math.floor(prev.length / 3) * 130 },
      data: type === "prompt" ? { text: "New prompt" } : type === "image" || type === "image_edit" || type === "video" ? { model: `mock-${type}-v1` } : {},
    }]);
    setRunData(null);
  };

  return (
    <div className="app-shell">
      <div className="topbar"><div><strong>AI Canvas Studio</strong><small>Node-based creative workflows · MVP</small></div>
        <div className="actions">
          <button disabled={busy} onClick={() => perform("validate")}>Validate</button>
          <button disabled={busy} onClick={() => perform("save")}>Save</button>
          <button disabled={busy} onClick={() => perform("load")}>Load</button>
          <button className="primary" disabled={busy} onClick={() => perform("run")}>{busy ? "Working..." : "▶ Run Mock"}</button>
        </div>
      </div>
      <div className="content">
        <aside className="sidebar"><h3>ADD NODES</h3>
          {(Object.keys(specs) as NodeKind[]).map(k => <button key={k} onClick={() => addNode(k)}><span style={{ color: specs[k].accent }}>●</span> {specs[k].title} <b>+</b></button>)}
          <p>Drag a node's circular handles to connect compatible ports. Delete selected nodes or edges with the Delete key.</p>
          <h3>RULES</h3><p>Typed ports · No cycles · One connection per input port</p>
        </aside>
        <div className="canvas"><ReactFlow nodes={renderedNodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} isValidConnection={validConnection} nodeTypes={nodeTypes} fitView colorMode="dark" minZoom={0.2}>
          <Background color="#334155" gap={18} size={1}/><Controls/><MiniMap zoomable pannable/>
        </ReactFlow></div>
      </div>
      <div className="footer"><span className="pill">MOCK MODE</span><span>{feedback}</span></div>
    </div>
  );
}
