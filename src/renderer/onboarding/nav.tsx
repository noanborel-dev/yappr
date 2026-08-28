import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react'

// Enter advances the onboarding, everywhere.
//
// The flow teaches by making you do things — hold a key, talk, watch text
// land — and every one of those screens ended by asking you to find and
// click a Continue button with the mouse. That is a different input device
// for every transition, in a flow whose entire subject is the keyboard.
//
// So Enter moves you on, from every screen, and a large keycap shows it
// being tapped so nobody has to be told.
//
// READINESS IS THE STEP'S CALL, not the shell's. MicStep should not
// advance before it has heard anything; KeyStep should not advance without
// a bound key. The shell cannot know those rules, so each step declares
// when Enter is live and the shell owns the listener and the cue. One
// listener, not nine — a per-step listener would keep firing during the
// exit animation and skip the screen after it.

interface NavValue {
  next: () => void
  /**
   * Declare whether Enter should advance from the current step.
   *
   * Call it from an effect, not from render. It sets state on the shell.
   */
  setReady: (ready: boolean) => void
}

const NavContext = createContext<NavValue>({
  next: () => {},
  setReady: () => {},
})

export function OnboardingNavProvider({
  value,
  children,
}: {
  value: NavValue
  children: ReactNode
}) {
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useOnboardingNav(): NavValue {
  return useContext(NavContext)
}

/**
 * Declare that Enter should advance from this step while `ready` is true.
 *
 * Steps that are always skippable pass `true` once. Steps with a gate pass
 * the same condition their Continue button is disabled by, so the two can
 * never disagree — a keyboard route that works when the button is greyed
 * out is worse than no keyboard route.
 */
export function useAdvanceOnEnter(ready: boolean): void {
  const { setReady } = useOnboardingNav()
  useEffect(() => {
    setReady(ready)
    // Clear on unmount so the next step starts closed and has to open its
    // own gate. Without this, a step that never calls in would inherit the
    // previous screen's answer.
    return () => setReady(false)
  }, [ready, setReady])
}
