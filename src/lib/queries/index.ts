/**
 * 查询层 barrel —— 原单文件 queries.ts（755 行）按域拆分（2026-09-29），
 * 对外导入路径 "@/lib/queries" 不变：
 * - ./list      照片列表/详情/相邻导航/随机漫游（含 GPS 隐私闸门 canSeeGps）
 * - ./taxonomy  分类/标签/年份/收藏计数/器材聚合
 * - ./calendar  月份列表/日历分组/年度归档/那年今日
 * - ./map       地图点位（复用 list.canSeeGps 闸门）
 * - ./admin     评论管理/原图存储键
 */
export * from "./list";
export * from "./taxonomy";
export * from "./calendar";
export * from "./map";
export * from "./admin";
