'use client';

import { useEffect, useRef, useState } from 'react';

export interface ModalSection {
  id: string;
  label: string;
}

/**
 * Popup frame of the student form: header with Previous / Next, quick links to the
 * sections, a scrolling body and a Save bar that always stays visible.
 * Esc and the backdrop call onClose, which decides whether unsaved changes may be dropped.
 */
export default function StudentModal({
  title,
  subtitle,
  position,
  onPrev,
  onNext,
  onClose,
  onSubmit,
  submitLabel,
  error,
  sections,
  children,
}: {
  title: string;
  subtitle?: string;
  position?: { index: number; total: number };
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  error?: string;
  sections: ModalSection[];
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The page behind must not scroll while the popup is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // The popup can be dragged by its header on larger screens (on phones it fills the screen)
  const formRef = useRef<HTMLFormElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; rect: DOMRect } | null>(null);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (window.innerWidth < 640 || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const rect = formRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y, rect };
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    // Keep part of the header on screen so the popup can always be grabbed again
    const dx = Math.min(Math.max(e.clientX - d.px, 120 - d.rect.right), window.innerWidth - 120 - d.rect.left);
    const dy = Math.min(Math.max(e.clientY - d.py, -d.rect.top), window.innerHeight - 60 - d.rect.top);
    setOffset({ x: d.ox + dx, y: d.oy + dy });
  };

  const onHeaderPointerUp = () => {
    drag.current = null;
  };

  // Back to the middle when the window gets too small to drag
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth < 640) setOffset({ x: 0, y: 0 });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/50 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="bg-white w-full sm:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] sm:rounded-xl shadow-xl flex flex-col"
        style={offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header: drag to move, double-click to put it back in the middle */}
        <div
          className="px-4 sm:px-6 py-4 border-b flex items-start gap-3 select-none sm:cursor-move sm:touch-none"
          onPointerDown={onHeaderPointerDown}
          onPointerMove={onHeaderPointerMove}
          onPointerUp={onHeaderPointerUp}
          onPointerCancel={onHeaderPointerUp}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest('button')) setOffset({ x: 0, y: 0 });
          }}
          title="Drag to move · double-click to put back in the middle"
        >
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-800 truncate">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 truncate">{subtitle}</p>}
          </div>
          {position && (
            <div className="flex items-center gap-1 text-sm">
              <button
                type="button"
                onClick={onPrev}
                disabled={!onPrev}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                title="Previous student"
              >
                ‹ <span className="hidden sm:inline">Previous</span>
              </button>
              <span className="px-2 text-gray-500 whitespace-nowrap">
                {position.index + 1} / {position.total}
              </span>
              <button
                type="button"
                onClick={onNext}
                disabled={!onNext}
                className="px-2.5 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
                title="Next student"
              >
                <span className="hidden sm:inline">Next</span> ›
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-1 text-2xl leading-none text-gray-400 hover:text-gray-700 px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Section links */}
        <div className="px-4 sm:px-6 py-2 border-b bg-gray-50 flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className="px-3 py-1 text-xs font-medium rounded-full border border-gray-300 bg-white text-gray-700 hover:border-green-500 hover:text-green-700"
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          {error && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{error}</div>}
          {children}
        </div>

        {/* Save bar */}
        <div className="px-4 sm:px-6 py-3 border-t flex justify-end gap-3 bg-white sm:rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button type="submit" className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700">
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/** One titled part of the popup body; the id is what the section links scroll to */
export function ModalSectionBlock({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-2 mb-8 last:mb-0">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-2 border-b">{title}</h3>
      {children}
    </section>
  );
}
