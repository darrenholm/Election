-- CreateTable
CREATE TABLE "GarmentStyle" (
    "id" TEXT NOT NULL,
    "styleCode" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarmentStyle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GarmentSku" (
    "id" TEXT NOT NULL,
    "styleId" TEXT NOT NULL,
    "colourName" TEXT NOT NULL DEFAULT '',
    "colourCode" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GarmentSku_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GarmentStyle_styleCode_key" ON "GarmentStyle"("styleCode");

-- CreateIndex
CREATE INDEX "GarmentStyle_isActive_idx" ON "GarmentStyle"("isActive");

-- CreateIndex
CREATE INDEX "GarmentSku_styleId_available_idx" ON "GarmentSku"("styleId", "available");

-- CreateIndex
CREATE UNIQUE INDEX "GarmentSku_styleId_colourName_size_key" ON "GarmentSku"("styleId", "colourName", "size");

-- AddForeignKey
ALTER TABLE "GarmentSku" ADD CONSTRAINT "GarmentSku_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "GarmentStyle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

