import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Reveal } from "@/components/Reveal";
import { PostCard } from "@/components/blog/PostCard";
import { CTASection } from "@/components/sections/CTASection";
import { blogPosts, getBlogPostBySlug } from "@/data/blog-posts";
import { SITE_NAME, SITE_URL } from "@/lib/constants";

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  return {
    // seoTitle already includes the "| Business Flights Travel" suffix, so
    // this must bypass the root layout's title template (`%s | Business
    // Flights Travel`) — otherwise the suffix is appended twice.
    title: { absolute: post.seoTitle },
    description: post.seoDescription,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.seoTitle,
      description: post.seoDescription,
      images: [{ url: post.featuredImage }],
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
    },
    // Without this, Next falls back to the generic branded twitter-image.tsx
    // instead of reusing openGraph.images.
    twitter: { title: post.seoTitle, description: post.seoDescription, images: [post.featuredImage] },
  };
}

export default async function BlogPostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const related = blogPosts.filter((p) => post.relatedSlugs.includes(p.slug));

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seoDescription,
    image: post.featuredImage,
    author: { "@type": "Organization", name: post.author },
    publisher: { "@type": "Organization", name: SITE_NAME },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <Reveal>
          <nav aria-label="Breadcrumb" className="text-xs text-[var(--color-navy-950)]/65">
            <Link href="/blog" className="hover:text-[var(--color-navy-950)]">Blog</Link> <span className="mx-1">/</span> {post.category}
          </nav>
          <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-[var(--color-gold-600)]">{post.category.toUpperCase()}</p>
          <h1 className="mt-3 text-[clamp(1.75rem,4vw,2.5rem)] font-display font-semibold leading-tight text-[var(--color-navy-950)]">{post.title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-navy-950)]/55">
            <span>{post.author}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={post.publishedAt}>
              {new Date(post.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </time>
          </div>
        </Reveal>

        <Reveal delay={0.08}>
          <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl">
            <Image src={post.featuredImage} alt={post.title} fill sizes="(min-width: 768px) 768px, 100vw" className="object-cover" priority />
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <div className="prose-content mt-8 space-y-5 text-[var(--color-navy-950)]/80">
            {post.content.map((paragraph, i) => (
              <p key={i} className="leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--color-cream-100)] px-3 py-1 text-xs text-[var(--color-navy-700)]">
                {tag}
              </span>
            ))}
          </div>
        </Reveal>
      </article>

      {related.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="font-display text-2xl font-semibold text-[var(--color-navy-950)]">Related Articles</h2>
          </Reveal>
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}

      <CTASection />
    </>
  );
}
