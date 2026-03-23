import "dotenv/config";
import { PrismaClient, Region, TransactionStatus } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const TOTAL_ROWS = 1_000_000;
const BATCH_SIZE = 5_000;

function pickStatus() {
  // Weighted distribution: mostly Success.
  const r = Math.random();
  if (r < 0.6) return TransactionStatus.Success;
  if (r < 0.85) return TransactionStatus.Pending;
  return TransactionStatus.Failed;
}

function pickRegion() {
  const regions = [Region.North, Region.South, Region.East, Region.West];
  return regions[Math.floor(Math.random() * regions.length)];
}

async function main() {
  for (let start = 0; start < TOTAL_ROWS; start += BATCH_SIZE) {
    const batchSize = Math.min(BATCH_SIZE, TOTAL_ROWS - start);

    const data = Array.from({ length: batchSize }, (_, idx) => {
      const n = start + idx + 1;
      const amount = Math.round((Math.random() * 9_999 + 1) * 100) / 100; // 2 decimals

      // Spread createdAt across the last 365 days.
      const createdAt = new Date(
        Date.now() - Math.floor(Math.random() * 365) * 24 * 60 * 60 * 1000,
      );

      return {
        customerName: `Customer ${n}`,
        amount,
        status: pickStatus(),
        region: pickRegion(),
        createdAt,
      };
    });

    await prisma.transaction.createMany({ data });

    const end = start + batchSize;
    console.log(`Seeded ${end.toLocaleString()}/${TOTAL_ROWS.toLocaleString()}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

