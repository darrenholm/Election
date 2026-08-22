-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Municipality" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usesWards" BOOLEAN NOT NULL DEFAULT false,
    "province" TEXT NOT NULL DEFAULT 'ON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "candidateName" TEXT NOT NULL,
    "office" TEXT NOT NULL DEFAULT 'COUNCILLOR',
    "municipalityId" TEXT NOT NULL,
    "ward" TEXT NOT NULL DEFAULT '',
    "votingDay" TIMESTAMP(3) NOT NULL,
    "campaignPeriodStart" TIMESTAMP(3) NOT NULL,
    "campaignPeriodEnd" TIMESTAMP(3),
    "electorCount" INTEGER NOT NULL DEFAULT 0,
    "certifiedSpendingLimitCents" INTEGER,
    "certifiedPartyExpenseLimitCents" INTEGER,
    "certifiedSelfFundingLimitCents" INTEGER,
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "twilioFromNumber" TEXT NOT NULL DEFAULT '',
    "twilioMessagingServiceSid" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "streetNumber" TEXT NOT NULL DEFAULT '',
    "streetName" TEXT NOT NULL DEFAULT '',
    "streetKey" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "ward" TEXT NOT NULL DEFAULT '',
    "pollNumber" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocodeStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "geocodePrecision" TEXT NOT NULL DEFAULT '',
    "geocodedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voter" (
    "id" TEXT NOT NULL,
    "municipalityId" TEXT NOT NULL,
    "externalId" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT '',
    "birthYear" INTEGER,
    "householdId" TEXT,
    "movedAway" BOOLEAN NOT NULL DEFAULT false,
    "deceased" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoterCampaignState" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "supportLevel" INTEGER,
    "wantsSign" BOOLEAN NOT NULL DEFAULT false,
    "wantsToVolunteer" BOOLEAN NOT NULL DEFAULT false,
    "isDonorProspect" BOOLEAN NOT NULL DEFAULT false,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "votedAt" TIMESTAMP(3),
    "smsConsent" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "smsConsentAt" TIMESTAMP(3),
    "smsConsentSource" TEXT NOT NULL DEFAULT '',
    "smsConsentWording" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoterCampaignState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turf" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ward" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'UNASSIGNED',
    "plannedFor" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurfHousehold" (
    "turfId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,

    CONSTRAINT "TurfHousehold_pkey" PRIMARY KEY ("turfId","householdId")
);

-- CreateTable
CREATE TABLE "ContactAttempt" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "clientId" TEXT,
    "voterId" TEXT NOT NULL,
    "volunteerId" TEXT,
    "method" TEXT NOT NULL DEFAULT 'DOOR',
    "result" TEXT NOT NULL DEFAULT 'SPOKE',
    "supportLevel" INTEGER,
    "issues" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Volunteer" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "roles" TEXT NOT NULL DEFAULT '',
    "availability" TEXT NOT NULL DEFAULT '',
    "hasVehicle" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "voterId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CANVASS',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "eventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SIGNED_UP',
    "checkedInAt" TIMESTAMP(3),
    "hoursLogged" DOUBLE PRECISION,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contributor" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "province" TEXT NOT NULL DEFAULT 'ON',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "ontarioResident" BOOLEAN NOT NULL DEFAULT true,
    "isCandidate" BOOLEAN NOT NULL DEFAULT false,
    "isCandidateSpouse" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contribution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contributorId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'CHEQUE',
    "isInKind" BOOLEAN NOT NULL DEFAULT false,
    "inKindDescription" TEXT NOT NULL DEFAULT '',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "receiptNumber" TEXT NOT NULL DEFAULT '',
    "receiptIssuedAt" TIMESTAMP(3),
    "eventId" TEXT,
    "returnedAt" TIMESTAMP(3),
    "returnReason" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amountCents" INTEGER NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT NOT NULL DEFAULT '',
    "invoiceRef" TEXT NOT NULL DEFAULT '',
    "subjectToLimit" BOOLEAN NOT NULL DEFAULT true,
    "isPartyExpense" BOOLEAN NOT NULL DEFAULT false,
    "isInKind" BOOLEAN NOT NULL DEFAULT false,
    "eventId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignRequest" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "voterId" TEXT,
    "requesterName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "ward" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocodeStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "geocodePrecision" TEXT NOT NULL DEFAULT '',
    "geocodedAt" TIMESTAMP(3),
    "signType" TEXT NOT NULL DEFAULT 'SMALL_LAWN',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "permissionConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledFor" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "installedById" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignInventory" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "signType" TEXT NOT NULL,
    "quantityOwned" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MEET_GREET',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT NOT NULL DEFAULT '',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "isFundraiser" BOOLEAN NOT NULL DEFAULT false,
    "ticketPriceCents" INTEGER,
    "expectedAttendance" INTEGER,
    "actualAttendance" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextCampaign" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "audienceFilter" TEXT NOT NULL DEFAULT '{}',
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TextCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TextMessage" (
    "id" TEXT NOT NULL,
    "textCampaignId" TEXT NOT NULL,
    "voterId" TEXT,
    "toPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "providerSid" TEXT NOT NULL DEFAULT '',
    "errorMessage" TEXT NOT NULL DEFAULT '',
    "segments" INTEGER NOT NULL DEFAULT 1,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "TextMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsOptOut" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsOptOut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Municipality_name_key" ON "Municipality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_municipalityId_idx" ON "Campaign"("municipalityId");

-- CreateIndex
CREATE INDEX "Campaign_isActive_idx" ON "Campaign"("isActive");

-- CreateIndex
CREATE INDEX "Household_municipalityId_streetKey_streetNumber_idx" ON "Household"("municipalityId", "streetKey", "streetNumber");

