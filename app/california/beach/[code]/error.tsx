"use client";

import { useEffect } from "react";

export default function BeachError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold text-slate-900">This beach didn’t load.</h1>
      <p className="text-sm leading-6 text-slate-600">
        This is usually temporary. No reading has been changed.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="w-fit rounded-md bg-[#246f72] px-4 py-3 text-sm font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
