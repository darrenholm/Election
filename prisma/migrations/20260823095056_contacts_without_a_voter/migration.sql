-- AlterTable
ALTER TABLE "ContactAttempt" ADD COLUMN     "householdId" TEXT,
ALTER COLUMN "voterId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ContactAttempt_householdId_idx" ON "ContactAttempt"("householdId");

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;
