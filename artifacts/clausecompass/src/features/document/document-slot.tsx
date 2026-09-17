import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { AlertCircle, Check, FileText, Upload } from "lucide-react";
import { ACCEPT_ATTRIBUTE } from "./constants";
import type { Slot } from "./slots";
import { checkFile } from "./validate-file";
import { copy } from "@/features/journey/copy";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

interface DocumentSlotProps {
  slot: Slot;
  file: File | null;
  error: string | null;
  /** Whether to show the slot label visually (compare mode) or only to assistive tech. */
  showLabel: boolean;
  onFiles: (files: ArrayLike<File>) => void;
  onClear: () => void;
  inputRef: (element: HTMLInputElement | null) => void;
}

function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * One document input: a drop target wrapped around a real file input. The
 * input is the only Tab stop (visually hidden, never display:none), so keyboard
 * and screen-reader users get the native picker; mouse users can click
 * anywhere in the zone or drop a file on it.
 */
export function DocumentSlot({
  slot,
  file,
  error,
  showLabel,
  onFiles,
  onClear,
  inputRef,
}: DocumentSlotProps) {
  const baseId = `slot-${slot.id}`;
  const inputId = `${baseId}-input`;
  const labelId = `${baseId}-label`;
  const actionId = `${baseId}-action`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;

  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function onDragEnter(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragOver(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(event: DragEvent) {
    if (!carriesFiles(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    onFiles(event.dataTransfer.files);
  }
  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    onFiles(input.files ?? []);
    // Reset so choosing the same file again still fires a change event.
    input.value = "";
  }

  const describedBy = error ? `${hintId} ${errorId}` : hintId;
  const check = file ? checkFile(file) : null;
  const kindLabel = check && check.ok ? check.kind.toUpperCase() : null;

  const input = (
    <input
      id={inputId}
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      className="sr-only"
      aria-labelledby={`${labelId} ${actionId}`}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      onChange={onInputChange}
      data-testid={`input-file-${slot.id}`}
    />
  );

  return (
    // The drag handlers add a pointer-only shortcut around the file input below; the input is the control, and keyboard and
    // assistive-technology users reach it directly, so this box needs no role or key handling of its own.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drop target around a native file input, see above
    <div
      className="space-y-3"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid={`dropzone-${slot.id}`}
    >
      <span
        id={labelId}
        className={cn(
          "block text-lg font-medium text-foreground",
          !showLabel && "sr-only",
        )}
      >
        {slot.label}
      </span>

      {file ? (
        <div
          className={cn(
            "flex flex-col gap-4 rounded-2xl border-2 border-border bg-card p-5 shadow-sm transition-colors sm:flex-row sm:items-center",
            dragging && "border-primary bg-primary/5",
          )}
          data-testid={`card-file-${slot.id}`}
        >
          <FileText aria-hidden="true" className="h-8 w-8 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-lg font-medium text-foreground"
              data-testid={`text-file-name-${slot.id}`}
            >
              {file.name}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {kindLabel && <span>{kindLabel}</span>}
              {kindLabel && <span aria-hidden="true">·</span>}
              <span>{formatBytes(file.size)}</span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Check aria-hidden="true" className="h-4 w-4 text-primary" />
                {copy.upload.dropzone.readyLabel}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <label
              htmlFor={inputId}
              className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border-2 border-border bg-background px-4 text-base font-medium text-foreground transition-colors hover:border-primary/60 has-[:focus-visible]:border-primary has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
            >
              {input}
              <span id={actionId}>{copy.upload.dropzone.replace}</span>
            </label>
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-base font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              data-testid={`button-remove-${slot.id}`}
            >
              {copy.upload.dropzone.remove}
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-card px-6 py-9 text-center transition-colors hover:border-primary/60 md:py-10",
            "has-[:focus-visible]:border-primary has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
            error ? "border-destructive" : "border-border",
            dragging && "border-primary bg-primary/5",
          )}
        >
          {input}
          {/* The icon lifts while the pointer is over the zone or a file is held above it: the same motion as the picker cards. */}
          <span
            aria-hidden="true"
            className={cn(
              "flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-primary transition-transform duration-500 group-hover:-translate-y-1 group-hover:scale-105 motion-reduce:transition-none",
              dragging && "-translate-y-1 scale-105",
            )}
          >
            <Upload className="h-9 w-9" strokeWidth={1.75} />
          </span>
          <span className="text-base text-muted-foreground">{copy.upload.dropzone.prompt}</span>
          {/* Drawn as the zone's button; the input inside the label is what takes focus and opens the picker. */}
          <span
            id={actionId}
            className="inline-flex min-h-[3.25rem] items-center justify-center rounded-xl bg-primary px-7 text-lg font-semibold text-primary-foreground shadow-sm transition-colors group-hover:bg-primary/90"
          >
            {copy.upload.dropzone.action}
          </span>
          <span id={hintId} className="max-w-md text-sm leading-relaxed text-muted-foreground">
            {copy.upload.dropzone.hint}
          </span>
        </label>
      )}

      {file && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {copy.upload.dropzone.hint}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-2 text-base font-medium text-destructive"
          data-testid={`text-error-${slot.id}`}
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
