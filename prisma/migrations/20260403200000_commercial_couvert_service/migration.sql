-- CreateEnum
CREATE TYPE "CommercialChargeMode" AS ENUM ('PERCENT', 'FIXED');

-- CreateTable
CREATE TABLE "CommercialSettings" (
    "id" TEXT NOT NULL,
    "couvertEnabled" BOOLEAN NOT NULL DEFAULT false,
    "couvertMode" "CommercialChargeMode" NOT NULL DEFAULT 'PERCENT',
    "couvertValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serviceFeeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "serviceFeeMode" "CommercialChargeMode" NOT NULL DEFAULT 'PERCENT',
    "serviceFeeValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommercialSettings_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "couvertEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "couvertMode" "CommercialChargeMode" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Order" ADD COLUMN "couvertValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN "serviceFeeEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "serviceFeeMode" "CommercialChargeMode" NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Order" ADD COLUMN "serviceFeeValue" DOUBLE PRECISION NOT NULL DEFAULT 0;

INSERT INTO "CommercialSettings" ("id", "couvertEnabled", "couvertMode", "couvertValue", "serviceFeeEnabled", "serviceFeeMode", "serviceFeeValue", "updatedAt")
VALUES ('default', false, 'PERCENT', 0, false, 'PERCENT', 0, CURRENT_TIMESTAMP);
