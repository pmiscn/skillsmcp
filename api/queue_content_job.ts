import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const skillId = 'anthropics::skills::template';
  const skill = await prisma.skill.findUnique({ where: { id: skillId } });
  if (!skill) return;

  const job = await prisma.translationJob.create({
    data: {
      skill_id: skillId,
      target_lang: 'zh',
      source_lang: 'en',
      payload_type: 'content',
      payload: JSON.stringify({
        type: 'content',
        text: skill.content_i18n ? JSON.parse(skill.content_i18n).en : '',
        targetLang: 'zh',
      }),
      status: 'queued',
    },
  });
  console.log('Queued content job:', JSON.stringify(job, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
