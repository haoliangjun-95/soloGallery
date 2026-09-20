import Link from "next/link";
import { listCategories, listPhotos, listTags } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

interface Props extends PageProps<"/"> {
  searchParams: Promise<{ category?: string; tag?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const [{ items, total, pageSize }, categories, tags] = await Promise.all([
    listPhotos({ categorySlug: sp.category, tag: sp.tag }),
    listCategories(),
    listTags(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
        <FilterLink href="/" active={!sp.category && !sp.tag}>
          全部
        </FilterLink>
        {categories.map((c) => (
          <FilterLink key={c.id} href={`/category/${c.slug}`} active={sp.category === c.slug}>
            {c.name}
            {c.count > 0 ? <span className="opacity-50 ml-1">{c.count}</span> : null}
          </FilterLink>
        ))}
        {tags.length > 0 ? <span className="text-edge select-none">|</span> : null}
        {tags.slice(0, 12).map((t) => (
          <FilterLink key={t.id} href={`/tag/${encodeURIComponent(t.name)}`} active={sp.tag === t.name} small>
            #{t.name}
          </FilterLink>
        ))}
      </div>

      <PhotoGrid
        key={`${sp.category ?? ""}|${sp.tag ?? ""}|${total}`}
        initialItems={items}
        total={total}
        pageSize={pageSize}
        query={{ category: sp.category, tag: sp.tag }}
      />
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
  small,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 transition-colors ${
        small ? "text-xs" : ""
      } ${active ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-edge text-muted hover:text-foreground"}`}
    >
      {children}
    </Link>
  );
}
