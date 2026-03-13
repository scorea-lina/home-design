"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  imageUrl: string;
  onCrop: (dataUrl: string) => void;
  onClose: () => void;
};

/**
 * Fullscreen zoom + pan viewer with crop mode.
 * - Scroll to zoom (centered on cursor)
 * - Click + drag to pan
 * - "Crop" button enters crop mode: draw a rectangle, confirm to extract
 *
 * Coordinate mapping uses the actual rendered <img> element's bounding rect
 * so the crop always matches exactly what's visible on screen.
 */
export function ImageZoomCrop({ imageUrl, onCrop, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Transform: offset is the pixel position of the image's top-left corner
  // within the container.
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Pan state
  const [panning, setPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });

  // Crop mode
  const [cropMode, setCropMode] = useState(false);
  const [cropRect, setCropRect] = useState<{
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null>(null);
  const [cropping, setCropping] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
      // Fit image to screen initially
      const container = containerRef.current;
      if (container) {
        const padding = 80;
        const scaleX = (container.clientWidth - padding) / img.naturalWidth;
        const scaleY = (container.clientHeight - padding) / img.naturalHeight;
        const fitScale = Math.min(scaleX, scaleY, 1);
        setScale(fitScale);
        setOffset({
          x: (container.clientWidth - img.naturalWidth * fitScale) / 2,
          y: (container.clientHeight - img.naturalHeight * fitScale) / 2,
        });
      }
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Zoom centered on cursor
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (cropMode) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale = Math.max(0.1, Math.min(20, scale * zoomFactor));

      // Keep the point under the cursor fixed
      const ratio = newScale / scale;
      setScale(newScale);
      setOffset({
        x: cursorX - ratio * (cursorX - offset.x),
        y: cursorY - ratio * (cursorY - offset.y),
      });
    },
    [scale, offset, cropMode]
  );

  // Convert screen coords to image coords using actual rendered img element
  const screenToImage = useCallback(
    (clientX: number, clientY: number) => {
      const imgEl = imgElRef.current;
      if (!imgEl || !imgRef.current) return { x: 0, y: 0 };
      const imgRect = imgEl.getBoundingClientRect();
      const nw = imgRef.current.naturalWidth;
      const nh = imgRef.current.naturalHeight;

      const x = ((clientX - imgRect.left) / imgRect.width) * nw;
      const y = ((clientY - imgRect.top) / imgRect.height) * nh;

      return {
        x: Math.max(0, Math.min(nw, x)),
        y: Math.max(0, Math.min(nh, y)),
      };
    },
    []
  );

  // Mouse handlers for pan + crop
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;

      if (cropMode) {
        const pos = screenToImage(e.clientX, e.clientY);
        setCropRect({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
        setCropping(true);
        return;
      }

      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offset };
    },
    [cropMode, offset, screenToImage]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (cropping && cropRect) {
        const pos = screenToImage(e.clientX, e.clientY);
        setCropRect((prev) => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
        return;
      }

      if (panning) {
        const dx = e.clientX - panStart.current.x;
        const dy = e.clientY - panStart.current.y;
        setOffset({
          x: offsetStart.current.x + dx,
          y: offsetStart.current.y + dy,
        });
      }
    },
    [panning, cropping, cropRect, screenToImage]
  );

  const handleMouseUp = useCallback(() => {
    setPanning(false);
    if (cropping) {
      setCropping(false);
    }
  }, [cropping]);

  // Get normalized crop rect (top-left to bottom-right) in image coords
  const getNormalizedCrop = useCallback(() => {
    if (!cropRect) return null;
    return {
      x: Math.min(cropRect.startX, cropRect.endX),
      y: Math.min(cropRect.startY, cropRect.endY),
      w: Math.abs(cropRect.endX - cropRect.startX),
      h: Math.abs(cropRect.endY - cropRect.startY),
    };
  }, [cropRect]);

  // Convert crop rect from image coords to screen coords using actual img element
  const getCropScreenRect = useCallback(() => {
    const norm = getNormalizedCrop();
    if (!norm || !containerRef.current || !imgElRef.current || !imgRef.current) return null;

    const imgRect = imgElRef.current.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    const nw = imgRef.current.naturalWidth;
    const nh = imgRef.current.naturalHeight;

    return {
      left: (imgRect.left - containerRect.left) + (norm.x / nw) * imgRect.width,
      top: (imgRect.top - containerRect.top) + (norm.y / nh) * imgRect.height,
      width: (norm.w / nw) * imgRect.width,
      height: (norm.h / nh) * imgRect.height,
    };
  }, [getNormalizedCrop]);

  // Extract crop at full resolution
  const handleExtractCrop = useCallback(async () => {
    const norm = getNormalizedCrop();
    if (!norm || !imgRef.current || norm.w < 10 || norm.h < 10) return;

    setExtracting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(norm.w);
      canvas.height = Math.round(norm.h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(
        imgRef.current,
        Math.round(norm.x),
        Math.round(norm.y),
        Math.round(norm.w),
        Math.round(norm.h),
        0,
        0,
        Math.round(norm.w),
        Math.round(norm.h)
      );

      const dataUrl = canvas.toDataURL("image/png");
      onCrop(dataUrl);
    } finally {
      setExtracting(false);
    }
  }, [getNormalizedCrop, onCrop]);

  // Reset zoom
  const handleFit = useCallback(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;
    const padding = 80;
    const scaleX = (container.clientWidth - padding) / img.naturalWidth;
    const scaleY = (container.clientHeight - padding) / img.naturalHeight;
    const fitScale = Math.min(scaleX, scaleY, 1);
    setScale(fitScale);
    setOffset({
      x: (container.clientWidth - img.naturalWidth * fitScale) / 2,
      y: (container.clientHeight - img.naturalHeight * fitScale) / 2,
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (cropRect) {
          setCropRect(null);
          setCropMode(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cropRect, onClose]);

  const cropScreen = getCropScreenRect();
  const imgW = imgRef.current ? imgRef.current.naturalWidth * scale : 0;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => {
              const newScale = Math.min(20, scale * 1.5);
              const container = containerRef.current;
              if (container) {
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const ratio = newScale / scale;
                setOffset({
                  x: cx - ratio * (cx - offset.x),
                  y: cy - ratio * (cy - offset.y),
                });
              }
              setScale(newScale);
            }}
            className="rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Zoom In
          </button>
          <button
            onClick={() => {
              const newScale = Math.max(0.1, scale / 1.5);
              const container = containerRef.current;
              if (container) {
                const cx = container.clientWidth / 2;
                const cy = container.clientHeight / 2;
                const ratio = newScale / scale;
                setOffset({
                  x: cx - ratio * (cx - offset.x),
                  y: cy - ratio * (cy - offset.y),
                });
              }
              setScale(newScale);
            }}
            className="rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Zoom Out
          </button>
          <button
            onClick={handleFit}
            className="rounded bg-zinc-800 px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Fit
          </button>

          <div className="mx-2 h-5 w-px bg-zinc-700" />

          <button
            onClick={() => {
              setCropMode(!cropMode);
              setCropRect(null);
            }}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              cropMode
                ? "bg-blue-600 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            Crop
          </button>

          {cropRect && !cropping && (
            <button
              onClick={handleExtractCrop}
              disabled={extracting}
              className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
            >
              {extracting ? "Extracting..." : "Extract Crop"}
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="rounded px-3 py-1 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Close
        </button>
      </div>

      {/* Help text */}
      <div className="px-4 py-1.5 text-xs text-zinc-500">
        {cropMode
          ? "Draw a rectangle on the image to select a crop area"
          : "Scroll to zoom \u00B7 Click + drag to pan"}
      </div>

      {/* Image viewport */}
      <div
        ref={containerRef}
        className="relative flex-1 overflow-hidden"
        style={{ cursor: cropMode ? "crosshair" : panning ? "grabbing" : "grab" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {!imgLoaded && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            Loading image...
          </div>
        )}

        {imgLoaded && imgRef.current && (
          <img
            ref={imgElRef}
            src={imageUrl}
            alt="Zoom view"
            draggable={false}
            className="absolute select-none"
            style={{
              left: offset.x,
              top: offset.y,
              width: imgW,
              imageRendering: scale > 3 ? "pixelated" : "auto",
            }}
          />
        )}

        {/* Crop overlay */}
        {cropRect && cropScreen && cropScreen.width > 0 && cropScreen.height > 0 && (
          <>
            {/* Dim everything outside the crop */}
            <div className="pointer-events-none absolute inset-0">
              {/* Top */}
              <div
                className="absolute bg-black/60"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  height: Math.max(0, cropScreen.top),
                }}
              />
              {/* Bottom */}
              <div
                className="absolute bg-black/60"
                style={{
                  top: cropScreen.top + cropScreen.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
              {/* Left */}
              <div
                className="absolute bg-black/60"
                style={{
                  top: cropScreen.top,
                  left: 0,
                  width: Math.max(0, cropScreen.left),
                  height: cropScreen.height,
                }}
              />
              {/* Right */}
              <div
                className="absolute bg-black/60"
                style={{
                  top: cropScreen.top,
                  left: cropScreen.left + cropScreen.width,
                  right: 0,
                  height: cropScreen.height,
                }}
              />
            </div>

            {/* Crop border */}
            <div
              className="pointer-events-none absolute border-2 border-blue-400"
              style={{
                left: cropScreen.left,
                top: cropScreen.top,
                width: cropScreen.width,
                height: cropScreen.height,
              }}
            >
              {/* Size label */}
              <div className="absolute -top-6 left-0 rounded bg-blue-600 px-1.5 py-0.5 text-xs text-white">
                {Math.round(getNormalizedCrop()?.w ?? 0)} x{" "}
                {Math.round(getNormalizedCrop()?.h ?? 0)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
