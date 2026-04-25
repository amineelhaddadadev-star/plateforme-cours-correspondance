import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { renderAsync } from "docx-preview";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  base64: string;
  name: string;
  onClose: () => void;
  onDownload: () => void;
}

function PdfPage({ page, scale }: { page: PDFPageProxy; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const viewport = page.getViewport({ scale });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    if (renderTaskRef.current) renderTaskRef.current.cancel();
    const task = page.render({ canvasContext: ctx, viewport, canvas });
    renderTaskRef.current = task;
    task.promise.catch((err: unknown) => {
      if (err instanceof Error && err.name === "RenderingCancelledException") return;
      console.error(err);
    });
    return () => { renderTaskRef.current?.cancel(); };
  }, [page, scale]);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block rounded shadow-md"
      style={{ maxWidth: "100%" }}
    />
  );
}

export function usePdfPages(base64: string) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadedPages: PDFPageProxy[] = [];
    setPdf(null); setPages([]); setLoading(true); setError(null);
    (async () => {
      try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const doc = await pdfjsLib.getDocument({ data: bytes, verbosity: 0 }).promise;
        if (cancelled) return;
        setPdf(doc);
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          if (cancelled) return;
          loadedPages.push(p);
        }
        setPages([...loadedPages]);
      } catch {
        if (!cancelled) setError("Impossible de charger le fichier PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; loadedPages.forEach((p) => p.cleanup()); };
  }, [base64]);

  return { pdf, pages, loading, error };
}

interface InlinePdfViewerProps {
  base64: string;
  name: string;
}

export function InlinePdfViewer({ base64, name }: InlinePdfViewerProps) {
  const { pdf, pages, loading, error } = usePdfPages(base64);
  const [scale, setScale] = useState(1.2);

  return (
    <div className="flex flex-col rounded-xl border border-app-muted bg-white overflow-hidden shadow-sm">
      {/* Mini toolbar */}
      <div className="flex h-11 items-center gap-3 border-b border-app-muted/60 px-4">
        <span className="flex-1 truncate text-sm font-semibold text-app-dark" title={name}>
          📄 {name}
        </span>
        {pdf && <span className="text-xs text-app-dark/50 whitespace-nowrap">{pdf.numPages} page{pdf.numPages > 1 ? "s" : ""}</span>}
        <div className="flex items-center gap-1">
          <button className="rounded px-2 py-0.5 text-xs font-semibold text-app-dark/70 transition hover:bg-app-soft" type="button" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))}>−</button>
          <span className="w-10 text-center text-xs text-app-dark/60">{Math.round(scale * 100)}%</span>
          <button className="rounded px-2 py-0.5 text-xs font-semibold text-app-dark/70 transition hover:bg-app-soft" type="button" onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}>+</button>
        </div>
      </div>
      {/* Pages */}
      <div className="overflow-y-auto bg-app-soft/50 p-4" style={{ maxHeight: "70vh" }}>
        {loading && (
          <div className="flex flex-col items-center gap-2 py-10">
            <div className="skeleton skeleton-block w-full max-w-md" />
            <p className="text-xs text-app-dark/50">Chargement du PDF…</p>
          </div>
        )}
        {error && (
          <div className="py-8 text-center">
            <p className="text-sm text-red-500">⚠ {error}</p>
          </div>
        )}
        {!loading && !error && (
          <div className="flex flex-col gap-3 items-center">
            {pages.map((page, i) => (
              <div key={i} className="relative w-full">
                <PdfPage page={page} scale={scale} />
                <span className="absolute bottom-2 right-3 rounded bg-black/40 px-2 py-0.5 text-xs text-white/70">{i + 1}/{pages.length}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DOCX Viewer ─────────────────────────────────────────────────────────────

interface DocxViewerProps {
  base64: string;
  name: string;
  onClose: () => void;
  onDownload: () => void;
}

function useDocxRender(base64: string, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        await renderAsync(blob, containerRef.current, undefined, {
          className: "docx-render",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
          renderChanges: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        });
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) { setLoading(false); setError("Impossible de charger le document."); }
      }
    })();
    return () => { cancelled = true; };
  }, [base64, containerRef]);

  return { loading, error };
}

