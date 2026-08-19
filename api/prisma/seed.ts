import { PrismaClient, Role, ProductStatus } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "demo12345";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const [owner, manager, staff] = await Promise.all([
    prisma.user.upsert({
      where: { email: "owner@fulfilio.dev" },
      update: {},
      create: { email: "owner@fulfilio.dev", passwordHash, name: "Dana Owner" },
    }),
    prisma.user.upsert({
      where: { email: "manager@fulfilio.dev" },
      update: {},
      create: { email: "manager@fulfilio.dev", passwordHash, name: "Micah Manager" },
    }),
    prisma.user.upsert({
      where: { email: "staff@fulfilio.dev" },
      update: {},
      create: { email: "staff@fulfilio.dev", passwordHash, name: "Sam Staff" },
    }),
  ]);

  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-distribution-co" },
    update: {},
    create: { name: "Demo Distribution Co", slug: "demo-distribution-co" },
  });

  await prisma.workspaceMember.createMany({
    data: [
      { userId: owner.id, workspaceId: workspace.id, role: Role.OWNER },
      { userId: manager.id, workspaceId: workspace.id, role: Role.MANAGER },
      { userId: staff.id, workspaceId: workspace.id, role: Role.STAFF },
    ],
    skipDuplicates: true,
  });

  const products = [
    { name: "Corrugated Shipping Box (M)", sku: "BOX-M-001", category: "Packaging", price: 1.25, quantity: 500 },
    { name: "Corrugated Shipping Box (L)", sku: "BOX-L-001", category: "Packaging", price: 1.75, quantity: 320 },
    { name: "Packing Tape 48mm", sku: "TAPE-48-001", category: "Packaging", price: 3.5, quantity: 150 },
    { name: "Bubble Wrap Roll 100ft", sku: "WRAP-100-001", category: "Packaging", price: 12.0, quantity: 60 },
    { name: "Wireless Barcode Scanner", sku: "SCAN-BT-001", category: "Equipment", price: 89.99, quantity: 12 },
    { name: "Thermal Label Printer", sku: "PRINT-TH-001", category: "Equipment", price: 149.0, quantity: 4 },
    { name: "Pallet Stretch Wrap 20in", sku: "WRAP-PAL-001", category: "Packaging", price: 22.5, quantity: 40 },
    { name: "Warehouse Gloves (Pair)", sku: "GLOVE-001", category: "Safety", price: 4.25, quantity: 3 }, // intentionally below threshold
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { workspaceId_sku: { workspaceId: workspace.id, sku: p.sku } },
      update: {},
      create: {
        workspaceId: workspace.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        status: ProductStatus.ACTIVE,
      },
    });

    await prisma.inventory.upsert({
      where: { productId: product.id },
      update: {},
      create: { productId: product.id, quantity: p.quantity, lowStockThreshold: 5 },
    });
  }

  console.log("✅ Seed complete.");
  console.log(`\nWorkspace: ${workspace.name}  (id: ${workspace.id})`);
  console.log(`\nDemo logins (password: ${DEMO_PASSWORD}):`);
  console.log("  OWNER   → owner@fulfilio.dev");
  console.log("  MANAGER → manager@fulfilio.dev");
  console.log("  STAFF   → staff@fulfilio.dev");
  console.log(`\n${products.length} products seeded, including one below its low-stock threshold (GLOVE-001).`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
