import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { ConcernId } from "@workspace/resources";

/**
 * A link to the official-help screen that records where it was pressed, so
 * that screen's back link can return there. The route is open from every
 * screen, so the record is the only way it knows. A `concern` opens the
 * screen on that list; without one the screen picks its own.
 */
export function HelpLink({
  children,
  className,
  concern,
  testId,
}: {
  children: ReactNode;
  className?: string;
  concern?: ConcernId;
  testId: string;
}) {
  const [location] = useLocation();
  const alreadyThere = location === "/help";
  return (
    <Link
      href={concern === undefined ? "/help" : `/help?concern=${concern}`}
      state={{ from: location }}
      aria-current={alreadyThere ? "page" : undefined}
      data-testid={testId}
      className={className}
    >
      {children}
    </Link>
  );
}