-- CreateIndex
CREATE INDEX "Household_municipalityId_streetName_idx" ON "Household"("municipalityId", "streetName");

-- CreateIndex
CREATE INDEX "Household_ward_idx" ON "Household"("ward");

-- CreateIndex
CREATE INDEX "Household_postalCode_idx" ON "Household"("postalCode");

-- CreateIndex
CREATE INDEX "Voter_municipalityId_lastName_firstName_idx" ON "Voter"("municipalityId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Voter_householdId_idx" ON "Voter"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "Voter_municipalityId_externalId_key" ON "Voter"("municipalityId", "externalId");

-- CreateIndex
CREATE INDEX "VoterCampaignState_campaignId_supportLevel_idx" ON "VoterCampaignState"("campaignId", "supportLevel");

-- CreateIndex
CREATE INDEX "VoterCampaignState_campaignId_smsConsent_idx" ON "VoterCampaignState"("campaignId", "smsConsent");

-- CreateIndex
CREATE INDEX "VoterCampaignState_voterId_idx" ON "VoterCampaignState"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "VoterCampaignState_campaignId_voterId_key" ON "VoterCampaignState"("campaignId", "voterId");

-- CreateIndex
CREATE INDEX "Turf_campaignId_status_idx" ON "Turf"("campaignId", "status");

-- CreateIndex
CREATE INDEX "TurfHousehold_householdId_idx" ON "TurfHousehold"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactAttempt_clientId_key" ON "ContactAttempt"("clientId");

-- CreateIndex
CREATE INDEX "ContactAttempt_campaignId_occurredAt_idx" ON "ContactAttempt"("campaignId", "occurredAt");

-- CreateIndex
CREATE INDEX "ContactAttempt_voterId_idx" ON "ContactAttempt"("voterId");

-- CreateIndex
CREATE INDEX "ContactAttempt_volunteerId_idx" ON "ContactAttempt"("volunteerId");

-- CreateIndex
CREATE INDEX "Volunteer_campaignId_status_idx" ON "Volunteer"("campaignId", "status");

-- CreateIndex
CREATE INDEX "Volunteer_campaignId_lastName_idx" ON "Volunteer"("campaignId", "lastName");

-- CreateIndex
CREATE INDEX "Shift_campaignId_startsAt_idx" ON "Shift"("campaignId", "startsAt");

-- CreateIndex
CREATE INDEX "ShiftAssignment_volunteerId_idx" ON "ShiftAssignment"("volunteerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_shiftId_volunteerId_key" ON "ShiftAssignment"("shiftId", "volunteerId");

-- CreateIndex
CREATE INDEX "Contributor_campaignId_lastName_firstName_idx" ON "Contributor"("campaignId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "Contribution_campaignId_receivedAt_idx" ON "Contribution"("campaignId", "receivedAt");

-- CreateIndex
CREATE INDEX "Contribution_contributorId_idx" ON "Contribution"("contributorId");

-- CreateIndex
CREATE INDEX "Contribution_eventId_idx" ON "Contribution"("eventId");

-- CreateIndex
CREATE INDEX "Expense_campaignId_incurredAt_idx" ON "Expense"("campaignId", "incurredAt");

-- CreateIndex
CREATE INDEX "Expense_campaignId_category_idx" ON "Expense"("campaignId", "category");

-- CreateIndex
CREATE INDEX "SignRequest_campaignId_status_idx" ON "SignRequest"("campaignId", "status");

-- CreateIndex
CREATE INDEX "SignRequest_campaignId_signType_idx" ON "SignRequest"("campaignId", "signType");

-- CreateIndex
CREATE UNIQUE INDEX "SignInventory_campaignId_signType_key" ON "SignInventory"("campaignId", "signType");

-- CreateIndex
CREATE INDEX "Event_campaignId_startsAt_idx" ON "Event"("campaignId", "startsAt");

-- CreateIndex
CREATE INDEX "TextCampaign_campaignId_status_idx" ON "TextCampaign"("campaignId", "status");

-- CreateIndex
CREATE INDEX "TextMessage_status_idx" ON "TextMessage"("status");

-- CreateIndex
CREATE INDEX "TextMessage_voterId_idx" ON "TextMessage"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "TextMessage_textCampaignId_toPhone_key" ON "TextMessage"("textCampaignId", "toPhone");

-- CreateIndex
CREATE INDEX "SmsOptOut_phone_idx" ON "SmsOptOut"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "SmsOptOut_campaignId_phone_key" ON "SmsOptOut"("campaignId", "phone");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Household" ADD CONSTRAINT "Household_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voter" ADD CONSTRAINT "Voter_municipalityId_fkey" FOREIGN KEY ("municipalityId") REFERENCES "Municipality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voter" ADD CONSTRAINT "Voter_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterCampaignState" ADD CONSTRAINT "VoterCampaignState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoterCampaignState" ADD CONSTRAINT "VoterCampaignState_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurfHousehold" ADD CONSTRAINT "TurfHousehold_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurfHousehold" ADD CONSTRAINT "TurfHousehold_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contributor" ADD CONSTRAINT "Contributor_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "Contributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contribution" ADD CONSTRAINT "Contribution_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignRequest" ADD CONSTRAINT "SignRequest_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignRequest" ADD CONSTRAINT "SignRequest_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignRequest" ADD CONSTRAINT "SignRequest_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignInventory" ADD CONSTRAINT "SignInventory_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextCampaign" ADD CONSTRAINT "TextCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextMessage" ADD CONSTRAINT "TextMessage_textCampaignId_fkey" FOREIGN KEY ("textCampaignId") REFERENCES "TextCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TextMessage" ADD CONSTRAINT "TextMessage_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "Voter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsOptOut" ADD CONSTRAINT "SmsOptOut_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

