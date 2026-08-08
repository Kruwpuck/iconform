import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  // ponytail: dev default passes the 12-char check; production MUST set ADMIN_PASSWORD to a real secret.
  const password = process.env.ADMIN_PASSWORD ?? 'changeme_dev1';
  const name = process.env.ADMIN_NAME ?? 'Administrator PDL FORM';

  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      name,
    },
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
