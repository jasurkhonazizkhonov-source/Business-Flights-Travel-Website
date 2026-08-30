"use server";

import { randomUUID } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { newsletterSchema, type NewsletterInput } from "@/lib/validations/newsletter";
import { CRM_COMPANY_ID } from "@/lib/constants";

export type SubscribeNewsletterResult = { ok: true; alreadySubscribed: boolean } | { ok: false; error: string };

// Writes into the CRM's own Subscriber model (prisma/schema.prisma) — the
// same table the CRM's marketing-campaign sender (MarketingCampaignSend)
// already reads from — rather than a bespoke website-only table, so a
// subscription captured here is immediately usable by the CRM's existing
// campaign tooling with no separate import/sync step.
export async function subscribeToNewsletter(input: NewsletterInput): Promise<SubscribeNewsletterResult> {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const { allowed } = checkRateLimit(`newsletter:${ip}`, 6);
  if (!allowed) {
    return { ok: false, error: "Too many attempts. Please try again in a few minutes." };
  }

  const parsed = newsletterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (parsed.data.website) {
    // Honeypot tripped — behave as if it worked, don't tip off the bot.
    return { ok: true, alreadySubscribed: false };
  }

  try {
    const existing = await prisma.subscriber.findUnique({
      where: { companyId_email: { companyId: CRM_COMPANY_ID, email: parsed.data.email } },
    });

    if (existing) {
      if (existing.status === "SUBSCRIBED") {
        return { ok: true, alreadySubscribed: true };
      }
      // Previously unsubscribed — a fresh signup re-activates the same
      // record rather than erroring on the unique (companyId, email) key.
      await prisma.subscriber.update({
        where: { id: existing.id },
        data: { status: "SUBSCRIBED", subscribedAt: new Date(), unsubscribedAt: null, updatedAt: new Date() },
      });
      return { ok: true, alreadySubscribed: false };
    }

    await prisma.subscriber.create({
      data: {
        companyId: CRM_COMPANY_ID,
        email: parsed.data.email,
        status: "SUBSCRIBED",
        source: "website",
        unsubscribeToken: randomUUID(),
        updatedAt: new Date(),
      },
    });

    return { ok: true, alreadySubscribed: false };
  } catch (err) {
    console.error("[subscribeToNewsletter] failed", err);
    return { ok: false, error: "We're sorry, something went wrong. Please try again." };
  }
}
