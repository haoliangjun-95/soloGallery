import AdminPhotosClient from "@/components/admin/AdminPhotosClient";
import Pagination from "@/components/admin/Pagination";
import { listCategories, listPhotosAdmin, listTags, listYears } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    page?: string;
    category?: string;
    tag?: string;
    year?: string;
    q?: string;
    status?: string;
    fav?: string;
  }>;
}

const STATUSES = ["all", "published", "unpublished", "missing"] as const;

export default async function AdminPhotosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const yearNum = Number(sp.year);
  const year = Number.isInteger(yearNum) && yearNum > 1970 ? yearNum : undefined;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as (typeof STATUSES)[number])
    : "all";

  const [{ items, total, pageSize }, categories, tags, years] = await Promise.all([
    listPhotosAdmin({
      page,
      categorySlug: sp.category || undefined,
      tag: sp.tag || undefined,
      year,
      q: sp.q || undefined,
      favorite: sp.fav === "1",
      status: status === "all" ? undefined : (status as "published" | "unpublished" | "missing"),
    }),
    listCategories(false),
    listTags(false),
    listYears(false),
  ]);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const selectCls =
    "h-9 rounded-lg bg-background border border-edge px-2 text-sm outline-none focus:border-foreground/40 max-w-[10rem]";

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">图片管理</h1>

      {/* 筛选栏：GET 表单，参考前台筛选维度 + 管理状态 */}
      <form method="get" action="/admin/photos" className="flex flex-wrap items-center gap-2 mb-4 text-sm">
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="搜索名称…"
          className="h-9 w-44 rounded-lg bg-background border border-edge px-3 outline-none focus:border-foreground/40"
        />
        <select name="category" defaultValue={sp.category ?? ""} className={selectCls}>
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>
        <select name="year" defaultValue={sp.year ?? ""} className={selectCls}>
          <option value="">全部年份</option>
          {years.map((y) => (
            <option key={y.year} value={y.year}>
              {y.year} 年 ({y.count})
            </option>
          ))}
        </select>
        <select name="tag" defaultValue={sp.tag ?? ""} className={selectCls}>
          <option value="">全部标签</option>
          {tags.map((t) => (
            <option key={t.id} value={t.name}>
              #{t.name} ({t.count})
            </option>
          ))}
        </select>
        <select name="status" defaultValue={status} className={selectCls}>
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="unpublished">未发布</option>
          <option value="missing">源缺失</option>
        </select>
        <label className="flex items-center gap-1.5 text-muted">
          <input type="checkbox" name="fav" value="1" defaultChecked={sp.fav === "1"} />
          仅收藏
        </label>
        <button
          type="submit"
          className="h-9 rounded-lg bg-foreground text-background px-4 text-sm font-medium hover:opacity-90"
        >
          筛选
        </button>
        <a
          href="/admin/photos"
          className="h-9 rounded-lg border border-edge px-4 py-2 text-muted hover:text-foreground"
        >
          重置
        </a>
        <span className="text-muted ml-auto">共 {total} 张</span>
      </form>

      <AdminPhotosClient
        items={items}
        total={total}
        page={page}
        pageSize={pageSize}
        categories={categories}
      />

      <Pagination page={page} pages={pages} />
    </div>
  );
}
