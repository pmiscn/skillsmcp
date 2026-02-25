-- AlterTable
ALTER TABLE "Skill" ADD COLUMN "avoid" TEXT;
ALTER TABLE "Skill" ADD COLUMN "best_practices" TEXT;
ALTER TABLE "Skill" ADD COLUMN "content_i18n" TEXT;
ALTER TABLE "Skill" ADD COLUMN "faq" TEXT;
ALTER TABLE "Skill" ADD COLUMN "install_guide" TEXT;
ALTER TABLE "Skill" ADD COLUMN "module_overrides" TEXT;
ALTER TABLE "Skill" ADD COLUMN "prompt_templates" TEXT;
ALTER TABLE "Skill" ADD COLUMN "quality_data" TEXT;
ALTER TABLE "Skill" ADD COLUMN "quality_score" INTEGER;
ALTER TABLE "Skill" ADD COLUMN "risk_data" TEXT;
ALTER TABLE "Skill" ADD COLUMN "test_it" TEXT;
ALTER TABLE "Skill" ADD COLUMN "use_cases" TEXT;

-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skill_id" TEXT NOT NULL,
    "target_lang" TEXT NOT NULL,
    "source_lang" TEXT DEFAULT 'en',
    "payload_type" TEXT NOT NULL,
    "payload" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "locked_at" DATETIME,
    "locked_by" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TranslationJob_skill_id_idx" ON "TranslationJob"("skill_id");

-- CreateIndex
CREATE INDEX "TranslationJob_status_locked_at_idx" ON "TranslationJob"("status", "locked_at");
