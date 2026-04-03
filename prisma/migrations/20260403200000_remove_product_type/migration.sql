-- Redefinir Product sem productType (SQLite)
PRAGMA foreign_keys=OFF;

CREATE TABLE "Product_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "stock" REAL NOT NULL DEFAULT 0,
    "isKitchenItem" BOOLEAN NOT NULL DEFAULT false,
    "controlsStock" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "Product_new" ("id", "name", "price", "stock", "isKitchenItem", "controlsStock", "active", "createdAt", "updatedAt")
SELECT "id", "name", "price", "stock", "isKitchenItem", "controlsStock", "active", "createdAt", "updatedAt" FROM "Product";

DROP TABLE "Product";
ALTER TABLE "Product_new" RENAME TO "Product";

PRAGMA foreign_keys=ON;
