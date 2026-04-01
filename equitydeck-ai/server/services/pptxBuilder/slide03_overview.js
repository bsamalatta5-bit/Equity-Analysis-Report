const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr, safeNum } = require('./helpers');

module.exports = function slide03_overview(pres, data, C) {
  const slide = pres.addSlide();
  const co = data.company || {};
  const segments = safeArr(data.segments).slice(0, 3);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Company Overview', 'Business Overview', null, C);

  // Company facts table (left 4.7")
  slide.addShape(pres.ShapeType.rect, {
    x: 0.25, y: 1.3, w: 4.7, h: 5.5,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 0.25, 1.3, 4.7, C.green);

  slide.addText('COMPANY FACTS', {
    x: 0.45, y: 1.45, w: 4.3, h: 0.3,
    fontSize: 8, color: C.green, bold: true, charSpacing: 3, fontFace: 'Arial',
  });

  const facts = [
    { l: 'Full Name', v: safeStr(co.name, 'N/A') },
    { l: 'Ticker', v: safeStr(co.ticker, 'N/A') },
    { l: 'Exchange', v: safeStr(co.exchange, 'TASI') },
    { l: 'Sector', v: safeStr(co.sector, 'N/A') },
    { l: 'Ownership', v: safeStr(co.ownership, 'N/A') },
    { l: 'Founded', v: safeStr(co.founded, 'N/A') },
    { l: 'HQ', v: safeStr(co.hq, 'N/A') },
    { l: 'Employees', v: safeStr(co.employees, 'N/A') },
    { l: 'Shariah', v: safeStr(co.shariah, 'N/A') },
  ];

  facts.forEach((f, i) => {
    const fy = 1.9 + i * 0.5;
    const isEven = i % 2 === 0;
    if (isEven) {
      slide.addShape(pres.ShapeType.rect, {
        x: 0.25, y: fy, w: 4.7, h: 0.5,
        fill: { color: C.navyPale }, line: { color: C.navyPale },
      });
    }
    slide.addText(f.l, {
      x: 0.4, y: fy + 0.08, w: 1.5, h: 0.35,
      fontSize: 8.5, color: C.gray1, fontFace: 'Arial',
    });
    slide.addText(f.v, {
      x: 1.95, y: fy + 0.08, w: 2.8, h: 0.35,
      fontSize: 8.5, color: C.dark, bold: true, fontFace: 'Arial',
    });
  });

  // 3 segment cards (right)
  const segColors = [C.green, C.gold, C.gray1];
  segments.forEach((seg, i) => {
    const sx = 5.2;
    const sy = 1.3 + i * 1.9;
    slide.addShape(pres.ShapeType.rect, {
      x: sx, y: sy, w: 7.8, h: 1.75,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    const segColor = safeStr(seg.color, segColors[i] || C.green);
    topRule(slide, sx, sy, 7.8, segColor);

    // Segment % badge
    slide.addShape(pres.ShapeType.roundRect, {
      x: sx + 0.15, y: sy + 0.18, w: 1.0, h: 0.55,
      fill: { color: segColor }, line: { color: segColor },
      rectRadius: 0.06,
    });
    slide.addText(`${safeNum(seg.pct, 0)}%`, {
      x: sx + 0.15, y: sy + 0.18, w: 1.0, h: 0.55,
      fontSize: 16, color: C.white, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });

    slide.addText(safeStr(seg.name, `Segment ${i + 1}`), {
      x: sx + 1.3, y: sy + 0.15, w: 4, h: 0.38,
      fontSize: 12, color: C.dark, bold: true, fontFace: 'Arial',
    });

    // YoY badge
    const growth = safeNum(seg.growth, 0);
    const growthColor = growth >= 0 ? C.green : 'E53E3E';
    slide.addShape(pres.ShapeType.roundRect, {
      x: sx + 5.5, y: sy + 0.18, w: 1.5, h: 0.35,
      fill: { color: growth >= 0 ? C.greenPale : 'FEE2E2' },
      line: { color: growth >= 0 ? C.greenPale : 'FEE2E2' },
      rectRadius: 0.06,
    });
    slide.addText(`${growth >= 0 ? '+' : ''}${growth}% YoY`, {
      x: sx + 5.5, y: sy + 0.18, w: 1.5, h: 0.35,
      fontSize: 8, color: growthColor, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });

    slide.addText(`SAR ${safeStr(seg.revenue, 'N/A')}M`, {
      x: sx + 1.3, y: sy + 0.58, w: 4, h: 0.3,
      fontSize: 9.5, color: C.gray1, fontFace: 'Arial',
    });
    slide.addText(safeStr(seg.description, ''), {
      x: sx + 0.15, y: sy + 0.98, w: 7.5, h: 0.65,
      fontSize: 8.5, color: C.gray1, fontFace: 'Arial', wrap: true,
    });
  });

  addFooter(slide, 3, C);
};
