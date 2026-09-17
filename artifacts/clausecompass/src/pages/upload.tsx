import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowRight, Clock, FileText, LoaderCircle, ShieldCheck, Check } from "lucide-react";
import { createSession, deleteSession, type SessionUpload } from "@workspace/api-client-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { SkipLink } from "@/components/skip-link";
import { DocumentArt } from "@/components/upload-art";
import { UploadNotes, UploadPapers, UploadPlant } from "@/components/upload-aside";
import { describeAnalysisError } from "@/features/analysis/analysis-error";
import { DocumentSlot } from "@/features/document/document-slot";
import { SAMPLES, loadSampleFile, type Sample } from "@/features/document/samples";
import { slotsForStage, type SlotFiles, type SlotId } from "@/features/document/slots";
import { checkFile } from "@/features/document/validate-file";
import { copy } from "@/features/journey/copy";
import { useJourney, type JourneySession } from "@/features/journey/journey-context";
import type { StageId } from "@/features/journey/stages";
import { useRetentionPolicy } from "@/features/journey/use-retention-policy";
import { focusRing } from "@/lib/focus-ring";
import { cn } from "@/lib/utils";

type SlotErrors = Partial<Record<SlotId, string>>;

const missingMessage: Record<SlotId, string> = {
  primary: copy.upload.errors.missingDocument,
  older: copy.upload.errors.missingOlder,
  newer: copy.upload.errors.missingNewer,
};

export default function Upload() {
  const { stage, documents, setDocument, clearDocument, session, setSession, endedAfter } = useJourney();
  // RequireStage redirects when there is no stage; render nothing in that instant.
  if (stage === null) return null;
  return (
    <UploadForm
      stage={stage}
      documents={documents}
      setDocument={setDocument}
      clearDocument={clearDocument}
      session={session}
      setSession={setSession}
      endedAfter={endedAfter}
    />
  );
}

interface UploadFormProps {
  stage: StageId;
  documents: SlotFiles;
  setDocument: ReturnType<typeof useJourney>["setDocument"];
  clearDocument: ReturnType<typeof useJourney>["clearDocument"];
  /** A session already opened for exactly these files, when the reader comes back to this screen. */
  session: JourneySession | null;
  setSession: ReturnType<typeof useJourney>["setSession"];
  /** Minutes of the retention window that passed, when the reader is here because the session ended on its own. */
  endedAfter: number | null;
}

/** The multipart body for the stage: one file, or the two versions. */
function uploadFor(stage: StageId, documents: SlotFiles): SessionUpload {
  if (stage === "compare-versions") return { stage, older: documents.older, newer: documents.newer };
  return { stage, file: documents.primary };
}

/** Whether the files on screen are the very File objects an upload was started with. */
function sameFiles(a: SlotFiles, b: SlotFiles): boolean {
  const slots = new Set<SlotId>([...(Object.keys(a) as SlotId[]), ...(Object.keys(b) as SlotId[])]);
  for (const slot of slots) if (a[slot] !== b[slot]) return false;
  return true;
}

