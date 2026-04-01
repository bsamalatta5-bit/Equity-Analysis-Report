const express = require('express');
const router = express.Router();
const { streamResearch, reviseReport } = require('../services/researchAgent');

// POST /api/research — SSE streaming endpoint
router.post('/research', async (req, res) => {
  const { companyName, ticker } = req.body;

  if (!companyName || !ticker) {
    return res.status(400).json({ error: 'companyName and ticker are required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (obj) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    }
  };

  let aborted = false;

  req.on('close', () => {
    aborted = true;
  });

  try {
    send({ type: 'status', message: `Searching web for ${companyName}...` });

    const gen = streamResearch(companyName, ticker);
    let result;

    while (true) {
      if (aborted) break;

      const { value, done } = await gen.next();

      if (done) {
        result = value;
        break;
      }

      if (value && value.type === 'text') {
        send({ type: 'text', chunk: value.chunk });
      }
    }

    if (!aborted && result) {
      send({ type: 'complete', data: result.extractedData });
    }
  } catch (err) {
    console.error('Research stream error:', err);
    send({ type: 'error', message: err.message || 'Research failed' });
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
});

// POST /api/revise — non-streaming revision
router.post('/revise', async (req, res) => {
  const { currentReport, feedback } = req.body;

  if (!currentReport || !feedback) {
    return res.status(400).json({ error: 'currentReport and feedback are required' });
  }

  try {
    const result = await reviseReport(currentReport, feedback);
    res.json(result);
  } catch (err) {
    console.error('Revise error:', err);
    res.status(500).json({ error: err.message || 'Revision failed' });
  }
});

module.exports = router;
