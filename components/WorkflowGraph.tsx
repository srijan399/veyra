"use client";

import { useMemo, useState } from "react";
import { NODE_CHROME, NODE_H, NODE_W } from "@/lib/node-style";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

/** Orthogonal route from a's exit to b's entry, matching the design's three cases. */
function edgePath(a: WorkflowNode, b: WorkflowNode): string {
  const ax = a.x + NODE_W / 2;
  const bx = b.x + NODE_W / 2;

  // Straight drop when b sits directly below a.
  if (b.y > a.y + NODE_H - 10 && Math.abs(ax - bx) < 6) {
    return `M${ax},${a.y + NODE_H} L${bx},${b.y - 6}`;
  }
  // Down, across, down — b is lower and not to the right.
  if (b.y > a.y + NODE_H - 10 && b.x <= a.x + NODE_W) {
    const my = (a.y + NODE_H + b.y) / 2;
    return `M${ax},${a.y + NODE_H} L${ax},${my} L${bx},${my} L${bx},${b.y - 6}`;
  }
  // Out the right side, across, into b's left edge.
  const mx = (a.x + NODE_W + b.x) / 2;
  return `M${a.x + NODE_W},${a.y + NODE_H / 2} L${mx},${a.y + NODE_H / 2} L${mx},${
    b.y + NODE_H / 2
  } L${b.x - 6},${b.y + NODE_H / 2}`;
}

/** Where a branch condition chip sits along its edge. */
function edgeMidpoint(a: WorkflowNode, b: WorkflowNode) {
  if (b.x > a.x + NODE_W) {
    return {
      x: (a.x + NODE_W + b.x) / 2,
      y: (a.y + NODE_H / 2 + b.y + NODE_H / 2) / 2,
    };
  }
  return { x: a.x + NODE_W / 2, y: (a.y + NODE_H + b.y) / 2 };
}

interface WorkflowGraphProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
}

export default function WorkflowGraph({
  nodes,
  edges,
  selectedId,
  onSelect,
  onMoveNode,
}: WorkflowGraphProps) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /** Runs `move` on pointermove until pointerup, wherever the pointer goes. */
  const trackPointer = (move: (e: PointerEvent) => void) => {
    setDragging(true);
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onCanvasDown = (e: React.PointerEvent) => {
    const sx = e.clientX;
    const sy = e.clientY;
    const start = pan;
    trackPointer((ev) =>
      setPan({ x: start.x + (ev.clientX - sx), y: start.y + (ev.clientY - sy) }),
    );
  };

  const onNodeDown = (e: React.PointerEvent, node: WorkflowNode) => {
    e.stopPropagation();
    onSelect(node.id);
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = node.x;
    const oy = node.y;
    trackPointer((ev) =>
      onMoveNode(node.id, ox + (ev.clientX - sx), oy + (ev.clientY - sy)),
    );
  };

  return (
    <div
      onPointerDown={onCanvasDown}
      className={`relative flex-1 overflow-hidden bg-ink bg-[linear-gradient(rgba(243,242,242,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(243,242,242,.05)_1px,transparent_1px)] bg-[length:32px_32px] ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${pan.x}px,${pan.y}px)` }}
      >
        <svg
          width="1320"
          height="700"
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
        >
          <defs>
            <marker
              id="varw"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,1 L9,5 L0,9 z" fill="rgba(243,242,242,.5)" />
            </marker>
          </defs>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (!a || !b) return null;
            return (
              <path
                key={e.id}
                d={edgePath(a, b)}
                fill="none"
                stroke="rgba(243,242,242,.42)"
                strokeWidth="1.5"
                markerEnd="url(#varw)"
              />
            );
          })}
        </svg>

        {edges.map((e) => {
          const a = byId.get(e.from);
          const b = byId.get(e.to);
          if (!a || !b || !e.condition) return null;
          const m = edgeMidpoint(a, b);
          const affirmative = e.condition === "Qualified" || e.condition === "Yes";
          return (
            <span
              key={e.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap border border-bone/[.26] bg-ink px-[7px] py-[3px] text-[10px] uppercase tracking-[.1em] ${
                affirmative ? "text-blush" : "text-bone/60"
              }`}
              style={{ left: m.x, top: m.y }}
            >
              {e.condition}
            </span>
          );
        })}

        {nodes.map((n) => {
          const chrome = NODE_CHROME[n.type];
          const selected = selectedId === n.id;
          return (
            <div
              key={n.id}
              onPointerDown={(e) => onNodeDown(e, n)}
              className="absolute flex cursor-grab select-none flex-col gap-1 px-[13px] py-2.5 transition-shadow duration-100"
              style={{
                left: n.x,
                top: n.y,
                width: NODE_W,
                minHeight: NODE_H,
                background: chrome.fill,
                color: chrome.text,
                border: chrome.border,
                boxShadow: selected ? "0 0 0 3px rgba(236,48,19,.45)" : "none",
              }}
            >
              <div
                className="text-[9.5px] uppercase tracking-[.14em]"
                style={{ color: chrome.kickerColor }}
              >
                {chrome.kicker}
              </div>
              <div className="text-sm font-extrabold leading-[1.2] tracking-[-.01em]">
                {n.label}
              </div>
              <div
                className="mt-auto text-[10.5px] tracking-[.02em]"
                style={{
                  color:
                    n.type === "terminal"
                      ? "rgba(26,24,23,.5)"
                      : "rgba(243,242,242,.42)",
                }}
              >
                {n.captures.join(" · ")}
              </div>
            </div>
          );
        })}
      </div>

      <div className="absolute bottom-3.5 left-4 flex gap-3.5 text-[10.5px] uppercase tracking-[.1em] text-bone/40">
        <span>Drag nodes · drag canvas to pan</span>
      </div>
    </div>
  );
}
