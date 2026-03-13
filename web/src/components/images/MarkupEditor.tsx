"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Tool = "freehand" | "line" | "arrow" | "rectangle" | "text";
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
const TOOLS: { id: Tool; label: string }[] = [
  { id: "freehand", label: "Draw" },
  { id: "line", label: "Line" },
  { id: "arrow", label: "Arrow" },
  { id: "rectangle", label: "Rect" },
  { id: "text", label: "Text" },
];

export function MarkupEditor({ imageUrl, existingMarkup, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>("freehand");
  const [color, setColor] = useState(COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>(existingMarkup ?? []);
  const [drawing, setDrawing] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Load image.
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Render everything whenever annotations or image changes.
  useEffect(() => {
    if (!imgLoaded || !imgRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = imgRef.current;
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw image.
    ctx.drawImage(img, 0, 0);

    // Draw all saved annotations.
    for (const ann of annotations) {
      drawAnnotation(ctx, ann);
    }
  }, [imgLoaded, annotations]);

  // Resize overlay to match canvas.
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

      if (tool === "text") {
        const text = prompt("Enter text:");
        if (text) {
          setAnnotations((prev) => [
            ...prev,
            { tool: "text", color, start: pos, text, fontSize: 24 },
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
    [tool, color, getPos]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!drawing || !currentAnnotation) return;
      const pos = getPos(e);

      if (currentAnnotation.tool === "freehand") {
        setCurrentAnnotation((prev) => ({
          ...prev!,
          points: [...(prev!.points || []), pos],
        }));
      } else {
        setCurrentAnnotation((prev) => ({ ...prev!, end: pos }));
      }

      // Draw preview on overlay.
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
    [drawing, currentAnnotation, getPos]
  );

  const handleMouseUp = useCallback(() => {
    if (!drawing || !currentAnnotation) return;
    setDrawing(false);

    setAnnotations((prev) => [...prev, currentAnnotation]);
    setCurrentAnnotation(null);

    // Clear overlay.
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [drawing, currentAnnotation]);

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
      <div className="sticky top-0 z-10 space-y-2 rounded-lg bg-zinc-900 py-2">
        <div className="flex items-center gap-3">
          {/* Tool buttons */}
          <div className="flex gap-1">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTool(t.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  tool === t.id
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Color swatches */}
          <div className="flex gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition-all ${
                  color === c ? "border-white scale-110" : "border-zinc-600"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={annotations.length === 0}
            title="Undo"
            className="rounded-lg bg-zinc-800 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-30"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.69 3L3 13"/></svg>
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              title="Cancel"
              className="rounded-lg bg-zinc-800 px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          )}
          <button
            onClick={handleSave}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-500"
          >
            Save
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="relative inline-block w-full">
        {!imgLoaded && (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-400">
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
          className="absolute left-0 top-0 w-full cursor-crosshair rounded-lg"
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
  ctx.lineWidth = 3;
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

      // Arrowhead.
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const headLen = 15;
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

    case "text": {
      if (!ann.start || !ann.text) return;
      ctx.font = `${ann.fontSize || 24}px sans-serif`;
      ctx.fillText(ann.text, ann.start.x, ann.start.y);
      break;
    }
  }
}
