import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const skillId = 'anthropics::skills::template';
  const job = await prisma.translationJob.create({
    data: {
      skill_id: skillId,
      target_lang: 'zh',
      source_lang: 'en',
      payload_type: 'name',
      payload: JSON.stringify({
        type: 'name',
        text: 'template-skill',
        targetLang: 'zh',
      }),
      status: 'queued',
    },
  });
  console.log('Queued job:', JSON.stringify(job, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
