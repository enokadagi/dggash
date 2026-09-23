ALTER TABLE "customers"
  ADD COLUMN "email" TEXT,
  ADD COLUMN "location" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION;

CREATE TABLE "subscription_renewals" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT,
    "previousPlanId" TEXT NOT NULL,
    "newPlanId" TEXT NOT NULL,
    "previousExpiryDate" TIMESTAMP(3) NOT NULL,
    "newExpiryDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_renewals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_renewals_subscriptionId_idx" ON "subscription_renewals"("subscriptionId");
CREATE INDEX "subscription_renewals_createdAt_idx" ON "subscription_renewals"("createdAt");

ALTER TABLE "subscription_renewals"
  ADD CONSTRAINT "subscription_renewals_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;