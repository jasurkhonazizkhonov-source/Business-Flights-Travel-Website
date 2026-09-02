import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { PostCard } from "@/components/blog/PostCard";
import { blogPosts } from "@/data/blog-posts";

export function BlogPreview() {
  // Sorted by publish date rather than array order — see the same fix in
  // app/blog/page.tsx.
  const featured = [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)).slice(0, 3);
  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <Reveal>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.25em] text-[var(--color-gold-600)]">FROM THE JOURNAL</p>
            <h2 className="mt-3 max-w-xl font-display text-3xl font-semibold text-[var(--color-navy-950)] sm:text-4xl">
              Business travel guides &amp; insights
            </h2>
          </div>
          <Link href="/blog" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-[var(--color-navy-800)] hover:text-[var(--color-gold-600)]">
            Visit the blog <ArrowRight size={16} />
          </Link>
        </div>
      </Reveal>
      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {featured.map((post, i) => (
          <Reveal key={post.slug} delay={i * 0.08}>
            <PostCard post={post} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
