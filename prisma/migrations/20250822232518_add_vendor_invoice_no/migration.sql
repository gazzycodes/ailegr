/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,vendor,vendorInvoiceNo]` on the table `expenses` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."expenses" ADD COLUMN     "vendorInvoiceNo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenantId_vendor_vendorInvoiceNo_key" ON "public"."expenses"("tenantId", "vendor", "vendorInvoiceNo");
