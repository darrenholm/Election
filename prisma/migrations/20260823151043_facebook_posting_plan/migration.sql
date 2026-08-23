-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "facebookPageId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facebookPageName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facebookPageToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "facebookTokenExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PostPlan" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "daysOfWeek" TEXT NOT NULL DEFAULT '1,3,5',
    "timeOfDay" TEXT NOT NULL DEFAULT '17:00',
    "rampWeeks" INTEGER NOT NULL DEFAULT 2,
    "rampDaysOfWeek" TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3) NOT NULL,
    "mix" TEXT NOT NULL DEFAULT 'INTRODUCTION,DOOR_KNOCKING,POLICY,ENDORSEMENT,EVENT,ASK,GOTV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPost" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "planId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'UPDATE',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SUGGESTED',
    "providerPostId" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostPlan_campaignId_key" ON "PostPlan"("campaignId");

-- CreateIndex
CREATE INDEX "SocialPost_campaignId_scheduledFor_idx" ON "SocialPost"("campaignId", "scheduledFor");

-- CreateIndex
CREATE INDEX "SocialPost_campaignId_status_idx" ON "SocialPost"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "PostPlan" ADD CONSTRAINT "PostPlan_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PostPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
