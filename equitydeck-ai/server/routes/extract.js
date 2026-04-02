const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');
const { SCHEMA_TEMPLATE, validateAndMerge } = require('../../shared/schema');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
});

const SCHEMA_STRING = JSON.stringify(SCHEMA_TEMPLATE, null, 2);

async function extractWithClaude(pdfText, isRetry = false) {
  const retryPrefix = isRetry
    ? 'The JSON you returned was invalid. Fix it and return only valid JSON.\n\n'
    : '';

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 8000,
    system: `You are a data extraction AI. Extract all equity research data from the document and return ONLY valid JSON matching this schema: ${SCHEMA_STRING}. No markdown, no commentary, no code fences. Return raw JSON only.`,
    messages: [
      {
        role: 'user',
        content: `${retryPrefix}Extract all equity research data from this PDF content:\n\n${pdfText}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Strip any accidental markdown fences
  const cleaned = text.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

router.post('/extract', upload.single('report'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Parse PDF
    let pdfData;
    try {
      pdfData = await pdfParse(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ error: 'Failed to parse PDF: ' + err.message });
    }

    const pdfText = pdfData.text;
    if (!pdfText || pdfText.trim().length < 50) {
      return res.status(400).json({ error: 'PDF appears to be empty or unreadable' });
    }

    // First extraction attempt
    let extracted;
    try {
      extracted = await extractWithClaude(pdfText, false);
    } catch (err) {
      // Retry once on JSON parse failure
      try {
        extracted = await extractWithClaude(pdfText, true);
      } catch (retryErr) {
        return res.status(500).json({
          error: 'Failed to extract structured data from PDF',
          details: retryErr.message,
        });
      }
    }

    const validatedData = validateAndMerge(extracted);
    res.json({ success: true, data: validatedData });
  } catch (err) {
    console.error('Extract route error:', err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 25MB.' });
    }
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

module.exports = router;
