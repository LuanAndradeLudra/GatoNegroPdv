-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "document" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "customerId" TEXT,
    "clientName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("clientName", "closedAt", "createdById", "id", "kind", "openedAt", "status") SELECT "clientName", "closedAt", "createdById", "id", "kind", "openedAt", "status" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
