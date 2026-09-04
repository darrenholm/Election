-- A phone number is given to a candidate, not to the municipality. It lived on
-- the shared Voter row, so a number collected at one campaign's door appeared
-- on every other campaign's screen in that town. Move it beside the consent it
-- belongs to, on VoterCampaignState.

ALTER TABLE "VoterCampaignState" ADD COLUMN "phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "VoterCampaignState" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';

-- Carry existing details to the campaigns that already have a record for that
-- voter. Those campaigns can see the number today, so this preserves what they
-- have without widening it; a campaign that never touched the voter gets
-- nothing, which is the point of the change.
UPDATE "VoterCampaignState" AS s
SET "phone" = v."phone", "email" = v."email"
FROM "Voter" AS v
WHERE s."voterId" = v."id"
  AND (v."phone" <> '' OR v."email" <> '');

ALTER TABLE "Voter" DROP COLUMN "phone";
ALTER TABLE "Voter" DROP COLUMN "email";
