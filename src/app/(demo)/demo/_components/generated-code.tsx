"use client";

import { useState } from "react";

export function GeneratedCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-[#002855]">
          Your Code
          <span className="ml-2 text-xs font-normal text-gray-500">
            Reflects the settings above — updates when you click Apply
          </span>
        </h3>
        <button
          onClick={handleCopy}
          disabled={!code}
          className="rounded bg-[#004C97] px-3 py-1 text-xs font-medium text-white hover:bg-[#002855] disabled:opacity-50"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#1f2937] p-4 text-sm text-[#e5e7eb]">
        <code>{code || "Loading…"}</code>
      </pre>
    </div>
  );
}
