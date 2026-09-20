"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SearchBox({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
  }

  return (
    <form
      onSubmit={submit}
      className="relative w-full min-w-0 flex-1 order-1 lg:order-2"
    >
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="搜索照片名称…"
        maxLength={64}
        className="w-full h-12 rounded-full bg-background border border-edge px-5 text-sm outline-none focus:border-foreground/40"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            setValue("");
            router.push("/");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-sm leading-none"
          aria-label="清空搜索"
        >
          ×
        </button>
      ) : null}
    </form>
  );
}
