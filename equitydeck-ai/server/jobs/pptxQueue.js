const Bull = require('bull');
const { buildPresentation } = require('../services/pptxBuilder');

const pptxQueue = new Bull('pptx-generation', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
});

pptxQueue.process(2, async (job) => {
  const { data, activeSlides } = job.data;

  const filePath = await buildPresentation(data, activeSlides, (progress) => {
    job.progress(progress);
  });

  return { filePath };
});

pptxQueue.on('error', (err) => {
  console.error('PPTX Queue error:', err);
});

pptxQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

module.exports = pptxQueue;
