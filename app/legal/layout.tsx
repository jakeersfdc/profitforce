import type { ReactNode } from "react";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <article className="max-w-4xl mx-auto px-4 py-8 text-white/80 leading-relaxed text-sm prose-invert">
      <div className="[&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:text-white [&_h1]:mb-4
                      [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-6 [&_h2]:mb-2
                      [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white/90 [&_h3]:mt-4 [&_h3]:mb-1
                      [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_li]:my-1
                      [&_table]:w-full [&_table]:my-3 [&_th]:text-left [&_th]:border-b [&_th]:border-white/10 [&_th]:py-2 [&_th]:px-2
                      [&_td]:py-2 [&_td]:px-2 [&_td]:border-b [&_td]:border-white/5
                      [&_a]:text-blue-400 hover:[&_a]:underline">
        {children}
      </div>
    </article>
  );
}
