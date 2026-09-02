import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { PostCard } from "@/components/blog/PostCard";
import { blogPosts } from "@/data/blog-posts";
import { formatIsoDate } from "@/lib/format-date";

export const metadata: Metadata = {
  title: "Business Travel Journal",
  description:
    "Guides and insights on business-class travel, airline comparisons, corporate travel planning, and international flight booking.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndexPage() {
  // Sorted by publish date rather than relying on array order — the most
  // recently published article is "featured" regardless of where it was
  // inserted into blogPosts.
  const sorted = [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  const [featured, ...rest] = sorted;
  const categories = Array.from(new Set(blogPosts.map((p) => p.category)));

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">JOURNAL</p>
        <h1 className="mt-3 max-w-2xl text-[clamp(2rem,4.5vw,3rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">
          Business Travel Guides &amp; Insights
        </h1>
        <p className="mt-4 max-w-2xl text-[var(--color-navy-950)]/70">
          Practical guidance on business-class travel, airline comparisons, and planning international and corporate trips.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c} className="rounded-full border border-[var(--color-navy-950)]/12 px-3 py-1 text-xs text-[var(--color-navy-950)]/65">
              {c}
            </span>
          ))}
        </div>
      </Reveal>

      {featured && (
        <Reveal delay={0.06}>
          <Link
            href={`/blog/${featured.slug}`}
            className="group mt-10 grid grid-cols-1 overflow-hidden rounded-2xl border border-[var(--color-navy-950)]/8 bg-white lg:grid-cols-2"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden lg:aspect-auto">
              <Image
                src={featured.featuredImage}
                alt={featured.title}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
              />
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-10">
              <p className="text-xs font-semibold tracking-[0.15em] text-[var(--color-gold-600)]">
                {featured.category.toUpperCase()}
              </p>
              <h2 className="mt-3 font-display text-2xl font-semibold leading-snug text-[var(--color-navy-950)] group-hover:text-[var(--color-navy-700)] sm:text-3xl">
                {featured.title}
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-navy-950)]/65">{featured.excerpt}</p>
              <p className="mt-4 text-xs text-[var(--color-navy-950)]/65">{formatIsoDate(featured.publishedAt)}</p>
            </div>
          </Link>
        </Reveal>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((post, i) => (
          <Reveal key={post.slug} delay={(i % 3) * 0.06}>
            <PostCard post={post} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
