const pptxgen = require('pptxgenjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { resolveColors } = require('../colorEngine');

const slide01 = require('./slide01_title');
const slide02 = require('./slide02_executive');
const slide03 = require('./slide03_overview');
const slide04 = require('./slide04_products');
const slide05 = require('./slide05_revenue');
const slide06 = require('./slide06_financial');
const slide07 = require('./slide07_margins');
const slide08 = require('./slide08_moat');
const slide09 = require('./slide09_growth');
const slide10 = require('./slide10_capital');
const slide11 = require('./slide11_risks');
const slide12 = require('./slide12_thesis');

const SLIDE_MODULES = [
  slide01, slide02, slide03, slide04,
  slide05, slide06, slide07, slide08,
  slide09, slide10, slide11, slide12,
];

/**
 * Build a PowerPoint presentation from research data.
 * @param {object} data - Structured research data matching the schema
 * @param {boolean[]} activeSlides - Array of 12 booleans indicating which slides to include
 * @param {function} onProgress - Optional callback(progress: 0-100)
 * @returns {string} Path to generated .pptx file
 */
async function buildPresentation(data, activeSlides, onProgress) {
  const pres = new pptxgen();

  // Set slide dimensions to LAYOUT_WIDE (13.3" × 7.5")
  pres.layout = 'LAYOUT_WIDE';

  // Resolve brand colors
  const companyName = (data.company && data.company.name) || '';
  const branding = data.branding || {};
  const C = resolveColors(companyName, branding);

  // Set presentation metadata
  pres.title = `${companyName} Equity Research`;
  pres.subject = 'Equity Research Report';
  pres.author = 'EquityDeck AI';

  let builtCount = 0;
  const totalActive = (activeSlides || []).filter(Boolean).length || 1;

  for (let i = 0; i < SLIDE_MODULES.length; i++) {
    const isActive = !activeSlides || activeSlides[i] !== false;
    if (isActive && SLIDE_MODULES[i]) {
      try {
        SLIDE_MODULES[i](pres, data, C);
      } catch (err) {
        console.error(`Error building slide ${i + 1}:`, err.message);
        // Continue building other slides — never crash on missing data
      }
      builtCount++;
      if (onProgress) {
        const progress = Math.round((builtCount / totalActive) * 90); // cap at 90%, rest for file write
        onProgress(progress);
      }
    }
  }

  // Write file
  const fileId = uuidv4();
  const filePath = path.join('/tmp', `equitydeck_${fileId}.pptx`);
  await pres.writeFile({ fileName: filePath });

  if (onProgress) onProgress(100);

  return filePath;
}

module.exports = { buildPresentation };
