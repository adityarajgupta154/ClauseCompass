import { useState } from "react";
import { Link, useLocation } from "wouter";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import { copy } from "@/features/journey/copy";
import { useJourney } from "@/features/journey/journey-context";
import { focusRing } from "@/lib/focus-ring";

/**
 * The header's account control: a link to sign in, or the reader's name
 * with a sign-out button. Signing out ends the open session first, while
 * the token that can end it is still there (a session nobody can reach
 * would otherwise sit in memory until the retention window passes), then
 * clears the journey and returns to the start. Nothing renders while the
 * persisted sign-in is still being restored, so a signed-in reader never
 * sees "Sign in" flash.
 *
 * Below sm the two buttons are their icon alone (the label stays for
 * assistive technology): the brand and the settings menu take the rest of a
 * phone's one header row.
 */

/** The two buttons share a size; the sign-in one is filled in the primary colour, the sign-out one outlined. */
const buttonClass = `inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl px-0 py-2 text-base font-semibold transition-colors aria-disabled:opacity-70 sm:px-4 ${focusRing}`;

export function AuthControl({ className = "" }: { className?: string }) {
  const words = copy.auth.header;
  const { state, client } = useAuth();
  const { session, deleteSession, reset } = useJourney();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);

  if (state.status === "loading") return null;

  if (state.status === "signed-out") {
    return (
      <Link href="/sign-in" className={`${buttonClass} bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 ${className}`} data-testid="link-sign-in">
        <LogIn className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{words.signIn}</span>
      </Link>
    );
  }

  const name = state.user.displayName ?? state.user.email ?? state.user.uid;

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      if (session !== null) {
        try {
          await deleteSession();
        } catch (error) {
          // The server could not confirm the delete; the session ends by itself when the window passes. Sign out regardless: nothing here can reach it any more.
          console.warn("sign-out: the session could not be deleted first", error);
          reset();
        }
      } else {
        reset();
      }
      await client.signOut();
      navigate("/");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`flex min-w-0 items-center gap-x-2 ${className}`}>
      {/* Who is signed in, always for assistive technology; on screen from lg up, where the one row has room for it beside the brand and a back link. */}
      <span className="sr-only" data-testid="text-signed-in">
        {words.signedInAs(name)}
      </span>
      <span className="hidden min-w-0 items-center gap-2 px-1 text-base text-muted-foreground lg:inline-flex" aria-hidden="true">
        <UserRound className="h-5 w-5 shrink-0" />
        <span className="max-w-[12rem] truncate">{name}</span>
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        aria-disabled={busy || undefined}
        className={`${buttonClass} border border-border bg-card text-foreground hover:border-primary/50 hover:text-primary`}
        data-testid="button-sign-out"
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">{busy ? words.signingOut : words.signOut}</span>
      </button>
    </div>
  );
}
