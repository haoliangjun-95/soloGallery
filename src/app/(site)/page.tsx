import Link from "next/link";
import { listCategories, listPhotos, listTags, listYears } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";

export const dynamic = "force-dynamic";

interface Props extends PageProps<"/"> {
  searchParams: Promise<{ category?: string; tag?: string; year?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const year = Number.isInteger(Number(sp.year)) && Number(sp.year) > 1970 ? Number(sp.year) : undefined;
  const [{ items, total, pageSize }, categories, tags, years] = await Promise.all([
    listPhotos({ categorySlug: sp.category, tag: sp.tag, year }),
    listCategories(),
    listTags(),
    listYears(),
  ]);

  /** 组合筛选链接：覆盖一个维度、保留其余维度。 */
  const qs = (patch: { category?: string | null; tag?: string | null; year?: number | null }) => {
    const params = new URLSearchParams();
    const merged = {
      category: "category" in patch ? patch.category : sp.category,
      tag: "tag" in patch ? patch.tag : sp.tag,
      year: "year" in patch ? (patch.year ? String(patch.year) : null) : sp.year,
    };
    if (merged.category) params.set("category", merged.category);
    if (merged.tag) params.set("tag", merged.tag);
    if (merged.year) params.set("year", merged.year);
    const s = params.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
        <FilterLink href={qs({ category: null, tag: null, year: null })} active={!sp.category && !sp.tag && !sp.year}>
          全部
        </FilterLink>
        {categories.map((c) => (
          <FilterLink key={c.id} href={qs({ category: c.slug })} active={sp.category === c.slug}>
            {c.name}
            {c.count > 0 ? <span className="opacity-50 ml-1">{c.count}</span> : null}
          </FilterLink>
        ))}
        {years.length > 0 ? <span className="text-edge select-none">|</span> : null}
        {years.map((y) => (
          <FilterLink key={y.year} href={qs({ year: y.year })} active={sp.year === String(y.year)}>
            {y.year}
            <span className="opacity-50 ml-1">{y.count}</span>
          </FilterLink>
        ))}
        {tags.length > 0 ? <span className="text-edge select-none">|</span> : null}
        {tags.slice(0, 12).map((t) => (
          <FilterLink key={t.id} href={qs({ tag: t.name })} active={sp.tag === t.name} small>
            #{t.name}
          </FilterLink>
        ))}
      </div>

      {year ? (
        <h1 className="text-xl font-semibold mb-6">
          {year} 年 <span className="text-sm text-muted font-normal">{total} 张</span>
        </h1>
      ) : null}

      <PhotoGrid
        key={`${sp.category ?? ""}|${sp.tag ?? ""}|${sp.year ?? ""}|${total}`}
        initialItems={items}
        total={total}
        pageSize={pageSize}
        query={{ category: sp.category, tag: sp.tag, year }}
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
