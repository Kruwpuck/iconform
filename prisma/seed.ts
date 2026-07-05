import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const name = process.env.ADMIN_NAME ?? 'Administrator ICONFORM';

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      passwordHash,
      name,
    },
  });

  console.log(`Seeded admin user: ${username}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
