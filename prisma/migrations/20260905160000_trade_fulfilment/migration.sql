-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN     "vendor" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN     "vendorCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendorError" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vendorOrderId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vendorQuotedAt" TIMESTAMP(3),
ADD COLUMN     "vendorSentAt" TIMESTAMP(3),
ADD COLUMN     "vendorShipCarrier" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vendorShipMethod" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vendorShipOptions" JSONB,
ADD COLUMN     "vendorShippingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendorStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vendorTracking" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ShopOrderItem" ADD COLUMN     "vendorCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vendorOptions" JSONB,
ADD COLUMN     "vendorProductId" TEXT NOT NULL DEFAULT '';

