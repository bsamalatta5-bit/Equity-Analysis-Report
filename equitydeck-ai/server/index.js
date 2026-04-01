require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api', require('./routes/research'));
app.use('/api', require('./routes/extract'));
app.use('/api', require('./routes/generate'));
app.use('/api', require('./routes/status'));
app.use('/api', require('./routes/download'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Cleanup old /tmp/*.pptx files every 30 minutes
const CLEANUP_INTERVAL = 30 * 60 * 1000;
const MAX_FILE_AGE = 2 * 60 * 60 * 1000; // 2 hours

function cleanupOldFiles() {
  const tmpDir = '/tmp';
  try {
    const files = fs.readdirSync(tmpDir);
    const now = Date.now();
    files
      .filter((f) => f.startsWith('equitydeck_') && f.endsWith('.pptx'))
      .forEach((file) => {
        const filePath = path.join(tmpDir, file);
        try {
          const stat = fs.statSync(filePath);
          if (now - stat.mtimeMs > MAX_FILE_AGE) {
            fs.unlinkSync(filePath);
            console.log(`Cleaned up old file: ${file}`);
          }
        } catch (e) {
          // File already deleted or inaccessible
        }
      });
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

setInterval(cleanupOldFiles, CLEANUP_INTERVAL);
cleanupOldFiles(); // Run once on startup

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`EquityDeck AI server running on port ${PORT}`);
});

module.exports = app;
