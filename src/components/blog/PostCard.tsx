import Image from "next/image";
import Link from "next/link";
import type { BlogPost } from "@/data/blog-posts";
import { formatIsoDate } from "@/lib/format-date";

export function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block overflow-hidden rounded-2xl border border-[var(--color-navy-950)]/8 bg-white">
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <Image
          src={post.featuredImage}
          alt={post.title}
          fill
          sizes="(min-width: 1024px) 33vw, 90vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
        />
      </div>
      <div className="p-5">
        <p className="text-xs font-semibold tracking-[0.15em] text-[var(--color-gold-600)]">{post.category.toUpperCase()}</p>
        <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-[var(--color-navy-950)] group-hover:text-[var(--color-navy-700)]">
          {post.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-[var(--color-navy-950)]/65">{post.excerpt}</p>
        <p className="mt-3 text-xs text-[var(--color-navy-950)]/65">{formatIsoDate(post.publishedAt)}</p>
      </div>
    </Link>
  );
}
