"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileText, Plus } from "lucide-react";

export type GlassFolderFile = {
  id: string;
  title: string;
  meta: string;
  fitScore: number;
};

type GlassEvidenceFolderProps = {
  files: GlassFolderFile[];
  category: string;
  selectedId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width?: number;
};

const BACK_PATH = "M0 56A22 22 0 0 1 22 34L146 34C170 34 172 0 198 0L318 0A22 22 0 0 1 340 22L340 250A22 22 0 0 1 318 272L22 272A22 22 0 0 1 0 250Z";
const FRONT_PATH = "M0 22A22 22 0 0 1 22 0L118 0C144 0 146 32 172 32L318 32A22 22 0 0 1 340 54L340 176A22 22 0 0 1 318 198L22 198A22 22 0 0 1 0 176Z";

const categoryCodes: Record<string, string> = { Clinical: "CLI", Consumer: "CON", Lab: "LAB", Field: "FIE" };
const FAN_COUNT = 4;

export default function GlassEvidenceFolder({ files, category, selectedId, onSelect, open, onOpenChange, width = 240 }: GlassEvidenceFolderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const scale = width / 340;
  const title = category;
  const selectedFile = files.find((file) => file.id === selectedId);
  const bestFile = files.reduce<GlassFolderFile | undefined>((best, file) => !best || file.fitScore > best.fitScore ? file : best, undefined);
  const fanFiles = files.slice(0, FAN_COUNT);

  const setOpen = (next: boolean) => onOpenChange(next);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setEntered(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setEntered(true);
        observer.disconnect();
      }
    }, { threshold: 0.15 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const bounds = root.getBoundingClientRect();
      root.style.setProperty("--gf-px", (((event.clientX - bounds.left) / bounds.width) * 2 - 1).toFixed(3));
      root.style.setProperty("--gf-py", (((event.clientY - bounds.top) / bounds.height) * 2 - 1).toFixed(3));
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; });
    };
    const leave = () => {
      root.style.setProperty("--gf-px", "0");
      root.style.setProperty("--gf-py", "0");
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const toggleOpen = () => {
    setOpen(!open);
  };

  return (
    <div
      ref={rootRef}
      className="gf-root"
      data-category={category}
      data-open={open || undefined}
      data-entered={entered || undefined}
      style={{ width, height: 326 * scale + (open ? 200 : 0), "--gf-scale": scale } as React.CSSProperties}
    >
      <div className="gf-stage">
        <div className="gf-tilt">
          <div className="gf-shadow" aria-hidden="true" />
          <div className="gf-back" style={{ clipPath: `path('${BACK_PATH}')` }} aria-hidden="true"><div className="gf-art" /><div className="gf-back-sheen" /></div>
          <svg className="gf-rim gf-back-rim" viewBox="0 0 340 272" aria-hidden="true"><path d={BACK_PATH} /></svg>

          <div className="gf-files" aria-label={`${category} study files`}>
            {fanFiles.map((file, index) => {
              const isSelected = file.id === selectedId;
              const slot = fanFiles.length < 2 ? 0 : (index / (fanFiles.length - 1)) * 2 - 1;
              return <button key={file.id} type="button" className={`gf-sheet${isSelected ? " is-selected" : ""}`} style={{ "--gf-slot": slot, "--gf-depth": fanFiles.length - index - 1, zIndex: index + 1 } as React.CSSProperties} onClick={() => onSelect(file.id)} aria-pressed={isSelected} aria-label={`Select ${file.title} as supporting evidence`}>
                <span className="gf-sheet-head"><FileText aria-hidden="true" /><span className="gf-sheet-name">{file.title}</span></span>
                <span className="gf-sheet-meta">{file.meta}</span>
                <span className="gf-sheet-lines" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                {isSelected && <span className="gf-sheet-selected"><Check aria-hidden="true" /> Linked to draft</span>}
              </button>;
            })}
          </div>

          <div className="gf-front" style={{ clipPath: `path('${FRONT_PATH}')` }}>
            <div className="gf-tint" aria-hidden="true" />
            <div className="gf-spec" aria-hidden="true" />
            <svg className="gf-rim gf-front-rim" viewBox="0 0 340 198" aria-hidden="true"><path d={FRONT_PATH} /></svg>
            <button className="gf-hit" type="button" aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${title} folder`} onClick={toggleOpen} />
            <div className="gf-label"><span className="gf-title">{title}</span><span className="gf-meta">{files.length} {files.length === 1 ? "study" : "studies"} · {categoryCodes[category]}</span></div>
          </div>

          <button className={`gf-key gf-key-add${selectedFile ? " is-selected" : ""}`} type="button" disabled={!bestFile} aria-label={selectedFile ? "Unlink selected study from draft" : `Link strongest ${category} study`} onClick={() => bestFile && onSelect(selectedFile?.id ?? bestFile.id)}>
            {selectedFile ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && <div className="gf-open-list" aria-label={`${category} studies`}>
        <div className="gf-list-heading"><strong>{category} research</strong><span>{files.length} {files.length === 1 ? "study" : "studies"}</span></div>
        {files.map((file) => <button key={file.id} type="button" className={`gf-overflow-file${file.id === selectedId ? " is-selected" : ""}`} onClick={() => onSelect(file.id)} aria-pressed={file.id === selectedId}>
          <FileText aria-hidden="true" /><span><strong>{file.title}</strong><small>{file.meta}</small></span>{file.id === selectedId && <Check aria-label="Linked" />}
        </button>)}
      </div>}
    </div>
  );
}