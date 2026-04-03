import { PaymentMethodKind, PrismaClient, ProductType, UserRole } from "@prisma/client";
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

  const products: {
    name: string;
    price: number;
    stock: number;
    productType: ProductType;
    isKitchenItem: boolean;
    controlsStock: boolean;
  }[] = [
    { name: "Cerveja 600ml", price: 9.5, stock: 120, productType: "GELADO", isKitchenItem: false, controlsStock: true },
    { name: "Refrigerante lata", price: 6, stock: 80, productType: "GELADO", isKitchenItem: false, controlsStock: true },
    { name: "Água 500ml", price: 4, stock: 100, productType: "GELADO", isKitchenItem: false, controlsStock: true },
    { name: "Porção de batatas", price: 28, stock: 40, productType: "QUENTE", isKitchenItem: true, controlsStock: true },
    { name: "Hambúrguer artesanal", price: 32, stock: 30, productType: "QUENTE", isKitchenItem: true, controlsStock: true },
    { name: "Suco natural 400ml", price: 12, stock: 25, productType: "GELADO", isKitchenItem: false, controlsStock: true },
  ];

  for (const p of products) {
    const exists = await prisma.product.findFirst({ where: { name: p.name } });
    if (!exists) {
      await prisma.product.create({ data: p });
    }
  }

  const defaultMethods: { name: string; kind: PaymentMethodKind; feePercent: number | null }[] = [
    { name: "Dinheiro", kind: "DINHEIRO", feePercent: null },
    { name: "PIX", kind: "DINHEIRO", feePercent: null },
    { name: "Débito", kind: "DEBITO", feePercent: null },
    { name: "Crédito Visa/Master", kind: "CREDITO", feePercent: 3 },
    { name: "Vale refeição", kind: "VALE", feePercent: null },
  ];
  for (const m of defaultMethods) {
    const exists = await prisma.paymentMethod.findFirst({ where: { name: m.name } });
    if (!exists) {
      await prisma.paymentMethod.create({ data: m });
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
