import Link from "next/link";
import type { CategoryDTO, TagDTO } from "@/lib/types";

export interface SidebarFilters {
  category?: string;
  tag?: string;
  year?: string;
  q?: string;
  fav?: string;
}

interface Props {
  categories: CategoryDTO[];
  tags: TagDTO[];
  years: { year: number; count: number }[];
  totalAll: number;
  totalFav: number;
  sp: SidebarFilters;
}

/** PhotoPrism 风格左侧栏：项名 + 数量徽标 + 选中高亮。仅 PC 显示，由页面控制显隐。 */
export default function Sidebar({ categories, tags, years, totalAll, totalFav, sp }: Props) {
  const favActive = sp.fav === "1";
  const noneActive = !sp.category && !sp.tag && !sp.year && !favActive;

  /** 覆盖一组互斥维度，保留搜索词。 */
  const href = (patch: Partial<SidebarFilters>) => {
    const merged: SidebarFilters = {
      category: "category" in patch ? patch.category : undefined,
      tag: "tag" in patch ? patch.tag : undefined,
      year: "year" in patch ? patch.year : undefined,
      fav: "fav" in patch ? patch.fav : undefined,
      q: sp.q,
    };
    const p = new URLSearchParams();
    if (merged.category) p.set("category", merged.category);
    if (merged.tag) p.set("tag", merged.tag);
    if (merged.year) p.set("year", merged.year);
    if (merged.fav === "1") p.set("fav", "1");
    if (merged.q) p.set("q", merged.q);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <nav aria-label="筛选菜单" className="hidden lg:block">
      <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pr-2 space-y-6 text-sm">
        <div className="space-y-0.5">
          <Item href={href({})} active={noneActive} label="全部照片" count={totalAll} icon="▦" />
          <Item href={href({ fav: "1" })} active={favActive} label="收藏" count={totalFav} icon="★" star />
        </div>

        {categories.length > 0 ? (
          <Group title="分类">
            {categories.map((c) => (
              <Item
                key={c.id}
                href={href({ category: c.slug })}
                active={sp.category === c.slug}
                label={c.name}
                count={c.count}
              />
            ))}
          </Group>
        ) : null}

        {years.length > 0 ? (
          <Group title="年份">
            {years.map((y) => (
              <Item
                key={y.year}
                href={href({ year: String(y.year) })}
                active={sp.year === String(y.year)}
                label={`${y.year} 年`}
                count={y.count}
              />
            ))}
          </Group>
        ) : null}

        {tags.length > 0 ? (
          <Group title="标签">
            {tags.map((t) => (
              <Item
                key={t.id}
                href={href({ tag: t.name })}
                active={sp.tag === t.name}
                label={`#${t.name}`}
                count={t.count}
              />
            ))}
          </Group>
        ) : null}
      </div>
    </nav>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted/70 uppercase tracking-wider mb-1.5 px-2">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Item({
  href,
  active,
  label,
  count,
  icon,
  star,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  icon?: string;
  star?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
        active ? "bg-foreground/10 text-foreground" : "text-muted hover:bg-foreground/5 hover:text-foreground"
      }`}
      aria-current={active ? "page" : undefined}
    >
      {icon ? (
        <span className={`w-4 text-center shrink-0 ${star ? "text-amber-400" : "opacity-60"}`} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="truncate flex-1">{label}</span>
      {typeof count === "number" && count > 0 ? <span className="text-xs opacity-60 shrink-0">{count}</span> : null}
    </Link>
  );
}
