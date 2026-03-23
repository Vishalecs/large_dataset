"use client";

import { useEffect, useMemo, useState } from "react";

type TransactionRow = {
  id: number;
  customerName: string;
  amount: number;
  status: "Success" | "Pending" | "Failed";
  region: "North" | "South" | "East" | "West";
  createdAt: string; // ISO string from the API
};

const PAGE_SIZE = 1000;

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const baseUrl =
    configuredBaseUrl && /^https?:\/\//i.test(configuredBaseUrl)
      ? configuredBaseUrl
      : window.location.origin;
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export default function HomePage() {
  const [status, setStatus] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [page, setPage] = useState(1);
  const [cursorStack, setCursorStack] = useState<number[]>([0]); // cursor start for each page

  const cursor = cursorStack[page - 1] ?? 0;

  const [items, setItems] = useState<TransactionRow[]>([]);
  const [nextLastId, setNextLastId] = useState<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterQuery = useMemo(() => {
    return {
      status: status || undefined,
      region: region || undefined,
      minAmount: minAmount || undefined,
      maxAmount: maxAmount || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
  }, [status, region, minAmount, maxAmount, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      setIsLoading(true);
      setError(null);
      try {
        const endpoint = buildUrl("/api/transactions", {
          page,
          limit: PAGE_SIZE,
          status: filterQuery.status,
          region: filterQuery.region,
          minAmount: filterQuery.minAmount,
          maxAmount: filterQuery.maxAmount,
          startDate: filterQuery.startDate,
          endDate: filterQuery.endDate,
          lastId: cursor,
        });
        console.log("[frontend] fetching transactions", { endpoint });
        const res = await fetch(
          endpoint,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          console.error("[frontend] transactions request failed", {
            status: res.status,
            body,
          });
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }
        const body = (await res.json()) as unknown;
        console.log("[frontend] transactions response", body);
        if (cancelled) return;
        const parsedItems = Array.isArray(body)
          ? (body as TransactionRow[])
          : body &&
              typeof body === "object" &&
              Array.isArray((body as { items?: unknown }).items)
            ? ((body as { items: TransactionRow[] }).items ?? [])
            : [];
        const parsedNextLastId =
          body &&
          typeof body === "object" &&
          "nextLastId" in body &&
          typeof (body as { nextLastId?: unknown }).nextLastId === "number"
            ? ((body as { nextLastId: number }).nextLastId ?? null)
            : null;
        setItems(parsedItems);
        setNextLastId(parsedNextLastId);
      } catch (e) {
        if (cancelled) return;
        console.error("[frontend] transactions fetch error", e);
        setError(e instanceof Error ? e.message : "Unknown error");
        setItems([]);
        setNextLastId(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    page,
    cursor,
    filterQuery.status,
    filterQuery.region,
    filterQuery.minAmount,
    filterQuery.maxAmount,
    filterQuery.startDate,
    filterQuery.endDate,
  ]);

  function resetAndRefetch(nextStatus: string, nextRegion: string) {
    setStatus(nextStatus);
    setRegion(nextRegion);
    setPage(1);
    setCursorStack([0]);
  }

  function resetPaging() {
    setPage(1);
    setCursorStack([0]);
  }

  async function downloadCsv() {
    setIsDownloading(true);
    setError(null);
    try {
      const url = buildUrl("/api/export", {
        status: filterQuery.status,
        region: filterQuery.region,
        minAmount: filterQuery.minAmount,
        maxAmount: filterQuery.maxAmount,
        startDate: filterQuery.startDate,
        endDate: filterQuery.endDate,
      });

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = "transactions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(downloadUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown export error");
    } finally {
      setIsDownloading(false);
    }
  }

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    [],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 via-slate-50 to-zinc-100">
      <div className="mx-auto max-w-7xl p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-zinc-200/70 bg-white/90 p-5 shadow-sm backdrop-blur sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Transactions</h1>
            <p className="text-sm text-zinc-600">
              {isLoading ? "Loading..." : `${items.length.toLocaleString()} rows`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={downloadCsv}
              disabled={isDownloading}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDownloading ? "Downloading CSV..." : "Download CSV"}
            </button>
          </div>
        </header>

        <section className="mb-5 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-800">Filters</h2>
            <span className="text-xs text-zinc-500">Amount and date range</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-zinc-700">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Min Amount
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={minAmount}
              onChange={(e) => {
                setMinAmount(e.target.value);
                resetPaging();
              }}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 transition-colors focus-visible:border-zinc-300 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
              placeholder="e.g. 100"
            />
          </label>
          <label className="text-sm text-zinc-700">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Max Amount
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={maxAmount}
              onChange={(e) => {
                setMaxAmount(e.target.value);
                resetPaging();
              }}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 transition-colors focus-visible:border-zinc-300 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
              placeholder="e.g. 5000"
            />
          </label>
          <label className="text-sm text-zinc-700">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Start Date
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                resetPaging();
              }}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 transition-colors focus-visible:border-zinc-300 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
            />
          </label>
          <label className="text-sm text-zinc-700">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500">
              End Date
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                resetPaging();
              }}
              className="h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-900 transition-colors focus-visible:border-zinc-300 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
            />
          </label>
          </div>
        </section>

        <div className="mb-4 flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm text-zinc-600">
            Page <span className="font-medium text-zinc-900">{page}</span> (keyset cursor:{" "}
            <span className="font-mono text-zinc-900">{cursor}</span>)
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1 || isLoading}
              className="inline-flex h-10 min-w-20 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => {
                if (nextLastId === null) return;
                setCursorStack((prev) => [...prev, nextLastId]);
                setPage((p) => p + 1);
              }}
              disabled={nextLastId === null || isLoading}
              className="inline-flex h-10 min-w-20 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
          {error ? (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="max-h-[70vh] overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur">
                <tr className="text-left text-sm font-semibold text-zinc-700">
                  <th className="border-b border-zinc-200 px-4 py-3">ID</th>
                  <th className="border-b border-zinc-200 px-4 py-3">Customer</th>
                  <th className="border-b border-zinc-200 px-4 py-3">Amount</th>
                  <th className="border-b border-zinc-200 px-4 py-3">
                    <div>Status</div>
                    <select
                      value={status}
                      onChange={(e) => resetAndRefetch(e.target.value, region)}
                      className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-normal text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    >
                      <option value="">All</option>
                      <option value="Success">Success</option>
                      <option value="Pending">Pending</option>
                      <option value="Failed">Failed</option>
                    </select>
                  </th>
                  <th className="border-b border-zinc-200 px-4 py-3">
                    <div>Region</div>
                    <select
                      value={region}
                      onChange={(e) => resetAndRefetch(status, e.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm font-normal text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-300"
                    >
                      <option value="">All</option>
                      <option value="North">North</option>
                      <option value="South">South</option>
                      <option value="East">East</option>
                      <option value="West">West</option>
                    </select>
                  </th>
                  <th className="border-b border-zinc-200 px-4 py-3">Created At</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-600">
                      Loading 1,000 rows...
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-600">
                      No transactions match your filters.
                    </td>
                  </tr>
                ) : (
                  items.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t border-zinc-100 text-sm text-zinc-900 transition-colors hover:bg-zinc-50/60"
                    >
                      <td className="px-4 py-2.5 font-mono">{t.id}</td>
                      <td className="px-4 py-2.5">{t.customerName}</td>
                      <td className="px-4 py-2.5">{currencyFormatter.format(t.amount)}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={[
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            t.status === "Success"
                              ? "bg-green-50 text-green-700"
                              : t.status === "Pending"
                                ? "bg-yellow-50 text-yellow-800"
                                : "bg-red-50 text-red-700",
                          ].join(" ")}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">{t.region}</td>
                      <td className="px-4 py-2.5 text-zinc-600">
                        {new Date(t.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