export function InlineDocxViewer({ base64, name }: { base64: string; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { loading, error } = useDocxRender(base64, containerRef);

  return (
    <div className="flex flex-col rounded-xl border border-app-muted bg-white overflow-hidden shadow-sm">
      <div className="flex h-11 items-center gap-3 border-b border-app-muted/60 px-4">
        <span className="flex-1 truncate text-sm font-semibold text-app-dark" title={name}>
          📄 {name}
        </span>
      </div>
      <div className="overflow-y-auto bg-app-soft/50 p-4" style={{ maxHeight: "70vh" }}>
        {loading && !error && (
          <div className="flex flex-col items-center gap-2 py-10">
            <p className="text-xs text-app-dark/50">Chargement du document…</p>
          </div>
        )}
        {error && (
          <div className="py-8 text-center">
            <p className="text-sm text-red-500">⚠ {error}</p>
          </div>
        )}
        <div ref={containerRef} />
      </div>
    </div>
  );
}

export default function PdfViewer({ base64, name, onClose, onDownload }: PdfViewerProps) {
  const { pdf, pages, loading, error } = usePdfPages(base64);
  const [scale, setScale] = useState(1.2);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(21,23,61,0.92)" }}
    >
      {/* Toolbar */}
      <div
        className="flex h-14 flex-shrink-0 items-center gap-3 border-b px-4"
        style={{ background: "#15173D", borderColor: "rgba(255,255,255,0.1)" }}
      >
        {/* Filename */}
        <span className="flex-1 truncate text-sm font-semibold text-white" title={name}>
          📄 {name}
        </span>

        {/* Page info */}
        {pdf && (
          <span className="text-xs text-white/60 whitespace-nowrap">
            {pdf.numPages} page{pdf.numPages > 1 ? "s" : ""}
          </span>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            className="rounded px-2 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(1)))}
            title="Zoom arrière"
          >
            −
          </button>
          <span className="w-12 text-center text-xs text-white/70">{Math.round(scale * 100)}%</span>
          <button
            className="rounded px-2 py-1 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            type="button"
            onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(1)))}
            title="Zoom avant"
          >
            +
          </button>
        </div>

        {/* Download button */}
        <button
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition"
          style={{ background: "#982598" }}
          type="button"
          onClick={onDownload}
          title="Télécharger"
        >
          ↓ Télécharger
        </button>

        {/* Close */}
        <button
          className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition hover:bg-white/10 hover:text-white"
          type="button"
          onClick={onClose}
          title="Fermer (Echap)"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-6 px-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 pt-16">
            <div className="skeleton skeleton-block w-64 rounded-xl" />
            <div className="skeleton skeleton-line w-48" />
            <p className="text-sm text-white/50">Chargement du PDF…</p>
          </div>
        )}
        {error && (
          <div className="mx-auto mt-16 max-w-sm rounded-xl border border-red-400/30 bg-red-900/30 p-6 text-center">
            <p className="text-sm font-semibold text-red-300">⚠ {error}</p>
            <button
              className="mt-3 rounded-lg px-4 py-2 text-xs font-semibold text-white"
              style={{ background: "#982598" }}
              type="button"
              onClick={onDownload}
            >
              Télécharger à la place
            </button>
          </div>
        )}
        {!loading && !error && (
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {pages.map((page, i) => (
              <div key={i} className="relative">
                <PdfPage page={page} scale={scale} />
                <span className="absolute bottom-2 right-3 rounded bg-black/40 px-2 py-0.5 text-xs text-white/60">
                  {i + 1} / {pages.length}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
