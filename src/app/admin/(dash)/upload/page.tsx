import UploadClient from "@/components/admin/UploadClient";

export const dynamic = "force-dynamic";

export default function AdminUploadPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">上传图片</h1>
      <p className="text-sm text-muted mb-4">
        原图按内容寻址存入 <code className="text-foreground">objects/</code>，自动生成 display WebP；上传后默认未发布，可在图片管理中编辑发布。
      </p>
      <UploadClient />
    </div>
  );
}
