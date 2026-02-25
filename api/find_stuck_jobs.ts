import prisma from './db.js';

async function findStuckJobs() {
  const LOCK_TIMEOUT_MINUTES = 15;
  const lockExpirationDate = new Date(Date.now() - LOCK_TIMEOUT_MINUTES * 60 * 1000);

  const stuckJobs = await prisma.translationJob.findMany({
    where: {
      status: 'processing',
      locked_at: { lt: lockExpirationDate },
    },
  });

  console.log(`Found ${stuckJobs.length} stuck jobs:`);
  stuckJobs.forEach((job: any) => {
    console.log(
      `ID: ${job.id}, Skill: ${job.skill_id}, Locked At: ${job.locked_at}, Locked By: ${job.locked_by}`,
    );
  });

  if (stuckJobs.length > 0) {
    console.log('Resetting stuck jobs to queued...');
    const result = await prisma.translationJob.updateMany({
      where: {
        id: { in: stuckJobs.map((j: any) => j.id) },
      },
      data: {
        status: 'queued',
        locked_at: null,
        locked_by: null,
        attempts: { increment: 1 },
      },
    });
    console.log(`Reset ${result.count} jobs.`);
  }
}

findStuckJobs()
  .catch((err) => console.error(err))
  .finally(() => prisma.$disconnect());
