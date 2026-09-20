import Link from "next/link";
import { countFavorites, listCategories, listPhotos, listTags, listYears } from "@/lib/queries";
import PhotoGrid from "@/components/PhotoGrid";
import Sidebar from "@/components/Sidebar";

export const dynamic = "force-dynamic";

interface Props extends PageProps<"/"> {
  searchParams: Promise<{ category?: string; tag?: string; year?: string; q?: string; fav?: string; view?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  const year = Number.isInteger(Number(sp.year)) && Number(sp.year) > 1970 ? Number(sp.year) : undefined;
  const q = sp.q?.trim().slice(0, 64) || undefined;
  const fav = sp.fav === "1";
  const view = (["square", "masonry", "large", "list"] as const).includes(sp.view as never)
    ? (sp.view as "square" | "masonry" | "large" | "list")
    : "normal";
  const [{ items, total, pageSize }, categories, tags, years, favCount] = await Promise.all([
    listPhotos({ categorySlug: sp.category, tag: sp.tag, year, q, favorite: fav }),
    listCategories(),
    listTags(),
    listYears(),
    countFavorites(),
  ]);

  /** 移动端 chips 组合筛选链接（PC 由侧栏承担）。 */
  const qs = (patch: { category?: string | null; tag?: string | null; year?: number | null; q?: string | null; fav?: boolean | null }) => {
    const params = new URLSearchParams();
    const merged = {
      category: "category" in patch ? patch.category : sp.category,
      tag: "tag" in patch ? patch.tag : sp.tag,
      year: "year" in patch ? (patch.year ? String(patch.year) : null) : sp.year,
      q: "q" in patch ? patch.q : sp.q,
      fav: "fav" in patch ? patch.fav : fav,
    };
    if (merged.category) params.set("category", merged.category);
    if (merged.tag) params.set("tag", merged.tag);
    if (merged.year) params.set("year", merged.year);
    if (merged.q) params.set("q", merged.q);
    if (merged.fav) params.set("fav", "1");
    const s = params.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <div className="w-full px-4 py-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6 lg:px-6">
      <Sidebar
        categories={categories}
        tags={tags}
        years={years}
        totalAll={total}
        totalFav={favCount}
        sp={{ category: sp.category, tag: sp.tag, year: sp.year, q: sp.q, fav: sp.fav }}
      />

      <div className="min-w-0">
        {/* 移动端筛选栏（PC 走左侧栏） */}
        <div className="flex lg:hidden flex-wrap items-center gap-2 mb-5 text-sm">
          <FilterLink href={qs({ category: null, tag: null, year: null, q: null, fav: null })} active={!sp.category && !sp.tag && !sp.year && !fav}>
            全部
          </FilterLink>
          {fav ? null : <FilterLink href={qs({ fav: true })} active={fav}>★ 收藏</FilterLink>}
          {categories.map((c) => (
            <FilterLink key={c.id} href={qs({ category: c.slug })} active={sp.category === c.slug}>
              {c.name}
              {c.count > 0 ? <span className="opacity-50 ml-1">{c.count}</span> : null}
            </FilterLink>
          ))}
          {years.map((y) => (
            <FilterLink key={y.year} href={qs({ year: y.year })} active={sp.year === String(y.year)}>
              {y.year}
            </FilterLink>
          ))}
        </div>

        {q ? (
          <h1 className="text-xl font-semibold mb-6">
            搜索「{q}」 <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : fav ? (
          <h1 className="text-xl font-semibold mb-6">
            ★ 收藏 <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : year ? (
          <h1 className="text-xl font-semibold mb-6">
            {year} 年 <span className="text-sm text-muted font-normal">{total} 张</span>
          </h1>
        ) : null}

        <PhotoGrid
          key={`${sp.category ?? ""}|${sp.tag ?? ""}|${sp.year ?? ""}|${q ?? ""}|${fav ? "fav" : ""}|${view}|${total}`}
          initialItems={items}
          total={total}
          pageSize={pageSize}
          view={view}
          query={{ category: sp.category, tag: sp.tag, year, q, fav }}
        />
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 transition-colors ${
        active ? "border-foreground/60 bg-foreground/10 text-foreground" : "border-edge text-muted hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
