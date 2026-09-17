import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLocation, useSearch } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  FileText,
  FolderLock,
  KeyRound,
  Lightbulb,
  LockKeyhole,
  Mail,
  MailCheck,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import heroArt from "@/assets/hero-art-1024.webp";
import { MarginAside } from "@/components/margin-aside";
import { SiteHeader } from "@/components/site-header";
import { SkipLink } from "@/components/skip-link";
import { useAuth } from "@/features/auth/auth-context";
import { SignInError, type SignInReason } from "@/features/auth/auth-client";
import { GoogleMark } from "@/features/auth/google-mark";
import { nextPathFrom } from "@/features/auth/require-auth";
import { copy } from "@/features/journey/copy";
import { useScreenTitle } from "@/features/seo/screen-title";
import { INK, STICKY_NOTE } from "@/lib/artwork";
import { focusRing } from "@/lib/focus-ring";

/**
 * The sign-in screen: one Google button and one e-mail form that signs in,
 * creates an account or sends a password reset, by what the reader asked
 * for. A signed-in reader (already, or just now) is sent on to `next`, one
 * of the gated screens; the upload screen by default.
 *
 * Set like the welcome banner: the words on the left (a short line over the
 * heading, the heading, the lead, three points), the form in a card on the
 * right, over the banner's desk washed back to paper. The heading, the lead
 * and the points change with the mode, so the screen reads as the thing the
 * reader chose to do; switching modes moves focus to the heading and
 * re-titles the tab for the same reason.
 */

type Mode = "signIn" | "create" | "reset";

/** The one problem the form shows: a field left empty, or what the provider answered. */
type Problem = "emailRequired" | "passwordRequired" | SignInReason;

/** The icons beside the three points, in the order of `copy.auth.signIn.points`; the reset form keeps the sign-in points. */
const POINT_ICONS: Record<"signIn" | "create", [LucideIcon, LucideIcon, LucideIcon]> = {
  signIn: [ShieldCheck, FileText, Users],
  create: [FolderLock, Lightbulb, ShieldCheck],
};

const fieldClass = `block w-full rounded-2xl border-2 border-border bg-background py-3 pl-12 pr-4 text-lg leading-relaxed text-foreground transition-colors placeholder:text-muted-foreground/80 hover:border-primary/40 aria-[invalid=true]:border-destructive ${focusRing}`;
const fieldIconClass = "pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground";
const labelClass = "block text-lg font-medium text-foreground";
const primaryButtonClass = `inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-primary px-6 text-lg font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 hover:shadow-md aria-disabled:opacity-70 ${focusRing}`;
const secondaryButtonClass = `inline-flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-border bg-background px-6 text-lg font-semibold text-foreground transition-colors hover:border-primary/60 hover:bg-primary/5 aria-disabled:opacity-70 ${focusRing}`;
const switchClass = `inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-base font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80 aria-disabled:opacity-70 ${focusRing}`;

