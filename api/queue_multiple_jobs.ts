import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const skills = await prisma.skill.findMany({ take: 3 });

  for (const skill of skills) {
    const job = await prisma.translationJob.create({
      data: {
        skill_id: skill.id,
        target_lang: 'zh',
        source_lang: 'en',
        payload_type: 'description',
        payload: JSON.stringify({
          type: 'description',
          text: skill.description,
          targetLang: 'zh',
        }),
        status: 'queued',
      },
    });
    console.log(`Queued description job for ${skill.id}:`, job.id);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
