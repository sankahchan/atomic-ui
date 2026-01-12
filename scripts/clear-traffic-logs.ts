import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  const result = await db.trafficLog.deleteMany({});
  console.log(`Deleted ${result.count} traffic logs`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
