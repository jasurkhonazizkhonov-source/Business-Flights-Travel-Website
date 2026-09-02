import Link from "next/link";
import type { BlogBlock } from "@/data/blog-posts";

// Parses a minimal `[label](/path)` markdown-link syntax inside otherwise
// plain paragraph/list-item text, so blog content can link naturally to
// other pages (Business Class, a destination, the flight request form,
// another article) without a full markdown/MDX pipeline for what is still
// a handful of short articles. Anything not matching that exact pattern is
// left as plain text.
function linkify(text: string, keyPrefix: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return part;
    const [, label, href] = match;
    const external = /^https?:\/\//.test(href);
    return (
      <Link
        key={`${keyPrefix}-${i}`}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="font-medium text-[var(--color-navy-900)] underline decoration-[var(--color-gold-500)]/50 decoration-2 underline-offset-2 hover:text-[var(--color-gold-600)]"
      >
        {label}
      </Link>
    );
  });
}

export function RichContent({ blocks }: { blocks: BlogBlock[] }) {
  return (
    <div className="prose-content space-y-5 text-[var(--color-navy-950)]/80">
      {blocks.map((block, i) => {
        if (block.type === "h2") {
          return (
            <h2 key={i} className="!mt-10 font-display text-xl font-semibold text-[var(--color-navy-950)] sm:text-2xl">
              {block.text}
            </h2>
          );
        }
        if (block.type === "ul") {
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 leading-relaxed marker:text-[var(--color-gold-500)]">
              {block.items.map((item, j) => (
                <li key={j}>{linkify(item, `${i}-${j}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="leading-relaxed">
            {linkify(block.text, String(i))}
          </p>
        );
      })}
    </div>
  );
}
