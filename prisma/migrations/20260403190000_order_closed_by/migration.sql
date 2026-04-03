-- AlterTable
ALTER TABLE "Order" ADD COLUMN "closedById" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
