-- CreateTable
CREATE TABLE "CanvassInsight" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notesRead" INTEGER NOT NULL DEFAULT 0,
    "themes" TEXT NOT NULL DEFAULT '[]',
    "model" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CanvassInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CanvassInsight_campaignId_generatedAt_idx" ON "CanvassInsight"("campaignId", "generatedAt");

-- AddForeignKey
ALTER TABLE "CanvassInsight" ADD CONSTRAINT "CanvassInsight_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
