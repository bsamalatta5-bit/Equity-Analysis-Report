// Shared data schema used by both client and server
const SCHEMA_TEMPLATE = {
  company: {
    name: null,
    ticker: null,
    exchange: null,
    sector: null,
    ownership: null,
    founded: null,
    hq: null,
    employees: null,
    shariah: null,
  },

  branding: {
    primaryColor: null,
    secondaryColor: null,
    accentColor: null,
    darkColor: null,
  },

  executiveSummary: {
    thesis: null,
    tags: [],
    tagline: null,
  },

  kpis: [
    // { label, value, change, positive }
  ],

  segments: [
    // { name, revenue, revenuePrior, pct, growth, description, color }
  ],

  products: [
    // { name, segment, description }
  ],

  revenueModel: [
    // { number, title, subtitle, points[], color }
  ],

  customerSplit: {
    b2b: null,
    b2g: null,
    b2c: null,
  },

  financials: {
    current: {
      year: null,
      revenue: null,
      grossProfit: null,
      ebit: null,
      netProfit: null,
      ocfToNI: null,
      grossMargin: null,
      ebitMargin: null,
      netMargin: null,
      cash: null,
    },
    prior: {
      year: null,
      revenue: null,
      grossProfit: null,
      ebit: null,
      netProfit: null,
      grossMargin: null,
      ebitMargin: null,
      netMargin: null,
    },
  },

  capitalStructure: {
    cash: null,
    debtEquity: null,
    dividend: null,
    ocfToNI: null,
    highlights: [],
  },

  acquisitions: [
    // { target, value, rationale, impact, synergies, items[] }
  ],

  moat: [
    // { num, title, subtitle, detail, strength }
  ],

  revenueQuality: [
    // { metric, value, color }
  ],

  growthDrivers: [
    // { label, title, color, textColor, points[] }
  ],

  risks: [
    // { title, level, levelColor, risk, mitigant }
  ],

  investmentThesis: [
    // { n, t, b }
  ],

  summaryStats: [
    // { v, l }
  ],
};

// Validate and merge data against schema, filling missing fields with null
function validateAndMerge(data) {
  if (!data || typeof data !== 'object') return JSON.parse(JSON.stringify(SCHEMA_TEMPLATE));

  const result = JSON.parse(JSON.stringify(SCHEMA_TEMPLATE));

  // Deep merge known keys
  for (const key of Object.keys(SCHEMA_TEMPLATE)) {
    if (data[key] !== undefined) {
      if (Array.isArray(SCHEMA_TEMPLATE[key])) {
        result[key] = Array.isArray(data[key]) ? data[key] : [];
      } else if (typeof SCHEMA_TEMPLATE[key] === 'object' && SCHEMA_TEMPLATE[key] !== null) {
        result[key] = mergeObjects(SCHEMA_TEMPLATE[key], data[key]);
      } else {
        result[key] = data[key];
      }
    }
  }

  return result;
}

function mergeObjects(template, incoming) {
  if (!incoming || typeof incoming !== 'object') return template;
  const result = { ...template };
  for (const key of Object.keys(template)) {
    if (incoming[key] !== undefined) {
      if (typeof template[key] === 'object' && template[key] !== null && !Array.isArray(template[key])) {
        result[key] = mergeObjects(template[key], incoming[key]);
      } else {
        result[key] = incoming[key];
      }
    }
  }
  return result;
}

module.exports = { SCHEMA_TEMPLATE, validateAndMerge };
