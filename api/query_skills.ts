import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const skills = await prisma.skill.findMany({
    where: {
      OR: [{ name_zh: { not: null } }, { content_i18n: { not: null } }],
    },
    take: 5,
  });
  console.log(
    JSON.stringify(
      skills.map((s) => ({
        id: s.id,
        name: s.name,
        name_zh: s.name_zh,
        description: s.description,
        description_zh: (s as any).description_zh,
        content_i18n: s.content_i18n,
      })),
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
