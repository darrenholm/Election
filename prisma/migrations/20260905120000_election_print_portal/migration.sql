-- CreateTable
CREATE TABLE "ShopCustomer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "contactName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "candidateName" TEXT NOT NULL DEFAULT '',
    "office" TEXT NOT NULL DEFAULT 'COUNCILLOR',
    "municipality" TEXT NOT NULL DEFAULT '',
    "ward" TEXT NOT NULL DEFAULT '',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "fulfilment" TEXT NOT NULL DEFAULT 'PICKUP',
    "contactName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "candidateName" TEXT NOT NULL DEFAULT '',
    "office" TEXT NOT NULL DEFAULT '',
    "municipality" TEXT NOT NULL DEFAULT '',
    "ward" TEXT NOT NULL DEFAULT '',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "needsDesign" BOOLEAN NOT NULL DEFAULT false,
    "designBrief" TEXT NOT NULL DEFAULT '',
    "authorisationLine" TEXT NOT NULL DEFAULT '',
    "neededBy" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "designFeeCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryCents" INTEGER NOT NULL DEFAULT 0,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "adjustmentNote" TEXT NOT NULL DEFAULT '',
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "quotedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "staffNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT '',
    "variantKey" TEXT NOT NULL DEFAULT '',
    "variantName" TEXT NOT NULL DEFAULT '',
    "options" JSONB,
    "optionsSummary" TEXT NOT NULL DEFAULT '',
    "sizeBreakdown" JSONB,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "setupFeeCents" INTEGER NOT NULL DEFAULT 0,
    "lineTotalCents" INTEGER NOT NULL DEFAULT 0,
    "artworkNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopArtwork" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "filename" TEXT NOT NULL DEFAULT 'artwork',
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopArtwork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopCustomer_email_key" ON "ShopCustomer"("email");

-- CreateIndex
CREATE INDEX "ShopCustomer_isActive_idx" ON "ShopCustomer"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_number_key" ON "ShopOrder"("number");

-- CreateIndex
CREATE INDEX "ShopOrder_customerId_status_idx" ON "ShopOrder"("customerId", "status");

-- CreateIndex
CREATE INDEX "ShopOrder_status_submittedAt_idx" ON "ShopOrder"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ShopOrderItem_orderId_idx" ON "ShopOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "ShopArtwork_orderId_idx" ON "ShopArtwork"("orderId");

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "ShopCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopArtwork" ADD CONSTRAINT "ShopArtwork_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopArtwork" ADD CONSTRAINT "ShopArtwork_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "ShopOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
