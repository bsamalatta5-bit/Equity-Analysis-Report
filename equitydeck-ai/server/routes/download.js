const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

router.get('/download/:fileId', async (req, res) => {
  const { fileId } = req.params;

  // Sanitize fileId — only allow uuid-like strings
  if (!/^[a-f0-9-]{36}$/.test(fileId)) {
    return res.status(400).json({ error: 'Invalid file ID' });
  }

  const filePath = path.join('/tmp', `equitydeck_${fileId}.pptx`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or already downloaded' });
  }

  const companyName = req.query.company
    ? req.query.company.replace(/[^a-zA-Z0-9_-]/g, '_')
    : 'Company';

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="EquityDeck_${companyName}.pptx"`
  );

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('end', () => {
    // Delete after serving
    fs.unlink(filePath, (err) => {
      if (err) console.error('Failed to delete file:', err.message);
    });
  });

  fileStream.on('error', (err) => {
    console.error('File stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream file' });
    }
  });
});

module.exports = router;
