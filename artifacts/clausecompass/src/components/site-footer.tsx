import { useState } from "react";
import { useLocation } from "wouter";
import { AlertCircle, ArrowRight, LoaderCircle, Phone, Trash2 } from "lucide-react";
import { FooterBranch, FooterDesk } from "@/components/footer-aside";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { HelpLink } from "@/features/resources/help-link";
import { focusRing } from "@/lib/focus-ring";
import { cn } from "@/lib/utils";

/**
 * Shared footer: the boundary reminder that every screen carries, the way to
 * the official-help screen (FR-10), and, while a session exists, the FR-12
 * delete control. The control is here so it is reachable from every screen
 * of the journey without hunting for it; it asks the server to delete the
 * session and everything prepared in it, clears this browser's copy, and
 * returns to the start with a confirmation. A delete the server could not
 * confirm is reported as such, with the control still there to try again;
 * the session's own expiry is the fallback either way.
 *
 * The way to official help is set as a short section of its own — a label,
 * a heading, a line and the link — rather than a bare link, so a reader who
 * scrolls to the end of any screen finds it named. On the official-help
 * screen itself the section is left out, heading and all; the boundary line
 * stays. The band is set like a sheet of paper (a warm tint with a faint
 * grain) and, on a wide screen, the section's own margins carry the
 * decorations; the delete control sits above that zone so the pictures keep
 * to the section they belong with whatever else the footer holds.
 */
export function SiteFooter({ className }: { className?: string }) {
  const { session, deleteSession } = useJourney();
  const [location] = useLocation();
  const onHelpScreen = location === "/help";
  return (
    <footer
      className={cn(
        "relative mt-auto w-full overflow-x-clip border-t border-border/60 bg-secondary/45 px-6 pt-10 md:pt-12 print:border-0 print:bg-transparent",
        className,
      )}
    >
      <span aria-hidden="true" className="paper-grain pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-multiply print:hidden dark:opacity-[0.05]"></span>
      {session !== null && (
        <div className="relative mb-10 md:mb-12">
          <DeleteControl ttlMinutes={session.ttlMinutes} deleteSession={deleteSession} />
        </div>
      )}
      {/* The official-help section and the boundary line share one full-width zone, whose margins hold the decorations. */}
      <div className="relative -mx-6 px-6 pb-12 md:pb-14">
        {!onHelpScreen && (
          <>
            <FooterBranch />
            <FooterDesk />
            <nav
              aria-labelledby="footer-help-label"
              className="relative mx-auto flex max-w-3xl flex-col items-center text-center print:hidden"
            >
              <p
                id="footer-help-label"
                className="flex items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary"
              >
                <span aria-hidden="true" className="h-px w-8 bg-primary/70"></span>
                {copy.footer.helpLabel}
                <span aria-hidden="true" className="h-px w-8 bg-primary/70"></span>
              </p>
              <h2 className="mt-4 font-serif text-[1.75rem] font-medium leading-tight tracking-tight text-foreground md:text-[2.125rem]">
                {copy.resources.entry.footer}
              </h2>
              <p className="mt-4 text-balance text-lg leading-relaxed text-muted-foreground" data-testid="text-footer-help-lead">
                {copy.footer.helpLead}
              </p>
              <HelpLink
                testId="link-footer-official-help"
                className={`mt-8 inline-flex min-h-[3.5rem] items-center justify-center gap-3 rounded-full border border-primary/50 bg-card py-2 pl-2.5 pr-6 text-base font-semibold text-primary shadow-sm transition-colors hover:border-primary hover:bg-primary/5 ${focusRing}`}
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Phone className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span>{copy.resources.entry.footer}</span>
                <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
              </HelpLink>
            </nav>
          </>
        )}
        <div className={cn("relative mx-auto flex max-w-3xl flex-col items-center", !onHelpScreen && "mt-10")}>
          <div aria-hidden="true" className="mb-5 h-px w-14 bg-border print:hidden"></div>
          <p
            className="text-center text-sm leading-relaxed text-muted-foreground md:text-base"
            data-testid="text-footer-boundary"
          >
            {copy.footer.line}
          </p>
        </div>
      </div>
    </footer>
  );
}

function DeleteControl({ ttlMinutes, deleteSession }: { ttlMinutes: number; deleteSession: () => Promise<boolean> }) {
  const [, navigate] = useLocation();
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onDelete() {
    if (deleting) return;
    setDeleting(true);
    setFailed(false);
    try {
      if (await deleteSession()) navigate("/");
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center gap-5 text-center print:hidden bg-card border border-border/60 p-8 rounded-3xl shadow-sm" data-testid="section-delete-session">
      <button
        type="button"
        onClick={onDelete}
        aria-disabled={deleting}
        aria-describedby="delete-session-note"
        className={`inline-flex min-h-[48px] items-center justify-center gap-3 rounded-xl border-2 border-border bg-background px-6 text-base font-semibold text-foreground transition-colors hover:border-destructive hover:text-destructive hover:bg-destructive/5 aria-disabled:opacity-70 ${focusRing}`}
        data-testid="button-delete-session"
      >
        {deleting ? (
          <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Trash2 aria-hidden="true" className="h-5 w-5" />
        )}
        {deleting ? copy.session.deleting : copy.session.deleteNow}
      </button>
      <p id="delete-session-note" className="text-sm md:text-base text-muted-foreground leading-relaxed" data-testid="text-delete-session-note">
        {copy.session.note(ttlMinutes)}
      </p>
      <p aria-live="assertive" className={failed ? "flex items-start gap-2 text-left text-base font-medium text-destructive bg-destructive/5 p-3 rounded-xl border border-destructive/20" : "sr-only"} data-testid="text-error-delete-session">
        {failed && <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />}
        {failed ? copy.session.deleteFailed(ttlMinutes) : ""}
      </p>
    </div>
  );
}