function UploadForm({ stage, documents, setDocument, clearDocument, session, setSession, endedAfter }: UploadFormProps) {
  const [, navigate] = useLocation();
  const chosen = copy.stages[stage];
  const slots = slotsForStage(stage);
  const isCompare = slots.length > 1;
  const { ttlMinutes } = useRetentionPolicy();

  const [slotErrors, setSlotErrors] = useState<SlotErrors>({});
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [sampleStatus, setSampleStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const inputRefs = useRef<Partial<Record<SlotId, HTMLInputElement | null>>>({});
  const consentRef = useRef<HTMLInputElement | null>(null);
  const uploadErrorRef = useRef<HTMLParagraphElement | null>(null);
  // Arriving here because the session ended: bring the explanation into view and announce it.
  const endedRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (endedAfter !== null) endedRef.current?.focus();
  }, [endedAfter]);
  // The files as they are now, for an upload that started earlier to check against when its answer arrives.
  const latestFiles = useRef<SlotFiles>(documents);
  useLayoutEffect(() => {
    latestFiles.current = documents;
  }, [documents]);
  // Leaving the screen abandons an upload in flight. The request is left to finish rather than aborted: an abort
  // could cut it off after the API had already opened the session, leaving that session nowhere to be deleted from.
  const abandoned = useRef(false);
  useEffect(() => {
    abandoned.current = false;
    return () => {
      abandoned.current = true;
    };
  }, []);

  // A file dropped outside a zone would otherwise navigate the tab to the file.
  useEffect(() => {
    const prevent = (event: Event) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  function setSlotError(slot: SlotId, message: string | null) {
    setSlotErrors((current) => {
      const next = { ...current };
      if (message === null) delete next[slot];
      else next[slot] = message;
      return next;
    });
  }

  /** Every file, picked, dropped or loaded as a sample, goes through here. */
  function receiveFiles(slot: SlotId, files: ArrayLike<File>): boolean {
    try {
      const list = Array.from(files);
      if (list.length === 0) return false;
      if (list.length > 1) {
        setSlotError(slot, copy.upload.errors.multiple);
        return false;
      }
      const check = checkFile(list[0]);
      if (!check.ok) {
        setSlotError(slot, check.message);
        return false;
      }
      setDocument(slot, list[0]);
      setSlotError(slot, null);
      setUploadError(null);
      return true;
    } catch {
      setSlotError(slot, copy.upload.errors.unreadable);
      return false;
    }
  }

  function removeFile(slot: SlotId) {
    clearDocument(slot);
    setSlotError(slot, null);
    setUploadError(null);
    // The Remove button goes with the file; keyboard focus would fall to the top of the page. The slot's
    // picker is where the reader is now, so focus that once it is in the tree.
    window.setTimeout(() => inputRefs.current[slot]?.focus(), 0);
  }

  async function loadSample(sample: Sample) {
    const target = slots.find((slot) => documents[slot.id] === undefined) ?? slots[0];
    setLoadingSample(sample.id);
    setSampleStatus({ text: copy.upload.samples.loading(sample.title), isError: false });
    try {
      const file = await loadSampleFile(sample);
      if (receiveFiles(target.id, [file])) {
        setSampleStatus({
          text: copy.upload.samples.loaded(sample.title, copy.upload.slotPhrases[target.id]),
          isError: false,
        });
      }
    } catch {
      setSampleStatus({ text: copy.upload.samples.failed, isError: true });
    } finally {
      setLoadingSample(null);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (uploading) return;
    // Only a missing file blocks progress. A slot that holds a valid file may
    // still show the message from a refused replacement; that is informational
    // and is cleared here so the state and the message agree.
    const nextErrors: SlotErrors = {};
    for (const slot of slots) {
      if (documents[slot.id] === undefined) nextErrors[slot.id] = missingMessage[slot.id];
    }
    setSlotErrors(nextErrors);
    setConsentError(consent ? null : copy.upload.errors.consentRequired);

    const firstBadSlot = slots.find((slot) => nextErrors[slot.id] !== undefined);
    if (firstBadSlot) {
      inputRefs.current[firstBadSlot.id]?.focus();
      return;
    }
    if (!consent) {
      consentRef.current?.focus();
      return;
    }
    // The files are unchanged since the session was opened (changing one ends it), so there is nothing to send again.
    if (session !== null) {
      navigate("/interview");
      return;
    }
    // This is the moment the notice's first point refers to: the files leave the browser here.
    const sent = documents;
    setUploading(true);
    setUploadError(null);
    try {
      const opened = await createSession(uploadFor(stage, sent));
      // The screen was left, or a file was swapped while the upload ran: the session holds the wrong files, so it goes.
      if (abandoned.current || !sameFiles(sent, latestFiles.current)) {
        deleteSession(opened.id).catch((cause: unknown) => {
          console.warn("ClauseCompass: a superseded session could not be deleted now; it expires on its own.", cause);
        });
        return;
      }
      setSession(opened);
      navigate("/interview");
    } catch (error) {
      if (abandoned.current) return;
      setUploadError(describeAnalysisError(error));
      // Move focus to the message on the next paint, once it is in the tree.
      window.setTimeout(() => uploadErrorRef.current?.focus(), 0);
    } finally {
      if (!abandoned.current) setUploading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex flex-col font-sans bg-background selection:bg-primary/20 selection:text-foreground">
      <SkipLink />
      <SiteHeader back={{ href: "/", label: copy.upload.change, testId: "link-change-stage" }} />

      {/* Each block centres itself at its own width; the two bands are full width so the pictures beside them can use the page margins. */}
      <main id="main" className="flex-1 w-full space-y-16 py-12 md:py-16">
        {/* Why the reader is back here (FR-12): the session ended on its own; the files are still selected below. */}
        {endedAfter !== null && (
          <div className="mx-auto max-w-4xl px-6">
            <section
              ref={endedRef}
              tabIndex={-1}
              role="status"
              aria-label={copy.session.expiredTitle}
              data-testid="section-session-expired"
              className={`flex items-start gap-4 rounded-3xl border border-primary/20 bg-card p-6 md:p-8 shadow-sm ${focusRing}`}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Clock aria-hidden="true" className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-2 mt-1">
                <p className="text-xl font-semibold text-foreground tracking-tight">{copy.session.expiredTitle}</p>
                <p className="text-lg leading-relaxed text-foreground/80">{copy.session.expiredBody(endedAfter)}</p>
              </div>
            </section>
          </div>
        )}

        <div className="relative overflow-x-clip">
          <UploadNotes />
          <div className="relative mx-auto max-w-3xl space-y-6 px-6 text-center">
            <h1 className="font-serif text-4xl font-medium leading-tight tracking-tight text-foreground md:text-[3.5rem]">
              {isCompare ? copy.upload.headingCompare : copy.upload.heading}
            </h1>
            <p className="text-balance text-xl leading-relaxed text-muted-foreground">
              {isCompare ? copy.upload.leadCompare : copy.upload.lead}
            </p>
            <div className="mt-2 inline-flex items-center gap-3 rounded-full border border-border/80 bg-card px-5 py-2.5 shadow-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {copy.upload.situationLabel}
              </span>
              <span aria-hidden="true" className="h-5 w-px bg-border"></span>
              <span className="font-serif text-lg font-medium text-foreground" data-testid="text-chosen-stage">
                {chosen.label}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="space-y-16" data-testid="form-upload">
          {/* The document card and, under it, the notice: one band, with the plant and the papers in its margins. */}
          <div className="relative space-y-8 overflow-x-clip">
            <UploadPlant />
            <UploadPapers />
            <div className="relative mx-auto max-w-[73rem] px-6">
              <section
                aria-labelledby="documents-heading"
                className="grid gap-5 rounded-2xl border border-border/70 bg-card p-4 shadow-[0_28px_56px_-28px_rgba(31,42,58,0.28)] md:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]"
              >
                <DocumentArt compare={isCompare} className="hidden min-h-[22rem] lg:flex" />
                <div className="flex flex-col justify-center gap-5 p-2 md:p-4 lg:p-6">
                  <h2
                    id="documents-heading"
                    className="text-xs font-semibold uppercase tracking-[0.18em] text-primary"
                  >
                    {isCompare ? copy.upload.documentsHeadingCompare : copy.upload.slots.primary}
                  </h2>
                  <div className="grid gap-6">
                    {slots.map((slot) => (
                      <DocumentSlot
                        key={slot.id}
                        slot={slot}
                        showLabel={isCompare}
                        file={documents[slot.id] ?? null}
                        error={slotErrors[slot.id] ?? null}
                        onFiles={(files) => receiveFiles(slot.id, files)}
                        onClear={() => removeFile(slot.id)}
                        inputRef={(element) => {
                          inputRefs.current[slot.id] = element;
                        }}
                      />
                    ))}
                  </div>
                </div>
              </section>
            </div>

            {/* Retention notice (FR-12): under the file input and above the consent that refers to it, so it is read before
              anything is sent. Choosing a file sends nothing; pressing Continue does, and that comes after the consent. */}
            <div className="relative mx-auto max-w-[66rem] px-6">
              <section
                aria-labelledby="retention-heading"
                data-testid="section-retention"
                className="space-y-6 rounded-2xl border border-border/70 bg-card p-7 shadow-sm md:p-9"
              >
                <div className="flex items-start gap-5 md:items-center">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <ShieldCheck aria-hidden="true" className="h-6 w-6" strokeWidth={1.75} />
                  </div>
                  <h2 id="retention-heading" className="font-serif text-2xl font-medium leading-snug tracking-tight text-foreground md:text-[1.75rem]">
                    {copy.upload.notice.title}
                  </h2>
                </div>
                <ul className="space-y-5 md:pl-[4.25rem]">
                  {copy.upload.notice.points(ttlMinutes).map((point, index) => (
                    <li
                      key={index}
                      className="flex gap-4 text-lg leading-relaxed text-foreground/80"
                      data-testid={`text-retention-point-${index}`}
                    >
                      <span aria-hidden="true" className="mt-1 select-none text-xl font-bold text-primary/60">
                        —
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>

          <section aria-labelledby="samples-heading" className="mx-auto max-w-4xl space-y-8 rounded-3xl border border-border/50 bg-muted/20 p-8 md:p-10">
            <div className="space-y-3 max-w-2xl">
              <h2 id="samples-heading" className="text-2xl font-serif font-medium text-foreground">
                {copy.upload.samples.heading}
              </h2>
              <p className="text-lg text-muted-foreground leading-relaxed">{copy.upload.samples.lead}</p>
            </div>
            <ul className="grid gap-6 sm:grid-cols-2" aria-busy={loadingSample !== null}>
              {SAMPLES.map((sample) => {
                const titleId = `sample-${sample.id}-title`;
                const actionId = `sample-${sample.id}-action`;
                const descriptionId = `sample-${sample.id}-description`;
                return (
                  <li
                    key={sample.id}
                    className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm transition-colors hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <FileText aria-hidden="true" className="h-5 w-5 text-primary" />
                      </div>
                      <h3 id={titleId} className="text-lg font-semibold text-foreground pt-1.5">
                        {sample.title}
                      </h3>
                    </div>
                    <p id={descriptionId} className="flex-1 text-base text-muted-foreground leading-relaxed pl-14">
                      {sample.description}
                    </p>
                    <div className="pl-14 pt-2">
                       <button
                         type="button"
                         onClick={() => loadSample(sample)}
                         disabled={loadingSample !== null}
                         aria-labelledby={`${actionId} ${titleId}`}
                         aria-describedby={descriptionId}
                         className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border-2 border-border bg-background px-5 text-base font-semibold text-foreground transition-colors hover:border-primary/60 hover:text-primary disabled:opacity-50 disabled:pointer-events-none ${focusRing}`}
                         data-testid={`button-sample-${sample.id}`}
                       >
                         <span id={actionId}>{copy.upload.samples.use}</span>
                       </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p
              aria-live="polite"
              className={
                sampleStatus
                  ? sampleStatus.isError
                    ? "flex items-start gap-3 text-lg font-medium text-destructive bg-destructive/5 p-4 rounded-xl border border-destructive/20"
                    : "flex items-start gap-3 text-lg font-medium text-primary bg-primary/5 p-4 rounded-xl border border-primary/20"
                  : "sr-only"
              }
              data-testid="status-sample"
            >
              {sampleStatus?.isError && (
                <AlertCircle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0" />
              )}
              {sampleStatus?.text ?? ""}
            </p>
          </section>

          <section aria-label={copy.upload.consent.sectionLabel} className="mx-auto max-w-2xl space-y-8 border-t border-border/80 pt-12">
            <div className="space-y-4">
              <label
                htmlFor="consent"
                className={cn(
                  "flex items-start gap-5 cursor-pointer rounded-2xl border-2 p-6 transition-colors shadow-sm",
                  consent ? "border-primary bg-primary/[0.02]" : "border-border bg-card hover:border-primary/40"
                )}
              >
                <div className="relative flex items-center justify-center pt-1">
                   <input
                     id="consent"
                     ref={consentRef}
                     type="checkbox"
                     checked={consent}
                     onChange={(event) => {
                       setConsent(event.currentTarget.checked);
                       if (event.currentTarget.checked) setConsentError(null);
                     }}
                     aria-describedby={consentError ? "consent-error" : undefined}
                     aria-invalid={consentError ? true : undefined}
                     className="peer sr-only"
                     data-testid="checkbox-consent"
                   />
                   <div
                     aria-hidden="true"
                     className={cn(
                       "flex h-7 w-7 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                       consent ? "border-primary bg-primary" : "border-border bg-background",
                     )}
                   >
                      {consent && <Check className="h-5 w-5 text-primary-foreground" />}
                   </div>
                </div>
                <span className="text-xl text-foreground font-medium leading-relaxed">
                  {copy.upload.consent.label}
                </span>
              </label>
              
              {consentError && (
                <p
                  id="consent-error"
                  role="alert"
                  className="flex items-start gap-3 text-lg font-medium text-destructive bg-destructive/5 p-4 rounded-xl border border-destructive/20"
                  data-testid="text-error-consent"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0" />
                  <span>{consentError}</span>
                </p>
              )}
            </div>

            {uploadError && (
              <p
                ref={uploadErrorRef}
                tabIndex={-1}
                role="alert"
                className={`flex items-start gap-3 rounded-2xl border-2 border-destructive/40 bg-destructive/[0.02] p-6 text-lg font-medium text-foreground ${focusRing}`}
                data-testid="text-error-upload"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
                <span>{uploadError}</span>
              </p>
            )}

            <div className="flex flex-col items-center gap-4 pt-4">
              <button
                type="submit"
                aria-disabled={uploading}
                aria-describedby={uploading ? "upload-progress" : undefined}
                className={`inline-flex min-h-[64px] w-full max-w-sm items-center justify-center gap-3 rounded-2xl bg-primary px-8 text-xl font-semibold text-primary-foreground transition-colors hover:bg-primary/90 hover:shadow-lg aria-disabled:opacity-70 ${focusRing}`}
                data-testid="button-continue"
              >
                {uploading ? (
                  <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin motion-reduce:animate-none" />
                ) : null}
                {uploading ? copy.upload.uploading : copy.upload.continue}
                {uploading ? null : <ArrowRight aria-hidden="true" className="h-6 w-6" />}
              </button>
              <p id="upload-progress" aria-live="polite" className={uploading ? "text-base font-medium text-primary" : "sr-only"} data-testid="status-upload">
                {uploading ? copy.upload.uploadingNote : ""}
              </p>
            </div>
          </section>
        </form>
      </main>

      <SiteFooter />
    </div>
  );
}
