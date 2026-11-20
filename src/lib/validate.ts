// Client-side email format check, used for instant form feedback before submission - the server independently re-validates with the same rules
// (src/lib/email-validation.ts, applied in lib/validations/*.ts) regardless of what this returns, so this is a convenience, never the gate.
// The rules live in one dependency-free module (no zod in the client bundle); this file keeps the import path the forms already use.
export { isValidEmail, checkEmail, emailProblemMessage, type EmailProblem } from "@/lib/email-validation";
