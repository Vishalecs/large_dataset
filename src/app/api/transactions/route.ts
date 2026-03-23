import { NextRequest, NextResponse } from "next/server";
import { Prisma, Region, TransactionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
    const limit = Math.min(5000, Math.max(1, Number(searchParams.get("limit") ?? "1000")));

    const statusParam = searchParams.get("status") ?? undefined;
    const regionParam = searchParams.get("region") ?? undefined;
    const lastIdParam = searchParams.get("lastId");
    const minAmountParam = searchParams.get("minAmount") ?? undefined;
    const maxAmountParam = searchParams.get("maxAmount") ?? undefined;
    const startDateParam = searchParams.get("startDate") ?? undefined;
    const endDateParam = searchParams.get("endDate") ?? undefined;

    const where: Prisma.TransactionWhereInput = {};

    if (statusParam) {
      const status = statusParam as TransactionStatus;
      if (!ALLOWED_STATUSES.has(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      where.status = status;
    }

    if (regionParam) {
      const region = regionParam as Region;
      if (!ALLOWED_REGIONS.has(region)) {
        return NextResponse.json({ error: "Invalid region" }, { status: 400 });
      }
      where.region = region;
    }

    const cursorFromLastId = lastIdParam ? Number(lastIdParam) : null;
    if (cursorFromLastId !== null && Number.isNaN(cursorFromLastId)) {
      return NextResponse.json({ error: "Invalid lastId" }, { status: 400 });
    }

    const minAmount = minAmountParam ? Number(minAmountParam) : undefined;
    if (minAmount !== undefined && Number.isNaN(minAmount)) {
      return NextResponse.json({ error: "Invalid minAmount" }, { status: 400 });
    }
    const maxAmount = maxAmountParam ? Number(maxAmountParam) : undefined;
    if (maxAmount !== undefined && Number.isNaN(maxAmount)) {
      return NextResponse.json({ error: "Invalid maxAmount" }, { status: 400 });
    }
    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {
        ...(minAmount !== undefined ? { gte: minAmount } : {}),
        ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
      };
    }

    const startDate = startDateParam ? new Date(startDateParam) : undefined;
    if (startDateParam && Number.isNaN(startDate?.getTime())) {
      return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    }
    const endDate = endDateParam ? new Date(endDateParam) : undefined;
    if (endDateParam && Number.isNaN(endDate?.getTime())) {
      return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
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

    // Keyset cursor: `id > lastId`.
    let cursorId = cursorFromLastId ?? 0;
    console.log("[api/transactions] query", {
      page,
      limit,
      status: where.status ?? null,
      region: where.region ?? null,
      minAmount: minAmount ?? null,
      maxAmount: maxAmount ?? null,
      startDate: startDateParam ?? null,
      endDate: endDateParam ?? null,
      lastId: cursorFromLastId,
      resolvedCursorId: cursorId,
    });

    if (cursorFromLastId === null && page > 1) {
      // Derive a cursor for the requested page by selecting the id at the page boundary.
      const offset = (page - 1) * limit;
      const boundary = await prisma.transaction.findFirst({
        where,
        orderBy: { id: "asc" },
        skip: offset,
        select: { id: true },
      });
      cursorId = boundary?.id ?? -1;
    }

    const items =
      cursorId >= 0
        ? await prisma.transaction.findMany({
            where: {
              ...where,
              ...(cursorId > 0 ? { id: { gt: cursorId } } : {}),
            },
            orderBy: { id: "asc" },
            take: limit,
            select: {
              id: true,
              customerName: true,
              amount: true,
              status: true,
              region: true,
              createdAt: true,
            },
          })
        : [];

    const safeItems = Array.isArray(items) ? items : [];
    const nextLastId = safeItems.length ? safeItems[safeItems.length - 1].id : null;
    console.log("[api/transactions] result", {
      count: safeItems.length,
      nextLastId,
    });

    return NextResponse.json({ items: safeItems, nextLastId });
  } catch (error) {
    console.error("[api/transactions] failed", error);
    return NextResponse.json(
      { error: "Unable to fetch transactions at the moment." },
      { status: 500 },
    );
  }
}

