#!/usr/bin/env node
// Programmatic duplicate/integrity checks for blog-posts.ts and
// destinations.ts, run via `npm run validate:content`. Regex-based rather
// than a real TS import — this project has no ts-node/tsx dependency, and
// pulling one in just for a validation script isn't worth it when the data
// files are consistently formatted enough for regex extraction to be
// reliable (verified against the actual current file shapes below).
//
// Exits non-zero on any failure so this can gate CI/local checks the same
// way lint/tsc do.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

let failed = false;
function fail(msg) {
  console.error("FAIL:", msg);
  failed = true;
}
function ok(msg) {
  console.log("OK:", msg);
}

// ---------------------------------------------------------------------
// Blog posts
// ---------------------------------------------------------------------
function validateBlog() {
  const src = fs.readFileSync(path.join(root, "src/data/blog-posts.ts"), "utf8");
  const posts = [...src.matchAll(/slug: "([^"]+)",\s*\n\s*title: "([^"]+)"[\s\S]*?featuredImage: "([^"]+)"/g)].map((m) => ({
    slug: m[1],
    title: m[2],
    img: m[3],
  }));

  console.log(`\n--- Blog: ${posts.length} articles ---`);
  if (posts.length < 35) fail(`expected at least 35 blog articles, found ${posts.length}`);
  else ok(`article count >= 35 (${posts.length})`);

  const slugCounts = {};
  for (const p of posts) slugCounts[p.slug] = (slugCounts[p.slug] || 0) + 1;
  const dupeSlugs = Object.entries(slugCounts).filter(([, n]) => n > 1);
  if (dupeSlugs.length) fail(`duplicate blog slugs: ${dupeSlugs.map(([s]) => s).join(", ")}`);
  else ok("no duplicate blog slugs");

  const byImg = {};
  for (const p of posts) (byImg[p.img] = byImg[p.img] || []).push(p.slug);
  const dupeImages = Object.entries(byImg).filter(([, slugs]) => slugs.length > 1);
  if (dupeImages.length) {
    for (const [img, slugs] of dupeImages) fail(`duplicate blog image ${img} used by: ${slugs.join(", ")}`);
  } else {
    ok(`0 duplicate image assignments across ${posts.length} articles`);
  }

  const missingImg = posts.filter((p) => !p.img || !p.img.startsWith("http"));
  if (missingImg.length) fail(`missing/invalid featuredImage for: ${missingImg.map((p) => p.slug).join(", ")}`);
  else ok("every article has a featuredImage URL");

  return posts;
}

// ---------------------------------------------------------------------
// Destinations
// ---------------------------------------------------------------------
function validateDestinations() {
  const src = fs.readFileSync(path.join(root, "src/data/destinations.ts"), "utf8");
  const blocks = src.split(/\n\s*\{\s*\n\s*region:/).slice(1);
  const dests = blocks.map((b) => {
    const get = (re) => b.match(re)?.[1];
    return {
      region: get(/^\s*"([^"]+)",/),
      country: get(/country: "([^"]+)"/),
      countrySlug: get(/countrySlug: "([^"]+)"/),
      city: get(/city: "([^"]+)"/),
      citySlug: get(/citySlug: "([^"]+)"/),
      iata: get(/iata: "([^"]+)"/),
      heroImage: get(/heroImage: "([^"]+)"/),
    };
  });

  console.log(`\n--- Destinations: ${dests.length} entries ---`);

  const slugKey = (d) => `${d.region}/${d.countrySlug}/${d.citySlug}`;
  const slugCounts = {};
  for (const d of dests) slugCounts[slugKey(d)] = (slugCounts[slugKey(d)] || 0) + 1;
  const dupeSlugs = Object.entries(slugCounts).filter(([, n]) => n > 1);
  if (dupeSlugs.length) fail(`duplicate destination routes: ${dupeSlugs.map(([s]) => s).join(", ")}`);
  else ok("no duplicate destination routes (region/country/city)");

  const cityNameCounts = {};
  for (const d of dests) cityNameCounts[d.city] = (cityNameCounts[d.city] || 0) + 1;
  const dupeCities = Object.entries(cityNameCounts).filter(([, n]) => n > 1);
  if (dupeCities.length) console.warn(`NOTE: city name appears more than once (may be legitimately different countries): ${dupeCities.map(([c, n]) => `${c} (${n})`).join(", ")}`);

  const iataCounts = {};
  for (const d of dests) if (d.iata) iataCounts[d.iata] = (iataCounts[d.iata] || 0) + 1;
  const dupeIata = Object.entries(iataCounts).filter(([, n]) => n > 1);
  if (dupeIata.length) fail(`duplicate IATA codes: ${dupeIata.map(([c]) => c).join(", ")}`);
  else ok("no duplicate IATA codes");

  const byImg = {};
  for (const d of dests) if (d.heroImage) (byImg[d.heroImage] = byImg[d.heroImage] || []).push(d.city);
  const dupeImages = Object.entries(byImg).filter(([, cities]) => cities.length > 1);
  if (dupeImages.length) {
    for (const [img, cities] of dupeImages) fail(`duplicate destination image ${img} used by: ${cities.join(", ")}`);
  } else {
    ok(`0 duplicate hero images across ${dests.length} destinations`);
  }

  const missing = dests.filter((d) => !d.region || !d.country || !d.countrySlug || !d.city || !d.citySlug || !d.iata || !d.heroImage);
  if (missing.length) fail(`destinations missing required fields: ${missing.map((d) => d.city || "(unnamed)").join(", ")}`);
  else ok("every destination has region/country/city/iata/heroImage");

  return dests;
}

const posts = validateBlog();
const dests = validateDestinations();

console.log(`\n--- Summary ---`);
console.log(`Blog articles: ${posts.length}, unique images: ${new Set(posts.map((p) => p.img)).size}`);
console.log(`Destinations: ${dests.length}, unique images: ${new Set(dests.map((d) => d.heroImage)).size}`);

if (failed) {
  console.error("\nvalidate-content: FAILED");
  process.exit(1);
} else {
  console.log("\nvalidate-content: all checks passed");
}
