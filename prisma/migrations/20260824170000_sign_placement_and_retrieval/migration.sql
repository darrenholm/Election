-- AlterTable
ALTER TABLE "SignRequest" ADD COLUMN     "placement" TEXT NOT NULL DEFAULT 'PRIVATE_LAWN',
ADD COLUMN     "landmark" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "signNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "permissionFrom" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "permissionPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "removalDueAt" TIMESTAMP(3),
ADD COLUMN     "removedById" TEXT;

-- CreateTable
CREATE TABLE "SignPhoto" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "signRequestId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "caption" TEXT NOT NULL DEFAULT '',
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignPhoto_clientId_key" ON "SignPhoto"("clientId");

-- CreateIndex
CREATE INDEX "SignPhoto_campaignId_signRequestId_idx" ON "SignPhoto"("campaignId", "signRequestId");

-- CreateIndex
CREATE INDEX "SignRequest_campaignId_placement_idx" ON "SignRequest"("campaignId", "placement");

-- CreateIndex
CREATE INDEX "SignRequest_campaignId_removalDueAt_idx" ON "SignRequest"("campaignId", "removalDueAt");

-- AddForeignKey
ALTER TABLE "SignRequest" ADD CONSTRAINT "SignRequest_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignPhoto" ADD CONSTRAINT "SignPhoto_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignPhoto" ADD CONSTRAINT "SignPhoto_signRequestId_fkey" FOREIGN KEY ("signRequestId") REFERENCES "SignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Signs already recorded were all requested by a household, so the existing
-- rows keep the PRIVATE_LAWN default the column was added with. Nothing to
-- backfill: removalDueAt is stamped the next time a sign is marked installed.
