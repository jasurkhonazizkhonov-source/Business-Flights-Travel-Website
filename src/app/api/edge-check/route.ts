import { headers } from "next/headers";
import { edgeProofState, resolveClientIp, trustedProxyMode } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { ipv6Bucket } from "@/lib/rate-limit-client";

// GET /api/edge-check - what the edge proof says about THIS request, and nothing else: { "edgeProof": "off" | "valid" | "missing" | "invalid" }.
// It exists so that the Cloudflare rule can be VERIFIED before the proof is enforced (docs/EDGE_PROOF_ACTIVATION_RUNBOOK.md): through the public hostname
// the answer must be "valid"; straight at the container (what another container on the network could do) it must be "missing". It reveals nothing a
// caller does not already know about its own request: not the secret, not the configured mode, not the client's address.
//   off      no secret is configured, or the site is not behind the Cloudflare trusted-proxy mode (the proof does not apply);
//   valid    the request carries the configured proof;
//   missing  a secret is configured and the request carries none;
//   invalid  a secret is configured and the request carries a different value.
// Not cacheable (the answer is about the requester), never indexed, and limited per trusted client like the other public routes.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } as const;
const LIMIT_PER_WINDOW = 120;

export async function GET() {
  const headerList = await headers();
  const client = resolveClientIp(headerList);
  if (client.ok) {
    const bucket = client.address.includes(":") ? ipv6Bucket(client.address) : client.address;
    if (!checkRateLimit(`edge-check:${bucket}`, LIMIT_PER_WINDOW).allowed) {
      return Response.json({}, { status: 429, headers: { ...NO_STORE, "Retry-After": "600" } });
    }
  }
  const edgeProof = trustedProxyMode() === "cloudflare" ? edgeProofState(headerList) : "off";
  return Response.json({ edgeProof }, { headers: NO_STORE });
}