export default function SignInPage() {
  const words = copy.auth.signIn;
  const errors = copy.auth.errors;
  const { state, client } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = nextPathFrom(search);

  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordShown, setPasswordShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // Numbered so a repeat of the same problem still re-renders the alert and moves focus to it.
  const [problem, setProblem] = useState<{ reason: Problem; seq: number } | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  // Counts the reader's mode switches, so focus moves to the heading on each one and not on arrival.
  const [switches, setSwitches] = useState(0);

  // Set the moment a request starts, before React renders `busy`: a second press in that gap must not start another.
  const running = useRef(false);

  const ids = { email: useId(), password: useId(), hint: useId(), error: useId() };
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const statusRef = useRef<HTMLParagraphElement | null>(null);

  // Signed in, already or just now: on to the screen the reader was heading for.
  useEffect(() => {
    if (state.status === "signed-in") navigate(next, { replace: true });
  }, [state.status, next, navigate]);

  // The provider's own code loads now rather than at the first press; a sign-in the browser still holds is found the same way.
  useEffect(() => {
    client.prepare();
  }, [client]);

  useEffect(() => {
    if (problem !== null) errorRef.current?.focus();
  }, [problem]);

  const report = (reason: Problem) => setProblem((previous) => ({ reason, seq: (previous?.seq ?? 0) + 1 }));

  useEffect(() => {
    if (resetSentTo !== null) statusRef.current?.focus();
  }, [resetSentTo]);

  // The heading now says what the form does, so a switch announces itself there; the control pressed has gone from the page.
  useEffect(() => {
    if (switches > 0) headingRef.current?.focus();
  }, [switches]);

  function switchTo(target: Mode) {
    // Not while a request runs: its answer belongs to the form that sent it.
    if (running.current) return;
    setMode(target);
    setProblem(null);
    setResetSentTo(null);
    setPasswordShown(false);
    setSwitches((count) => count + 1);
  }

  // One request at a time: the buttons stay in the page while one runs (aria-disabled, so focus is kept), so the lock is here.
  async function attempt(run: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setProblem(null);
    setResetSentTo(null);
    try {
      await run();
    } catch (error) {
      const reason = error instanceof SignInError ? error.reason : "unknown";
      if (reason === "unknown" || reason === "not-configured") console.error(error);
      report(reason);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running.current) return;
    const address = email.trim();
    if (address === "") {
      report("emailRequired");
      return;
    }
    if (mode !== "reset" && password === "") {
      report("passwordRequired");
      return;
    }
    void attempt(async () => {
      if (mode === "signIn") await client.signInWithEmail(address, password);
      else if (mode === "create") await client.createAccount(address, password);
      else {
        await client.sendPasswordReset(address);
        setResetSentTo(address);
      }
    });
  }

  const reason = problem?.reason ?? null;
  const emailInvalid = reason === "emailRequired" || reason === "bad-email" || reason === "no-account" || reason === "email-in-use";
  const passwordInvalid = reason === "passwordRequired" || reason === "wrong-password" || reason === "weak-password";
  const describedBy = (invalid: boolean, ...others: string[]) => [...(invalid ? [ids.error] : []), ...others].join(" ") || undefined;

  // The words for the mode; only the create heading ends in the accent colour.
  const modeWords: { eyebrow: string; heading: string; accent?: string; lead: string } = words.modes[mode];
  const pointsKey = mode === "create" ? "create" : "signIn";
  const points = words.points[pointsKey];

  // The tab is titled by the heading on show; the route's own title is the sign-in heading, so only the other two modes set one.
  const heading = modeWords.accent === undefined ? modeWords.heading : `${modeWords.heading} ${modeWords.accent}`;
  useScreenTitle(mode === "signIn" ? null : heading.replace(/\.$/, ""));

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background font-sans selection:bg-primary/20 selection:text-foreground">
      <SkipLink />
      <SiteHeader back={{ href: "/", label: words.back, testId: "link-back-home" }} account={false} />

      {/* Its own stacking context, so the picture and its wash can sit under the words with negative z-indexes. */}
      <main id="main" className="relative isolate flex flex-1 flex-col overflow-hidden">
        {/* The welcome banner's desk, from md where there is room to see it, faded towards the words' side so they read; a phone gets the plain page. */}
        <img
          src={heroArt}
          alt=""
          width={1024}
          height={853}
          decoding="async"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-20 hidden h-full w-full select-none object-cover object-[50%_70%] saturate-[0.9] md:block"
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 hidden bg-gradient-to-r from-background/95 via-background/80 to-background/55 md:block"></div>
        <div aria-hidden="true" className="absolute inset-0 -z-10 hidden bg-gradient-to-b from-background/60 via-transparent to-background/40 md:block"></div>

        {/* Two of the banner's notes, in the page margins on a wide screen: one in a hand beside the points, one on a sticky note beside the card. */}
        <MarginAside side="left" beside="60rem" from="10rem">
          <p className="absolute left-[12%] top-[26rem] w-[78%] -rotate-[8deg] font-hand text-[max(13cqw,12px)] font-semibold leading-[1.12] text-foreground/80">
            {copy.welcome.hero.notes.first}
            <svg viewBox="0 0 40 24" className="ml-[55%] mt-[0.2em] h-[1.2em] w-[2em] overflow-visible">
              <path d="M2 2C10 4 20 10 34 20M28 20l6 0 0-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </p>
        </MarginAside>
        <MarginAside side="right" beside="60rem" from="10rem">
          {/* Paper in both colour schemes, so the writing on it is ink. */}
          <div
            style={{ backgroundColor: STICKY_NOTE, color: INK }}
            className="absolute right-[14%] top-[7rem] aspect-square w-[8.5rem] rotate-[5deg] rounded-sm p-4 shadow-[0_14px_24px_-10px_rgba(31,42,58,0.35)]"
          >
            <p className="font-hand text-[1.2rem] font-semibold leading-[1.15]">{copy.welcome.hero.notes.second}</p>
          </div>
        </MarginAside>

        {/* The words, then the card, then the points: one column in that order up to lg; from lg the words and the points share the left column and the card takes the right one, both rows tall. */}
        <div className="relative mx-auto grid w-full max-w-[36rem] flex-1 content-start gap-10 px-6 py-10 md:py-14 lg:max-w-[60rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10 lg:py-16">
          {/* A container: the heading is sized to the column it sits in. */}
          <header className="@container space-y-5 lg:col-start-1 lg:row-start-1">
            <p className="flex items-center gap-3 text-[0.8125rem] font-semibold uppercase tracking-[0.18em] text-primary">
              <span aria-hidden="true" className="h-px w-9 shrink-0 bg-primary"></span>
              {modeWords.eyebrow}
            </p>
            {/* Focusable so a mode switch lands here; it is otherwise not in the Tab order. */}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className={`font-serif text-[clamp(2.25rem,11cqw,3.5rem)] font-medium leading-[1.08] tracking-tight text-foreground ${focusRing}`}
              data-testid="text-sign-in-heading"
            >
              {modeWords.heading}
              {modeWords.accent !== undefined && <span className="text-primary"> {modeWords.accent}</span>}
            </h1>
            <p className="max-w-[34rem] text-lg leading-relaxed text-muted-foreground">{modeWords.lead}</p>
          </header>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="rounded-3xl border border-border/70 bg-card/95 p-6 shadow-[0_28px_60px_-24px_rgba(31,42,58,0.38)] backdrop-blur-sm md:p-8">
              {/* While a sign-in the browser still holds is being restored, the card waits: the reader is about to be sent on, or the form appears. */}
              {state.status === "loading" ? null : state.status === "signed-in" ? (
                <p role="status" className="text-lg text-muted-foreground" data-testid="status-sign-in-done">
                  {words.done}
                </p>
              ) : (
                <div className="space-y-6">
                  <button
                    type="button"
                    onClick={() => void attempt(() => client.signInWithGoogle())}
                    aria-disabled={busy || undefined}
                    className={secondaryButtonClass}
                    data-testid="button-sign-in-google"
                  >
                    <GoogleMark className="h-6 w-6 shrink-0" />
                    {busy ? words.working : words.google}
                  </button>

                  <div className="flex items-center gap-4" aria-hidden="true">
                    <span className="h-px flex-1 bg-border"></span>
                    <span className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">{words.or}</span>
                    <span className="h-px flex-1 bg-border"></span>
                  </div>

                  <form onSubmit={submit} noValidate className="space-y-5" data-testid="form-sign-in">
                    {reason !== null && (
                      <p
                        id={ids.error}
                        ref={errorRef}
                        tabIndex={-1}
                        role="alert"
                        className={`flex items-start gap-3 rounded-2xl border-2 border-destructive/40 bg-destructive/[0.02] p-5 text-lg font-medium text-foreground ${focusRing}`}
                        data-testid="text-error-sign-in"
                      >
                        <AlertCircle aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />
                        <span>{errors[reason]}</span>
                      </p>
                    )}
                    {resetSentTo !== null && (
                      <p
                        ref={statusRef}
                        tabIndex={-1}
                        role="status"
                        className={`flex items-start gap-3 rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 text-lg font-medium text-foreground ${focusRing}`}
                        data-testid="status-sign-in"
                      >
                        <MailCheck aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                        <span>{words.resetSent(resetSentTo)}</span>
                      </p>
                    )}

                    <div className="space-y-2">
                      <label htmlFor={ids.email} className={labelClass}>
                        {words.email}
                      </label>
                      <div className="relative">
                        <Mail aria-hidden="true" className={fieldIconClass} />
                        <input
                          id={ids.email}
                          type="email"
                          name="email"
                          autoComplete="email"
                          inputMode="email"
                          placeholder={words.emailPlaceholder}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          aria-invalid={emailInvalid || undefined}
                          aria-describedby={describedBy(emailInvalid)}
                          className={fieldClass}
                          data-testid="input-email"
                        />
                      </div>
                    </div>

                    {mode !== "reset" && (
                      <div className="space-y-2">
                        <label htmlFor={ids.password} className={labelClass}>
                          {words.password}
                        </label>
                        <div className="relative">
                          <LockKeyhole aria-hidden="true" className={fieldIconClass} />
                          <input
                            id={ids.password}
                            type={passwordShown ? "text" : "password"}
                            name="password"
                            autoComplete={mode === "create" ? "new-password" : "current-password"}
                            placeholder={words.passwordPlaceholder[mode]}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            aria-invalid={passwordInvalid || undefined}
                            aria-describedby={describedBy(passwordInvalid, ...(mode === "create" ? [ids.hint] : []))}
                            className={`${fieldClass} pr-14`}
                            data-testid="input-password"
                          />
                          {/* Shows the password as typed; a toggle, so its pressed state says which way it is. */}
                          <button
                            type="button"
                            onClick={() => setPasswordShown((shown) => !shown)}
                            aria-pressed={passwordShown}
                            aria-label={passwordShown ? words.hidePassword : words.showPassword}
                            aria-controls={ids.password}
                            className={`absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground ${focusRing}`}
                            data-testid="button-toggle-password"
                          >
                            {passwordShown ? <EyeOff aria-hidden="true" className="h-5 w-5" /> : <Eye aria-hidden="true" className="h-5 w-5" />}
                          </button>
                        </div>
                        {mode === "create" && (
                          <p id={ids.hint} className="text-base text-muted-foreground">
                            {words.passwordHint}
                          </p>
                        )}
                      </div>
                    )}

                    <button type="submit" aria-disabled={busy || undefined} className={primaryButtonClass} data-testid="button-sign-in-submit">
                      <KeyRound className="h-6 w-6" aria-hidden="true" />
                      {busy ? words.working : words.submit[mode]}
                    </button>

                    {mode === "signIn" ? (
                      <div className="flex flex-col items-start gap-y-0.5">
                        <button type="button" onClick={() => switchTo("create")} aria-disabled={busy || undefined} className={switchClass} data-testid="button-mode-create">
                          {words.toCreate}
                        </button>
                        <button type="button" onClick={() => switchTo("reset")} aria-disabled={busy || undefined} className={switchClass} data-testid="button-mode-reset">
                          {words.toReset}
                        </button>
                      </div>
                    ) : mode === "create" ? (
                      <p className="flex flex-wrap items-center justify-center gap-x-1 text-center text-base text-muted-foreground">
                        {words.toSignIn.question}
                        <button type="button" onClick={() => switchTo("signIn")} aria-disabled={busy || undefined} className={switchClass} data-testid="button-mode-sign-in">
                          {words.toSignIn.action}
                          <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </p>
                    ) : (
                      <div className="flex justify-center">
                        <button type="button" onClick={() => switchTo("signIn")} aria-disabled={busy || undefined} className={switchClass} data-testid="button-mode-sign-in">
                          {words.toSignInFromReset}
                        </button>
                      </div>
                    )}
                  </form>

                  {/* What signing in does not change (FR-12), under a rule at the card's foot. */}
                  <p className="flex items-start gap-3 border-t border-border/70 pt-5 text-base leading-relaxed text-muted-foreground" data-testid="text-sign-in-note">
                    <LockKeyhole aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" />
                    <span>{words.note}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* The three points: an icon in a disc, a title, one line. Under the lead from lg, under the card before that. */}
          <ul className="space-y-5 lg:col-start-1 lg:row-start-2 lg:self-start">
            {points.map(({ title, line }, index) => {
              const Icon = POINT_ICONS[pointsKey][index];
              return (
                <li key={title} className="flex items-start gap-4" data-testid={`text-sign-in-point-${index}`}>
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <Icon className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <span className="flex flex-col gap-1 pt-0.5">
                    <span className="text-lg font-semibold leading-snug text-foreground">{title}</span>
                    <span className="text-base leading-relaxed text-muted-foreground">{line}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </main>
    </div>
  );
}
