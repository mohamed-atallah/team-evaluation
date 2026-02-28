const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const jobTitleId = '3037f59d-6483-4a0b-9878-3a9d313c8f85'; // from previous output if I could see it, but I'll fetch it again

    const evaluationId = '14b30f3d-c848-471d-9fe6-2122f16717b3';
    const evaluation = await prisma.evaluation.findUnique({
        where: { id: evaluationId },
        include: { evaluatee: true }
    });

    const jId = evaluation.evaluatee.jobTitleId;
    console.log('Job Title ID:', jId);

    const jobTitleCriteria = await prisma.jobTitleCriteria.findMany({
        where: { jobTitleId: jId },
        include: { criteria: true }
    });

    console.log('\n--- Criteria in Job Title ---');
    jobTitleCriteria.forEach(jc => {
        console.log(`- ${jc.criteria.name} (${jc.criteria.id})`);
    });

    const scores = await prisma.evaluationScore.findMany({
        where: { evaluationId },
        include: { criteria: true }
    });

    console.log('\n--- Scores in Evaluation ---');
    scores.forEach(s => {
        console.log(`- ${s.criteria.name} (${s.criteriaId}): ${s.score}`);
    });
}

main().finally(() => prisma.$disconnect());
