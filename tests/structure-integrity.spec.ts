import { test, expect } from "@playwright/test";

// Structural accessibility and markup properties of EVERY route in the sitemap, read from the server-rendered HTML: things axe's WCAG rule set does not check
// (axe is run on 17 representative pages in accessibility.spec.ts; this covers all 223, cheaply). One H1, no skipped heading level, a document language and
// title, unique ids, every link/button/field named, every external link opened safely. Runs once (Desktop Chrome): the HTML does not depend on the viewport.

test("every sitemap route has a sound document structure", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "Desktop Chrome", "the server HTML does not depend on the viewport; once is enough");
  test.setTimeout(240_000);
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
  expect(paths.length).toBeGreaterThan(200);

  const problems: string[] = [];
  const bare = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  for (const p of paths) {
    const res = await request.get(p);
    if (res.status() !== 200) {
      problems.push(`${p}: status ${res.status()}`);
      continue;
    }
    const html = bare(await res.text());
    if (!/<html[^>]+lang="[a-z]{2}/i.test(html)) problems.push(`${p}: <html> has no lang`);
    if (!/<title>[^<]{3,}<\/title>/i.test(html)) problems.push(`${p}: no usable <title>`);
    const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
    const h1 = levels.filter((l) => l === 1).length;
    if (h1 !== 1) problems.push(`${p}: ${h1} <h1> elements`);
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) {
        problems.push(`${p}: heading level jumps from h${levels[i - 1]} to h${levels[i]}`);
        break;
      }
    }
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const duplicated = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (duplicated.length) problems.push(`${p}: duplicate id ${duplicated.slice(0, 3).join(", ")}`);
    for (const m of html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
      const [, tag, attrs, inner] = m;
      const text = inner.replace(/<[^>]+>/g, "").replace(/&nbsp;|\s/g, "");
      if (!text && !/<img[^>]+alt="[^"]+"/i.test(inner) && !/aria-label=|aria-labelledby=|title=/i.test(attrs)) {
        problems.push(`${p}: a <${tag}> with no accessible name`);
        break;
      }
    }
    for (const m of html.matchAll(/<input\b([^>]*)>/gi)) {
      const attrs = m[1];
      if (/type="(hidden|submit|button|checkbox|radio)"/i.test(attrs)) continue;
      const id = /\sid="([^"]+)"/.exec(` ${attrs}`)?.[1];
      const labelled = /aria-label=|aria-labelledby=/i.test(attrs) || (id !== undefined && html.includes(`for="${id}"`));
      if (!labelled) {
        problems.push(`${p}: an <input> with no label`);
        break;
      }
    }
    for (const m of html.matchAll(/<a\b([^>]*target="_blank"[^>]*)>/gi)) {
      if (!/rel="[^"]*noopener/i.test(m[1])) {
        problems.push(`${p}: target=_blank without rel=noopener`);
        break;
      }
    }
    for (const m of html.matchAll(/<img\b([^>]*)>/gi)) {
      if (!/\salt=/i.test(` ${m[1]}`)) {
        problems.push(`${p}: an <img> with no alt attribute (decorative images must say alt="")`);
        break;
      }
    }
  }
  expect(problems).toEqual([]);
});
