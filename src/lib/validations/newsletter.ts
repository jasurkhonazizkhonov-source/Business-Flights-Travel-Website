import { z } from "zod";
import { isValidEmail } from "@/lib/email-validation";

export const newsletterSchema = z.object({
  // zod's own address check first (the pattern the CRM validates with), then the shared rules that are stricter on label/length details
  // (src/lib/email-validation.ts): everything accepted here is accepted by the CRM too.
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .max(200)
    .refine((value) => isValidEmail(value), "Enter a valid email address"),
  // Honeypot. It must PARSE whatever a bot typed into it: the previous `.max(0)` made a filled honeypot a validation failure, so the action
  // answered a bot with an error (a different reply from a human's success) and its "behave as if it worked" branch could never run. The
  // action now reads this field and discards the submission silently; the length cap only bounds what is ever looked at.
  website: z.string().max(2000).optional(),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
