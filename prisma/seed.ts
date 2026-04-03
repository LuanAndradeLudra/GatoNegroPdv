import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = bcrypt.hashSync("admin123", 10);
  await prisma.user.upsert({
    where: { login: "admin" },
    update: {},
    create: {
      name: "Administrador",
      login: "admin",
      password,
      role: UserRole.ADMIN,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
