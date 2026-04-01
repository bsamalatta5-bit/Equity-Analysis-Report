const express = require('express');
const router = express.Router();
const pptxQueue = require('../jobs/pptxQueue');

router.post('/generate', async (req, res) => {
  const { data, activeSlides } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'data is required' });
  }

  try {
    const job = await pptxQueue.add({ data, activeSlides: activeSlides || Array(12).fill(true) }, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: false,
      removeOnFail: false,
    });

    res.json({ jobId: String(job.id) });
  } catch (err) {
    console.error('Generate route error:', err);
    res.status(500).json({ error: err.message || 'Failed to queue generation' });
  }
});

module.exports = router;
