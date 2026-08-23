-- AlterTable
ALTER TABLE "ContactAttempt" ADD COLUMN     "followUpDoneAt" TIMESTAMP(3),
ADD COLUMN     "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "willEndorsePublicly" BOOLEAN;

-- AlterTable
ALTER TABLE "VoterCampaignState" ADD COLUMN     "endorsementAt" TIMESTAMP(3),
ADD COLUMN     "endorsementWording" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "willEndorsePublicly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CanvassPhoto" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "voterId" TEXT,
    "contactAttemptId" TEXT,
    "clientId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'image/jpeg',
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "mayPublish" BOOLEAN NOT NULL DEFAULT false,
    "permissionWording" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "takenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvassPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CanvassPhoto_clientId_key" ON "CanvassPhoto"("clientId");

-- CreateIndex
CREATE INDEX "CanvassPhoto_campaignId_createdAt_idx" ON "CanvassPhoto"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "CanvassPhoto_voterId_idx" ON "CanvassPhoto"("voterId");

-- CreateIndex
CREATE INDEX "ContactAttempt_campaignId_followUpNeeded_followUpDoneAt_idx" ON "ContactAttempt"("campaignId", "followUpNeeded", "followUpDoneAt");

-- AddForeignKey
ALTER TABLE "CanvassPhoto" ADD CONSTRAINT "CanvassPhoto_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassPhoto" ADD CONSTRAINT "CanvassPhoto_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassPhoto" ADD CONSTRAINT "CanvassPhoto_contactAttemptId_fkey" FOREIGN KEY ("contactAttemptId") REFERENCES "ContactAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanvassPhoto" ADD CONSTRAINT "CanvassPhoto_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
