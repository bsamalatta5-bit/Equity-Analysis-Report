/**
 * PPTX Helper Functions
 * All color values must be 6-char hex WITHOUT the # symbol
 */

function addHeader(slide, pres, tag, title, badge, C) {
  // Navy header bar
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 1.08,
    fill: { color: C.navy },
    line: { color: C.navy },
  });

  // Green rule below header
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 1.08, w: '100%', h: 0.06,
    fill: { color: C.green },
    line: { color: C.green },
  });

  // Tag text (green, letter-spaced)
  if (tag) {
    slide.addText(tag.toUpperCase(), {
      x: 0.4, y: 0.08, w: 8, h: 0.35,
      fontSize: 8,
      color: C.green,
      bold: true,
      charSpacing: 4,
      fontFace: 'Arial',
    });
  }

  // Title text (white, bold)
  slide.addText(title || '', {
    x: 0.4, y: 0.42, w: badge ? 9 : 12, h: 0.56,
    fontSize: 22,
    color: C.white,
    bold: true,
    fontFace: 'Arial',
  });

  // Optional badge (top-right, green background)
  if (badge) {
    slide.addShape(pres.ShapeType.roundRect, {
      x: 10.5, y: 0.2, w: 2.4, h: 0.55,
      fill: { color: C.green },
      line: { color: C.green },
      rectRadius: 0.08,
    });
    slide.addText(badge, {
      x: 10.5, y: 0.2, w: 2.4, h: 0.55,
      fontSize: 9,
      color: C.white,
      bold: true,
      align: 'center',
      valign: 'middle',
      fontFace: 'Arial',
    });
  }
}

function addFooter(slide, pageNum, C) {
  // Navy footer bar
  slide.addShape('rect', {
    x: 0, y: 7.05, w: '100%', h: 0.45,
    fill: { color: C.navy },
    line: { color: C.navy },
  });

  // Left label
  slide.addText('Equity Research Report | FY 2025', {
    x: 0.3, y: 7.08, w: 8, h: 0.35,
    fontSize: 7.5,
    color: C.gray2,
    fontFace: 'Arial',
    valign: 'middle',
  });

  // Page number right
  slide.addText(`${pageNum} / 12`, {
    x: 10.8, y: 7.08, w: 2.2, h: 0.35,
    fontSize: 7.5,
    color: C.gray2,
    align: 'right',
    fontFace: 'Arial',
    valign: 'middle',
  });
}

function topRule(slide, x, y, w, color) {
  slide.addShape('rect', {
    x, y, w, h: 0.07,
    fill: { color },
    line: { color },
  });
}

function makeCardShadow() {
  return {
    type: 'outer',
    blur: 12,
    offset: 4,
    angle: 135,
    color: '000000',
    opacity: 0.07,
  };
}

function makeShadow() {
  return {
    type: 'outer',
    blur: 8,
    offset: 3,
    angle: 135,
    color: '000000',
    opacity: 0.10,
  };
}

function safeStr(val, fallback = '') {
  if (val === null || val === undefined) return fallback;
  return String(val);
}

function safeNum(val, fallback = 0) {
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}

function safeArr(val, fallback = []) {
  return Array.isArray(val) ? val : fallback;
}

module.exports = { addHeader, addFooter, topRule, makeCardShadow, makeShadow, safeStr, safeNum, safeArr };
