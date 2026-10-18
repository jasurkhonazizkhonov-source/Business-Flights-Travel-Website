"use server";

import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rate-limit";
import { rateLimitClientKey } from "@/lib/rate-limit-client";
import { newsletterSchema, type NewsletterInput } from "@/lib/validations/newsletter";
import { postNewsletterSubscription } from "@/lib/crm-api/client";
import { crmApiConfig } from "@/server/crm-api";

export type SubscribeNewsletterResult = { ok: true; alreadySubscribed: boolean } | { ok: false; error: string };

// A newsletter sign-up becomes a Subscriber in the Compass Tools CRM - the table its marketing-campaign sender reads - through
// POST /api/public/subscribe, the CRM's ONLY endpoint for this form today (UNauthenticated; see docs/CRM_API_INTEGRATION.md). The CRM owns the
// duplicate handling: an address that unsubscribed earlier is re-subscribed, and a new address notifies the staff. The CRM's reply is just
// { ok: true }, so unlike the old direct-database version this cannot tell the visitor "you're already on the list": a repeat sign-up is
// simply confirmed as subscribed (`alreadySubscribed` stays in the type for the existing form and is always false).
// There is NO database fallback.
export async function subscribeToNewsletter(input: NewsletterInput): Promise<SubscribeNewsletterResult> {
  const headerList = await headers();
  const ip = rateLimitClientKey(headerList);

  const { allowed } = checkRateLimit(`newsletter:${ip}`, 6);
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again in a few minutes." };
  }

  const parsed = newsletterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (parsed.data.website) {
    // Honeypot tripped - behave as if it worked, don't tip off the bot.
    return { ok: true, alreadySubscribed: false };
  }

  const api = crmApiConfig("public-inquiry", "newsletter");
  if (!api.ok) return { ok: false, error: "We're sorry, something went wrong. Please try again." };

  const outcome = await postNewsletterSubscription({ config: api.config, email: parsed.data.email, source: "website" });
  if (outcome.status === "ok") return { ok: true, alreadySubscribed: false };

  switch (outcome.status) {
    case "rejected":
      console.error(`[subscribeToNewsletter] the CRM rejected the sign-up (HTTP ${outcome.httpStatus})`);
      break;
    case "rate_limited":
      console.error("[subscribeToNewsletter] the CRM rate-limited the website's call");
      break;
    case "unavailable":
      console.error(`[subscribeToNewsletter] the CRM could not be reached (${outcome.reason}${outcome.httpStatus ? `, HTTP ${outcome.httpStatus}` : ""})`);
      break;
  }
  return { ok: false, error: "We're sorry, something went wrong. Please try again." };
}
