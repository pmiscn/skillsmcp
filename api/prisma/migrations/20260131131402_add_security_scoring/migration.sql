-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "name_zh" TEXT,
    "description" TEXT NOT NULL,
    "description_zh" TEXT,
    "tags" TEXT,
    "owner" TEXT,
    "contact" TEXT,
    "source" TEXT,
    "skill_path" TEXT,
    "weight" REAL,
    "installs" INTEGER NOT NULL DEFAULT 0,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "security_score" INTEGER NOT NULL DEFAULT 0,
    "security_data" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Skill" ("contact", "createdAt", "description", "description_zh", "id", "installs", "name", "name_zh", "owner", "skill_path", "source", "stars", "tags", "updatedAt", "weight") SELECT "contact", "createdAt", "description", "description_zh", "id", "installs", "name", "name_zh", "owner", "skill_path", "source", "stars", "tags", "updatedAt", "weight" FROM "Skill";
DROP TABLE "Skill";
ALTER TABLE "new_Skill" RENAME TO "Skill";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
