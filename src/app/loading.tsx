// Shown by the App Router while a route segment is streaming in, instead of a
// blank page. Shaped like a page (heading, intro, content blocks) so the
// layout doesn't jump when the real content replaces it. Announced politely
// to assistive tech via the status role.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true">
        <div className="bfw-skeleton h-9 w-2/3 max-w-md" />
        <div className="bfw-skeleton mt-4 h-4 w-full max-w-xl" />
        <div className="bfw-skeleton mt-2 h-4 w-5/6 max-w-lg" />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="bfw-skeleton h-48" />
          <div className="bfw-skeleton h-48" />
          <div className="bfw-skeleton h-48 sm:col-span-2 lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}
