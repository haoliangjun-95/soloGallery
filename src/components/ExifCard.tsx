import { buildExifLines } from "@/lib/exif-format";
import type { NormalizedExif } from "@/lib/exif";

export default function ExifCard({
  exif,
  format,
  width,
  height,
  fileSize,
  fileName,
}: {
  exif: NormalizedExif | null;
  format: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  fileName: string;
}) {
  const lines = buildExifLines({ exif, format, width, height, fileSize, fileName });
  if (!lines.length) return null;
  return (
    <div className="rounded-xl border border-edge bg-card p-4">
      <h2 className="text-sm font-medium text-muted mb-3">拍摄信息</h2>
      <dl className="space-y-2 text-sm">
        {lines.map((line) => (
          <div key={line.label} className="flex gap-3">
            <dt className="w-12 shrink-0 text-muted">{line.label}</dt>
            <dd className="min-w-0 break-words">{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
