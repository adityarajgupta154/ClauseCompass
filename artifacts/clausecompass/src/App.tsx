import { lazy, Suspense, use, useEffect, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AuthProvider } from '@/features/auth/auth-context';
import { RequireAuth } from '@/features/auth/require-auth';
import { PrincipalBoundary } from '@/features/auth/principal-boundary';
import { useDisplay } from '@/features/display/use-display';
import { JourneyProvider } from '@/features/journey/journey-context';
import { RequireDocuments } from '@/features/journey/require-documents';
import { RequireEscalation } from '@/features/journey/require-escalation';
import { RequireNotEscalated } from '@/features/journey/require-not-escalated';
import { RequireStage } from '@/features/journey/require-stage';
import { focusScreen, RouteFocus, ScreenLoading } from '@/features/journey/route-focus';
import { preloadScreens, screens, type Screen } from '@/features/journey/screens';
import { DocumentHead } from '@/features/seo/document-head';
import NotFound from '@/pages/not-found';
import SafetyPage from '@/pages/safety';
import Welcome from '@/pages/welcome';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

// The screens fetched on first use (features/journey/screens.ts says which and why).
const Upload = lazyScreen(screens.upload);
const Interview = lazyScreen(screens.interview);
const DocumentMapPage = lazyScreen(screens.map);
const ReviewPromptsPage = lazyScreen(screens.review);
const ComparePage = lazyScreen(screens.compare);
const PacketPage = lazyScreen(screens.packet);
const OfficialHelpPage = lazyScreen(screens.help);
const SignInPage = lazyScreen(screens.signIn);

/**
 * A screen fetched on first use: rendered at once when its code is here
 * (a route change to it is then like any other), and awaited behind the
 * Suspense fallback in JourneyRoutes when it is not.
 */
function lazyScreen(screen: Screen): ComponentType {
  return function LazyScreen() {
    const Loaded = screen.peek() ?? use(screen.load()).default;
    return <Loaded />;
  };
}

// Component gallery on hardcoded data; the whole branch is dead code in production builds.
const SourceCardDemo = import.meta.env.DEV
  ? lazy(() => import('@/pages/dev/source-card-demo'))
  : null;

/** The route table, exported so the mounted journey can be driven in tests with a memory location. */
export function JourneyRoutes() {
  // A language change re-renders every screen in place (no remount: focus and
  // form state survive); each render reads the current copy table.
  useDisplay();
  return (
    <>
      {/* Keep a shared shell (sidebar, navbar) outside the boundary so it
          survives a page crash. */}
      <RoutedErrorBoundary>
        {/* While a screen's file is fetched: one quiet line, which also completes the route change's focus when the screen arrives (ScreenLoading). */}
        <Suspense fallback={<ScreenLoading />}>
          <Switch>
            {/* Once the flow has escalated every route but the safety screen and the helplines yields to it (RequireNotEscalated, outermost); "Start again" on that screen resets the flow before it comes back here. */}
            <Route path="/">
              <RequireNotEscalated>
                <Welcome />
              </RequireNotEscalated>
            </Route>
            {/* The journey from the upload on needs a signed-in reader (RequireAuth, inside RequireStage: a visitor with no stage goes back to the start, not to sign-in). */}
            <Route path="/upload">
              <RequireNotEscalated>
                <RequireStage>
                  <RequireAuth>
                    <Upload />
                  </RequireAuth>
                </RequireStage>
              </RequireNotEscalated>
            </Route>
            <Route path="/interview">
              <RequireNotEscalated>
                <RequireStage>
                  <RequireAuth>
                    <RequireDocuments>
                      <Interview />
                    </RequireDocuments>
                  </RequireAuth>
                </RequireStage>
              </RequireNotEscalated>
            </Route>
            <Route path="/map">
              <RequireNotEscalated>
                <RequireStage>
                  <RequireAuth>
                    <RequireDocuments>
                      <DocumentMapPage />
                    </RequireDocuments>
                  </RequireAuth>
                </RequireStage>
              </RequireNotEscalated>
            </Route>
            <Route path="/review">
              <RequireNotEscalated>
                <RequireStage>
                  <RequireAuth>
                    <RequireDocuments>
                      <ReviewPromptsPage />
                    </RequireDocuments>
                  </RequireAuth>
                </RequireStage>
              </RequireNotEscalated>
            </Route>
            <Route path="/compare">
              <RequireNotEscalated>
                <RequireStage>
                  <RequireAuth>
                    <RequireDocuments>
                      <ComparePage />
                    </RequireDocuments>
                  </RequireAuth>
                </RequireStage>
              </RequireNotEscalated>
            </Route>
            <Route path="/packet">
              <RequireNotEscalated>
                <RequireStage>
                  <RequireAuth>
                    <RequireDocuments>
                      <PacketPage />
                    </RequireDocuments>
                  </RequireAuth>
                </RequireStage>
              </RequireNotEscalated>
            </Route>
            {/* Sign-in: reached from the gate above, and open to anyone who wants to sign in before choosing a document. */}
            <Route path="/sign-in">
              <RequireNotEscalated>
                <SignInPage />
              </RequireNotEscalated>
            </Route>
            {/* The safety-escalation screen (PRD §8): the only screen of an escalated flow, and no screen otherwise. */}
            <Route path="/safety">
              <RequireEscalation>
                <SafetyPage />
              </RequireEscalation>
            </Route>
            {/* Open from anywhere, session or not: a helpline is needed when it is needed. */}
            <Route path="/help" component={OfficialHelpPage} />
            {SourceCardDemo && (
              <Route path="/dev/source-card">
                <RequireNotEscalated>
                  <SourceCardDemo />
                </RequireNotEscalated>
              </Route>
            )}
            <Route>
              <RequireNotEscalated>
                <NotFound />
              </RequireNotEscalated>
            </Route>
          </Switch>
        </Suspense>
      </RoutedErrorBoundary>
      {/* After the routes, so a screen's own arrival focus runs first and is respected. */}
      <RouteFocus />
      <DocumentHead />
    </>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  // A crash and a "Try again" both replace what had focus at the same location, where RouteFocus does not act.
  return (
    <ErrorBoundary resetKey={location} onErrorStateChange={focusScreen}>
      {children}
    </ErrorBoundary>
  );
}

/**
 * A little after the first screen has loaded, the code for the others is
 * fetched in the background, so that a reader who chooses a stage finds the
 * next screen on hand. Not sooner: the first paint and the reader's first
 * interaction come before anything the reader has not asked for.
 */
function usePreloadScreens() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timer = setTimeout(() => void preloadScreens().catch(() => undefined), 2500);
    };
    if (document.readyState === 'complete') schedule();
    else window.addEventListener('load', schedule, { once: true });
    return () => {
      window.removeEventListener('load', schedule);
      if (timer !== null) clearTimeout(timer);
    };
  }, []);
}

function App() {
  usePreloadScreens();
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <AuthProvider>
          <JourneyProvider>
            <PrincipalBoundary>
              <JourneyRoutes />
            </PrincipalBoundary>
          </JourneyProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
