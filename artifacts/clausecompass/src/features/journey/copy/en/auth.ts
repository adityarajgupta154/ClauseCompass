import type { SignInPoint } from "../../copy.en";

/** Sign-in (the API opens a document for one signed-in reader): the screen, the header control, and what can go wrong. */
  export const auth = {
    signIn: {
      /**
       * The screen's words by what the form is set to do: sign in, create an
       * account, or reset a password. `accent` is the end of the one heading,
       * set in the accent colour; the heading reads as one sentence.
       */
      modes: {
        signIn: {
          eyebrow: "Welcome to ClauseCompass",
          heading: "Sign in to open your document",
          lead: "ClauseCompass opens a document for the account that uploaded it, so it needs to know which account is yours. A Google account or an email and password will do.",
        },
        create: {
          eyebrow: "Create your account",
          heading: "A clearer understanding",
          accent: "starts here.",
          lead: "An account is how ClauseCompass tells one reader's documents from another's. Create one with an email and a password, or continue with your Google account.",
        },
        reset: {
          eyebrow: "Forgot your password?",
          heading: "Get a reset link by email",
          lead: "Enter the email address of your account. A reset email brings a link to choose a new password; afterwards, sign in here as before.",
        },
      },
      /**
       * Three short points beside the form (the reset form keeps the sign-in
       * points); three exactly, as the screen has an icon for each. Nothing
       * here promises safety or security; each line is something the product
       * does: a document opens for its own account, and ends when the reader
       * deletes it or the retention window passes.
       */
      points: {
        signIn: [
          { title: "Your documents, under your account", line: "Each opens for the account that uploaded it." },
          { title: "A simpler, clearer read", line: "Each clause in plain words, with its source text beside it." },
          { title: "Built for everyday people", line: "Plain language. Brighter decisions." },
        ] as [SignInPoint, SignInPoint, SignInPoint],
        create: [
          { title: "One account, your documents", line: "It is how ClauseCompass tells your documents from another reader's." },
          { title: "Clear explanations", line: "Plain words for every clause, with the source text beside them." },
          { title: "Kept only for a while", line: "A document ends when you delete it, or when the retention window passes." },
        ] as [SignInPoint, SignInPoint, SignInPoint],
      },
      google: "Continue with Google",
      or: "or with email",
      email: "Email",
      emailPlaceholder: "you@example.com",
      password: "Password",
      passwordPlaceholder: { signIn: "Enter your password", create: "Create a password" },
      passwordHint: "At least 6 characters.",
      /** The control at the end of the password field; its name says what pressing it does. */
      showPassword: "Show password",
      hidePassword: "Hide password",
      /** The one button under the form, by what the form is set to do. */
      submit: { signIn: "Sign in", create: "Create account", reset: "Send reset email" },
      working: "One moment…",
      /** Links that change what the form does; the way back from the create form is a question and its answer. */
      toCreate: "New here? Create an account",
      toSignIn: { question: "Already have an account?", action: "Sign in" },
      toSignInFromReset: "Back to sign in",
      toReset: "Forgot your password?",
      resetSent: (email: string) => `A reset email is on its way to ${email}. Open its link to choose a new password, then sign in here.`,
      /** What signing in does not change (FR-12): how long a document is kept. It still ends when the reader says, or when the window passes. */
      note: "Signing in does not change how long a document is kept. The document and everything prepared from it still end when you delete them, or when the retention window passes; the account only marks them as yours.",
      back: "Back to start",
      /** After a successful sign-in, while the next screen loads. */
      done: "Signed in. Taking you to your document…",
    },
    header: {
      signIn: "Sign in",
      signOut: "Sign out",
      signedInAs: (name: string) => `Signed in as ${name}`,
      signingOut: "Signing out…",
    },
    errors: {
      emailRequired: "Enter the email address of your account.",
      passwordRequired: "Enter your password.",
      "popup-blocked": "The browser blocked the Google sign-in window. Allow pop-ups for this page, open ClauseCompass in its own tab, or sign in with email instead.",
      "popup-closed": "The Google sign-in window was closed before it finished. Try again when you are ready.",
      "unauthorized-domain": "Google sign-in is not enabled for this address of ClauseCompass yet. Sign in with email, or try again later.",
      "provider-off": "This way of signing in is not enabled for ClauseCompass yet. Try the other one.",
      "wrong-password": "That email and password do not match an account here. Check them and try again, or reset your password.",
      "no-account": "There is no account with that email yet. Check it, or create an account.",
      "email-in-use": "An account with that email already exists. Sign in instead, or reset your password.",
      "weak-password": "Choose a longer password: at least 6 characters.",
      "bad-email": "That does not look like an email address. Check it and try again.",
      "too-many": "Too many attempts in a row. Wait a few minutes, then try again.",
      disabled: "This account has been disabled. If that is unexpected, contact whoever runs this copy of ClauseCompass.",
      offline: "Sign-in could not reach Google. Check your connection and try again.",
      "not-configured": "Sign-in is not set up on this copy of ClauseCompass. Whoever runs it needs to add the sign-in configuration.",
      unknown: "Sign-in did not go through. Try again in a moment.",
    },
  };
