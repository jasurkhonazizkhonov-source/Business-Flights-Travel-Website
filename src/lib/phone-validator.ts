// Client-side loader for the phone-number validator. `@/lib/phone` pulls in libphonenumber-js (and its ~120 KB metadata), which used to be part of the
// initial JavaScript of every page with a form (/, /contact, /flights) even though nothing needs it until the visitor touches the phone field or
// submits. This module is the only thing the forms import statically (a few hundred bytes); the library itself is fetched on demand through a dynamic
// import, once, and is then used synchronously - so validation behaves exactly as before once it is loaded.
//
// It is loaded: (1) the first time the phone field is touched, focused or filled (PhoneNumberField), and (2) at submit, if neither happened (browser
// autofill, a very fast keyboard submit) - the form then waits for it and re-submits itself, so the same checks run with the same messages.
// If the chunk cannot be loaded at all (offline, blocked) the client-side FORMAT check is skipped for that submission and the server action - which
// has always validated the number again with the same library and the same message - remains the authority.

export type PhoneValidator = (raw: string) => boolean;

/** What a form says about a number: `undefined` = valid (in the numbering-plan sense - not "reachable", not "owned by the visitor"), else the text to show. */
export type PhoneErrorFor = (raw: string | undefined, messages: { incomplete: string; required: string }) => string | undefined;

export type PhoneValidatorState = { state: "idle" } | { state: "ready"; isValid: PhoneValidator; errorFor: PhoneErrorFor };

let current: PhoneValidatorState = { state: "idle" };
let inflight: Promise<PhoneValidatorState & { state: "ready" } | null> | undefined;

export function getPhoneValidatorState(): PhoneValidatorState {
  return current;
}

/** Starts (or joins) the one load. Never rejects: resolves to the ready state, or null when it could not be loaded (a later call retries). */
function load(): Promise<(PhoneValidatorState & { state: "ready" }) | null> {
  inflight ??= import("@/lib/phone").then(
    (mod) => {
      const ready: PhoneValidatorState & { state: "ready" } = {
        state: "ready",
        isValid: (raw) => mod.isValidPhoneNumber(raw),
        errorFor: (raw, messages) => {
          const check = mod.checkPhoneNumber(raw ?? "");
          return check.ok ? undefined : mod.phoneProblemMessage(check, messages.incomplete, messages.required);
        },
      };
      current = ready;
      return ready;
    },
    () => {
      inflight = undefined; // allow a retry on the next interaction
      return null;
    },
  );
  return inflight;
}

/** How long a submit waits for the validator before giving up on it for that submission (the load itself carries on; the server stays the authority). */
export const VALIDATOR_WAIT_MS = 8000;

/**
 * Starts (or joins) the one load. Never rejects: resolves to the validator, or null when it could not be loaded (a later call retries) or, for a request that
 * stalls instead of failing (a hung connection, a browser that never reports an aborted script), when it has not arrived within VALIDATOR_WAIT_MS, so a submit is
 * never left waiting forever; the format check is then skipped for that submission exactly as when the chunk fails, and the server validates the number.
 */
export function loadPhoneValidator(waitMs: number = VALIDATOR_WAIT_MS): Promise<PhoneValidator | null> {
  if (current.state === "ready") return Promise.resolve(current.isValid);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs);
    load().then((ready) => {
      clearTimeout(timer);
      resolve(ready?.isValid ?? null);
    });
  });
}
