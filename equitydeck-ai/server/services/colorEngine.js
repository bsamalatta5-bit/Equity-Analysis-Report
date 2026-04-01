/**
 * Color Engine — resolves brand colors for PPTX generation.
 * All colors are 6-char hex WITHOUT the # symbol.
 */

const KNOWN_BRANDS = {
  elm: {
    navy: '0A1628',
    navyMid: '112240',
    green: '00A86B',
    greenLight: '00C47E',
    greenPale: 'E6F7F1',
    navyPale: 'EDF1F7',
    white: 'FFFFFF',
    offWhite: 'F8F9FC',
    gray1: '64748B',
    gray2: '94A3B8',
    gold: 'F59E0B',
    goldLight: 'FEF3C7',
    dark: '0F172A',
  },
  stc: {
    navy: '3A0CA3',
    navyMid: '4C1D95',
    green: '7209B7',
    greenLight: '9333EA',
    greenPale: 'F3E8FF',
    navyPale: 'EDE9FE',
    white: 'FFFFFF',
    offWhite: 'F9F7FF',
    gray1: '64748B',
    gray2: '94A3B8',
    gold: 'F59E0B',
    goldLight: 'FEF3C7',
    dark: '1E1B4B',
  },
  aramco: {
    navy: '003366',
    navyMid: '004080',
    green: '0070C0',
    greenLight: '0090E0',
    greenPale: 'E0F0FF',
    navyPale: 'EBF3FF',
    white: 'FFFFFF',
    offWhite: 'F5F9FF',
    gray1: '64748B',
    gray2: '94A3B8',
    gold: 'F59E0B',
    goldLight: 'FEF3C7',
    dark: '00264D',
  },
  sabic: {
    navy: '1B3A5C',
    navyMid: '254D7A',
    green: '00843D',
    greenLight: '00A64D',
    greenPale: 'E6F5ED',
    navyPale: 'EEF3F8',
    white: 'FFFFFF',
    offWhite: 'F6FAF8',
    gray1: '64748B',
    gray2: '94A3B8',
    gold: 'F59E0B',
    goldLight: 'FEF3C7',
    dark: '112233',
  },
  sab: {
    navy: '1A1A6E',
    navyMid: '23237A',
    green: 'C8A951',
    greenLight: 'DFC070',
    greenPale: 'FBF7EC',
    navyPale: 'EDEDF8',
    white: 'FFFFFF',
    offWhite: 'F9F9FD',
    gray1: '64748B',
    gray2: '94A3B8',
    gold: 'C8A951',
    goldLight: 'FBF7EC',
    dark: '0F0F4A',
  },
  rajhi: {
    navy: '006241',
    navyMid: '007A52',
    green: 'C9A84C',
    greenLight: 'E0C070',
    greenPale: 'FBF8EE',
    navyPale: 'E6F4EF',
    white: 'FFFFFF',
    offWhite: 'F8FBF9',
    gray1: '64748B',
    gray2: '94A3B8',
    gold: 'C9A84C',
    goldLight: 'FBF8EE',
    dark: '004229',
  },
};

const DEFAULT_PALETTE = {
  navy: '0A1628',
  navyMid: '112240',
  green: '1D7A5F',
  greenLight: '25A07C',
  greenPale: 'E8F5F1',
  navyPale: 'EEF2F8',
  white: 'FFFFFF',
  offWhite: 'F8FAFC',
  gray1: '64748B',
  gray2: '94A3B8',
  gold: 'F59E0B',
  goldLight: 'FEF3C7',
  dark: '0F172A',
};

function isValidHex(str) {
  return typeof str === 'string' && /^[0-9A-Fa-f]{6}$/.test(str.replace('#', ''));
}

function cleanHex(str) {
  return str.replace('#', '').toUpperCase();
}

function resolveColors(companyName, branding) {
  // 1. Check known brands
  const nameLower = (companyName || '').toLowerCase();
  for (const [key, palette] of Object.entries(KNOWN_BRANDS)) {
    if (nameLower.includes(key)) {
      return { ...palette };
    }
  }

  // 2. Use extracted branding if valid hex values present
  if (branding && typeof branding === 'object') {
    const primary = branding.primaryColor || branding.primary;
    const secondary = branding.secondaryColor || branding.secondary;
    const dark = branding.darkColor || branding.dark;

    if (isValidHex(primary) && isValidHex(secondary)) {
      const p = cleanHex(primary);
      const s = cleanHex(secondary);
      const d = dark && isValidHex(dark) ? cleanHex(dark) : '0F172A';

      return {
        ...DEFAULT_PALETTE,
        navy: d,
        navyMid: d,
        green: p,
        greenLight: s,
        dark: d,
      };
    }
  }

  // 3. Fall back to default financial palette
  return { ...DEFAULT_PALETTE };
}

module.exports = { resolveColors };
