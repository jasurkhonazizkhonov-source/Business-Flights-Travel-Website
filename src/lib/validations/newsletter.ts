import { z } from "zod";

export const newsletterSchema = z.object({
  email: z.string().trim().email("Enter a valid email address").max(200),
  // Honeypot. It must PARSE whatever a bot typed into it: the previous `.max(0)` made a filled honeypot a validation failure, so the action
  // answered a bot with an error (a different reply from a human's success) and its "behave as if it worked" branch could never run. The
  // action now reads this field and discards the submission silently; the length cap only bounds what is ever looked at.
  website: z.string().max(2000).optional(),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;
