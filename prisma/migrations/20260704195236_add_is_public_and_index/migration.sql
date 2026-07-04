-- AlterTable
ALTER TABLE "TestRun" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TestRun_userId_createdAt_idx" ON "TestRun"("userId", "createdAt");
