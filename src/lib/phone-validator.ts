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
export type PhoneValidatorState = { state: "idle" } | { state: "ready"; isValid: PhoneValidator };

let current: PhoneValidatorState = { state: "idle" };
let inflight: Promise<PhoneValidator | null> | undefined;

export function getPhoneValidatorState(): PhoneValidatorState {
  return current;
}

/** Starts (or joins) the one load. Never rejects: resolves to the validator, or null when it could not be loaded (a later call retries). */
export function loadPhoneValidator(): Promise<PhoneValidator | null> {
  if (current.state === "ready") return Promise.resolve(current.isValid);
  inflight ??= import("@/lib/phone").then(
    (mod) => {
      current = { state: "ready", isValid: mod.isValidPhoneNumber };
      return current.isValid;
    },
    () => {
      inflight = undefined; // allow a retry on the next interaction
      return null;
    },
  );
  return inflight;
}
