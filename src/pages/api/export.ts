import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma, Region, TransactionStatus } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const ALLOWED_STATUSES = new Set<TransactionStatus>([
  TransactionStatus.Success,
  TransactionStatus.Pending,
  TransactionStatus.Failed,
]);

const ALLOWED_REGIONS = new Set<Region>([
  Region.North,
  Region.South,
  Region.East,
  Region.West,
]);

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  // Escape fields that contain CSV delimiters or newlines.
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const prisma = getPrisma();
  if (req.method !== "GET") return res.status(405).end();

  const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
  const regionParam = typeof req.query.region === "string" ? req.query.region : undefined;
  const minAmountParam = typeof req.query.minAmount === "string" ? req.query.minAmount : undefined;
  const maxAmountParam = typeof req.query.maxAmount === "string" ? req.query.maxAmount : undefined;
  const startDateParam = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDateParam = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const lastDownloadedIdRaw =
    typeof req.query.lastDownloadedId === "string" ? req.query.lastDownloadedId : undefined;

  const cursorIdFromClient = lastDownloadedIdRaw ? Number(lastDownloadedIdRaw) : 0;
  if (Number.isNaN(cursorIdFromClient) || cursorIdFromClient < 0) {
    return res.status(400).json({ error: "Invalid lastDownloadedId" });
  }

  const where: Prisma.TransactionWhereInput = {};
  if (statusParam) {
    const status = statusParam as TransactionStatus;
    if (!ALLOWED_STATUSES.has(status)) return res.status(400).json({ error: "Invalid status" });
    where.status = status;
  }
  if (regionParam) {
    const region = regionParam as Region;
    if (!ALLOWED_REGIONS.has(region)) return res.status(400).json({ error: "Invalid region" });
    where.region = region;
  }

  const minAmount = minAmountParam ? Number(minAmountParam) : undefined;
  if (minAmount !== undefined && Number.isNaN(minAmount)) {
    return res.status(400).json({ error: "Invalid minAmount" });
  }
  const maxAmount = maxAmountParam ? Number(maxAmountParam) : undefined;
  if (maxAmount !== undefined && Number.isNaN(maxAmount)) {
    return res.status(400).json({ error: "Invalid maxAmount" });
  }
  if (minAmount !== undefined || maxAmount !== undefined) {
    where.amount = {
      ...(minAmount !== undefined ? { gte: minAmount } : {}),
      ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
    };
  }

  const startDate = startDateParam ? new Date(startDateParam) : undefined;
  if (startDateParam && Number.isNaN(startDate?.getTime())) {
    return res.status(400).json({ error: "Invalid startDate" });
  }
  const endDate = endDateParam ? new Date(endDateParam) : undefined;
  if (endDateParam && Number.isNaN(endDate?.getTime())) {
    return res.status(400).json({ error: "Invalid endDate" });
  }
  if (startDate || endDate) {
    const nextDayExclusive = endDate
      ? new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
      : undefined;
    where.createdAt = {
      ...(startDate ? { gte: startDate } : {}),
      ...(nextDayExclusive ? { lt: nextDayExclusive } : {}),
    };
  }

  console.log("[api/export] query", {
    status: where.status ?? null,
    region: where.region ?? null,
    minAmount: minAmount ?? null,
    maxAmount: maxAmount ?? null,
    startDate: startDateParam ?? null,
    endDate: endDateParam ?? null,
    lastDownloadedId: cursorIdFromClient,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="transactions.csv"');
  res.setHeader("X-Content-Type-Options", "nosniff");

  let aborted = false;
  res.on("close", () => {
    aborted = true;
  });

  const CHUNK_SIZE = 5000;
  let cursorId = cursorIdFromClient;

  const writeHeader = cursorId === 0;
  if (writeHeader) {
    res.write(
      [
        "id",
        "customerName",
        "amount",
        "status",
        "region",
        "createdAt",
      ].join(",") + "\n",
    );
  }

  // Stream rows to the browser in chunks.
  while (!aborted) {
    const rows = await prisma.transaction.findMany({
      where: {
        ...where,
        ...(cursorId > 0 ? { id: { gt: cursorId } } : {}),
      },
      orderBy: { id: "asc" },
      take: CHUNK_SIZE,
      select: {
        id: true,
        customerName: true,
        amount: true,
        status: true,
        region: true,
        createdAt: true,
      },
    });

    if (!rows.length) break;

    const csvLines = rows.map((r) => {
      return [
        r.id,
        csvEscape(r.customerName),
        // Keep numeric output stable for CSV.
        r.amount.toFixed(2),
        r.status,
        r.region,
        r.createdAt.toISOString(),
      ].join(",");
    });

    for (const line of csvLines) {
      if (aborted || res.writableEnded) break;
      res.write(line + "\n");
    }

    cursorId = rows[rows.length - 1].id;
  }

  // End only if the connection is still alive.
  if (!aborted) res.end();
}

