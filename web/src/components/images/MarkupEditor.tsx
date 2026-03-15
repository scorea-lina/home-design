"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "freehand" | "line" | "arrow" | "rectangle" | "circle" | "text" | "move";
type Color = string;

type Annotation = {
  tool: Tool;
  color: Color;
  points?: { x: number; y: number }[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
  text?: string;
  fontSize?: number;
};

type Props = {
  imageUrl: string;
  existingMarkup?: Annotation[] | null;
  onSave: (annotations: Annotation[], dataUrl: string) => void;
  onCancel?: () => void;
};

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ffffff", "#000000"];
/** Font sizes as fraction of image shorter dimension — scale-independent. */
const FONT_SIZE_SCALES: { frac: number; label: string }[] = [
  { frac: 0.025, label: "S" },
  { frac: 0.045, label: "M" },
  { frac: 0.07, label: "L" },
];
const TOOLS: { id: Tool; label: string }[] = [
  { id: "move", label: "Move" },
  { id: "freehand", label: "Draw" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rectangle", label: "Rect" },
  { id: "circle", label: "Circle" },
  { id: "text", label: "Text" },
];

export function MarkupEditor({ imageUrl, existingMarkup, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("freehand");
  const [color, setColor] = useState(COLORS[0]);
  const [fontSizeIdx, setFontSizeIdx] = useState(1); // 0=S, 1=M, 2=L
  const [annotations, setAnnotations] = useState<Annotation[]>(existingMarkup ?? []);

  /** Compute actual pixel font size from image dimensions and current scale index. */
  const getFontSize = useCallback(() => {
    const img = imgRef.current;
    if (!img) return 32;
    const shorter = Math.min(img.naturalWidth, img.naturalHeight);
    return Math.round(shorter * FONT_SIZE_SCALES[fontSizeIdx].frac);
  }, [fontSizeIdx]);
  const [drawing, setDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Move tool state
  const [movingIdx, setMovingIdx] = useState<number | null>(null);
  const [moveStart, setMoveStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

    for (const ann of annotations) {
      drawAnnotation(ctx, ann);
    }
  }, [imgLoaded, annotations]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.width = imgRef.current.naturalWidth;
    overlay.height = imgRef.current.naturalHeight;
  }, [imgLoaded]);

  const getPos = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = overlayRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getPos(e);

      // Move tool: find annotation under cursor
      if (tool === "move") {
        const canvasSize = imgRef.current ? Math.min(imgRef.current.naturalWidth, imgRef.current.naturalHeight) : undefined;
        const idx = hitTest(annotations, pos, canvasSize);
        if (idx >= 0) {
          setMovingIdx(idx);
          setMoveStart(pos);
        }
        return;
      }

      if (tool === "text") {
        const text = prompt("Enter text:");
        if (text) {
          setAnnotations((prev) => [
            ...prev,
            { tool: "text", color, start: pos, text, fontSize: getFontSize() },
          ]);
        }
        return;
      }

      setDrawing(true);

      if (tool === "freehand") {
        setCurrentAnnotation({ tool, color, points: [pos] });
      } else {
        setCurrentAnnotation({ tool, color, start: pos, end: pos });
      }
    },
    [tool, color, getPos, annotations, getFontSize]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const pos = getPos(e);

      // Move tool: drag selected annotation
      if (tool === "move" && movingIdx !== null && moveStart) {
        const dx = pos.x - moveStart.x;
        const dy = pos.y - moveStart.y;
        setAnnotations((prev) =>
          prev.map((ann, i) => (i === movingIdx ? offsetAnnotation(ann, dx, dy) : ann))
        );
        setMoveStart(pos);
        return;
      }

      if (!drawing || !currentAnnotation) return;

      if (currentAnnotation.tool === "freehand") {
        setCurrentAnnotation((prev) => ({
          ...prev!,
          points: [...(prev!.points || []), pos],
        }));
      } else {
        setCurrentAnnotation((prev) => ({ ...prev!, end: pos }));
      }

      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);

      const preview =
        currentAnnotation.tool === "freehand"
          ? { ...currentAnnotation, points: [...(currentAnnotation.points || []), pos] }
          : { ...currentAnnotation, end: pos };
      drawAnnotation(ctx, preview);
    },
    [drawing, currentAnnotation, getPos, tool, movingIdx, moveStart]
  );

  const handleMouseUp = useCallback(() => {
    // Move tool: release
    if (movingIdx !== null) {
      setMovingIdx(null);
      setMoveStart(null);
      return;
    }

    if (!drawing || !currentAnnotation) return;
    setDrawing(false);

    setAnnotations((prev) => [...prev, currentAnnotation]);
    setCurrentAnnotation(null);

    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [drawing, currentAnnotation, movingIdx]);

  const handleUndo = useCallback(() => {
    setAnnotations((prev) => prev.slice(0, -1));
  }, []);

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    onSave(annotations, dataUrl);
  }, [annotations, onSave]);

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 rounded-lg bg-cream-100 px-3 py-2">
        <div className="flex gap-1">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tool === t.id
                  ? "bg-wood-500 text-white"
                  : "bg-cream-200 text-cream-800 hover:bg-cream-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full border-2 transition-all ${
                color === c ? "border-cream-950 scale-110" : "border-cream-400"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {tool === "text" && (
          <div className="flex items-center gap-1">
            {FONT_SIZE_SCALES.map((fs, idx) => (
              <button
                key={fs.label}
                onClick={() => setFontSizeIdx(idx)}
                className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                  fontSizeIdx === idx
                    ? "bg-wood-500 text-white"
                    : "bg-cream-200 text-cream-800 hover:bg-cream-300"
                }`}
              >
                {fs.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleUndo}
            disabled={annotations.length === 0}
            title="Undo"
            className="rounded-lg bg-cream-200 px-2 py-1.5 text-cream-800 hover:bg-cream-300 disabled:opacity-30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/></svg>
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              title="Cancel"
              className="rounded-lg bg-cream-200 px-2 py-1.5 text-cream-800 hover:bg-cream-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
          <button
            onClick={handleSave}
            className="rounded-lg bg-sage-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sage-400"
          >
            Save
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative inline-block w-full">
        {!imgLoaded && (
          <div className="flex h-64 items-center justify-center text-sm text-cream-700">
            Loading image...
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg"
          style={{ display: imgLoaded ? "block" : "none" }}
        />
        <canvas
          ref={overlayRef}
          className={`absolute left-0 top-0 w-full rounded-lg ${tool === "move" ? "cursor-grab" : "cursor-crosshair"}`}
          style={{ display: imgLoaded ? "block" : "none" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
}

/** Draw a single annotation onto a canvas context. */
function drawAnnotation(ctx: CanvasRenderingContext2D, ann: Annotation) {
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  // Scale line width to ~0.3% of canvas shorter dimension so strokes are visible on high-res images
  const shorter = Math.min(ctx.canvas.width, ctx.canvas.height);
  ctx.lineWidth = Math.max(2, Math.round(shorter * 0.003));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (ann.tool) {
    case "freehand": {
      const pts = ann.points || [];
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();
      break;
    }

    case "line": {
      if (!ann.start || !ann.end) return;
      ctx.beginPath();
      ctx.moveTo(ann.start.x, ann.start.y);
      ctx.lineTo(ann.end.x, ann.end.y);
      ctx.stroke();
      break;
    }

    case "arrow": {
      if (!ann.start || !ann.end) return;
      const { start, end } = ann;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();

      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLen = Math.max(10, Math.round(shorter * 0.015));
      ctx.beginPath();
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle - Math.PI / 6),
        end.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(end.x, end.y);
      ctx.lineTo(
        end.x - headLen * Math.cos(angle + Math.PI / 6),
        end.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }

    case "rectangle": {
      if (!ann.start || !ann.end) return;
      const x = Math.min(ann.start.x, ann.end.x);
      const y = Math.min(ann.start.y, ann.end.y);
      const w = Math.abs(ann.end.x - ann.start.x);
      const h = Math.abs(ann.end.y - ann.start.y);
      ctx.strokeRect(x, y, w, h);
      break;
    }

    case "circle": {
      if (!ann.start || !ann.end) return;
      const cx = (ann.start.x + ann.end.x) / 2;
      const cy = (ann.start.y + ann.end.y) / 2;
      const rx = Math.abs(ann.end.x - ann.start.x) / 2;
      const ry = Math.abs(ann.end.y - ann.start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }

    case "text": {
      if (!ann.start || !ann.text) return;
      ctx.font = `${ann.fontSize || 24}px sans-serif`;
      ctx.fillText(ann.text, ann.start.x, ann.start.y);
      break;
    }
  }
}

/** Offset an annotation's position by (dx, dy). */
function offsetAnnotation(ann: Annotation, dx: number, dy: number): Annotation {
  const moved = { ...ann };
  if (moved.start) moved.start = { x: moved.start.x + dx, y: moved.start.y + dy };
  if (moved.end) moved.end = { x: moved.end.x + dx, y: moved.end.y + dy };
  if (moved.points) moved.points = moved.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return moved;
}

/** Find the top-most annotation under a point (returns index, or -1). */
function hitTest(annotations: Annotation[], pos: { x: number; y: number }, canvasSize?: number): number {
  const HIT = canvasSize ? Math.max(12, Math.round(canvasSize * 0.01)) : 12;
  // Walk backwards so top-most (last drawn) is found first
  for (let i = annotations.length - 1; i >= 0; i--) {
    const ann = annotations[i];
    switch (ann.tool) {
      case "rectangle":
      case "circle": {
        if (!ann.start || !ann.end) break;
        const x1 = Math.min(ann.start.x, ann.end.x) - HIT;
        const y1 = Math.min(ann.start.y, ann.end.y) - HIT;
        const x2 = Math.max(ann.start.x, ann.end.x) + HIT;
        const y2 = Math.max(ann.start.y, ann.end.y) + HIT;
        if (pos.x >= x1 && pos.x <= x2 && pos.y >= y1 && pos.y <= y2) return i;
        break;
      }
      case "line":
      case "arrow": {
        if (!ann.start || !ann.end) break;
        if (distToSegment(pos, ann.start, ann.end) < HIT) return i;
        break;
      }
      case "text": {
        if (!ann.start) break;
        const fs = ann.fontSize || 24;
        const textW = (ann.text?.length ?? 0) * fs * 0.6;
        if (
          pos.x >= ann.start.x - HIT &&
          pos.x <= ann.start.x + textW + HIT &&
          pos.y >= ann.start.y - fs - HIT &&
          pos.y <= ann.start.y + HIT
        ) return i;
        break;
      }
      case "freehand": {
        const pts = ann.points || [];
        for (let j = 1; j < pts.length; j++) {
          if (distToSegment(pos, pts[j - 1], pts[j]) < HIT) return i;
        }
        break;
      }
    }
  }
  return -1;
}

/** Distance from point p to line segment a-b. */
function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
