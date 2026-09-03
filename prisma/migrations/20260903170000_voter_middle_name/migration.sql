-- Middle names had no column of their own, so a clerk's "Middle Name" column
-- was auto-mapped to the List ID field on import. Give them a home.
ALTER TABLE "Voter" ADD COLUMN "middleName" TEXT NOT NULL DEFAULT '';
