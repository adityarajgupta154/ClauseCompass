import { useEffect, useReducer, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { useJourney } from "@/features/journey/journey-context";

/**
 * The journey belongs to the reader who is signed in. When that reader goes
 * (signed out from another tab, a lapsed sign-in) or changes, nothing of
 * their document may stay in this browser for whoever comes next, and no
 * screen may show it in the meantime: the routes render nothing for the one
 * commit it takes to forget, then carry on for the new state. The first
 * resolved sign-in is the baseline, so restoring a persisted sign-in at boot
 * forgets nothing; and arriving signed-in after being signed out forgets
 * nothing either (there was no reader to forget, and the situation chosen on
 * the Welcome screen on the way to sign-in must survive).
 */
export function PrincipalBoundary({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const { forgetReader } = useJourney();
  // undefined while the persisted sign-in is being restored; null when signed out.
  const uid = state.status === "signed-in" ? state.user.uid : state.status === "signed-out" ? null : undefined;
  const [known, remember] = useReducer(
    (_previous: string | null | undefined, current: string | null | undefined) => current,
    uid,
  );
  const leaving = known !== undefined && known !== null && uid !== undefined && uid !== known;

  // Deliberately after the commit, not during render: the journey must be forgotten (an update outside this component) before the
  // children are let back in for the new reader, and nothing of the old reader's may render in between. One extra render, on purpose.
  useEffect(() => {
    if (uid === undefined || uid === known) return;
    if (known !== undefined && known !== null) forgetReader();
    remember(uid);
  }, [uid, known, forgetReader]);

  if (leaving) return null;
  return <>{children}</>;
}
