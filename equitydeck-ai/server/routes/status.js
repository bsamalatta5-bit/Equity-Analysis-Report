const express = require('express');
const router = express.Router();
const pptxQueue = require('../jobs/pptxQueue');

router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await pptxQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job._progress || 0;

    let status;
    switch (state) {
      case 'waiting':
      case 'delayed':
        status = 'queued';
        break;
      case 'active':
        status = 'processing';
        break;
      case 'completed':
        status = 'complete';
        break;
      case 'failed':
        status = 'failed';
        break;
      default:
        status = 'queued';
    }

    let fileUrl = null;
    if (status === 'complete' && job.returnvalue && job.returnvalue.filePath) {
      const filePath = job.returnvalue.filePath;
      const fileId = filePath.split('/').pop().replace('.pptx', '').replace('equitydeck_', '');
      fileUrl = `/api/download/${fileId}`;
    }

    res.json({
      status,
      progress: status === 'complete' ? 100 : progress,
      fileUrl,
      error: status === 'failed' ? (job.failedReason || 'Generation failed') : null,
    });
  } catch (err) {
    console.error('Status route error:', err);
    res.status(500).json({ error: err.message || 'Failed to get status' });
  }
});

module.exports = router;
