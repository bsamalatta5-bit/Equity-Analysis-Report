const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeNum, safeArr } = require('./helpers');

module.exports = function slide06_financial(pres, data, C) {
  const slide = pres.addSlide();
  const fin = data.financials || {};
  const cur = fin.current || {};
  const pri = fin.prior || {};
  const kpis = safeArr(data.kpis).slice(0, 4);
  const segments = safeArr(data.segments).slice(0, 5);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Financial Performance', 'Financial Highlights', null, C);

  // 4 KPI cards top
  const topKpis = [
    { l: 'Revenue', v: `SAR ${safeNum(cur.revenue, 0).toLocaleString()}M`, c: safeNum(cur.revenue, 0) >= safeNum(pri.revenue, 0) },
    { l: 'Gross Profit', v: `SAR ${safeNum(cur.grossProfit, 0).toLocaleString()}M`, c: true },
    { l: 'Net Profit', v: `SAR ${safeNum(cur.netProfit, 0).toLocaleString()}M`, c: safeNum(cur.netProfit, 0) > 0 },
    { l: 'EBIT', v: `SAR ${safeNum(cur.ebit, 0).toLocaleString()}M`, c: safeNum(cur.ebit, 0) > 0 },
  ];

  topKpis.forEach((k, i) => {
    const kx = 0.22 + i * 3.22;
    slide.addShape(pres.ShapeType.rect, {
      x: kx, y: 1.28, w: 3.0, h: 1.05,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, kx, 1.28, 3.0, k.c ? C.green : 'E53E3E');
    slide.addText(k.v, {
      x: kx + 0.15, y: 1.36, w: 2.7, h: 0.48,
      fontSize: 16, color: C.dark, bold: true, fontFace: 'Arial',
    });
    slide.addText(k.l.toUpperCase(), {
      x: kx + 0.15, y: 1.86, w: 2.7, h: 0.3,
      fontSize: 7.5, color: C.gray1, bold: true, charSpacing: 2, fontFace: 'Arial',
    });
  });

  // Bar chart (segments) — left half
  slide.addShape(pres.ShapeType.rect, {
    x: 0.22, y: 2.55, w: 6.2, h: 4.15,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 0.22, 2.55, 6.2, C.green);
  slide.addText('SEGMENT REVENUE (SAR M)', {
    x: 0.4, y: 2.65, w: 5.8, h: 0.3,
    fontSize: 7.5, color: C.green, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  const maxRev = Math.max(...segments.map((s) => safeNum(s.revenue, 0)), 1);
  const barAreaH = 3.0;
  const barAreaY = 3.05;
  const barW = segments.length > 0 ? Math.min(0.9, 5.5 / segments.length - 0.1) : 0.9;

  segments.forEach((seg, i) => {
    const bh = (safeNum(seg.revenue, 0) / maxRev) * barAreaH;
    const bx = 0.6 + i * (5.5 / Math.max(segments.length, 1));
    const by = barAreaY + (barAreaH - bh);
    const color = safeStr(seg.color, C.green);

    slide.addShape(pres.ShapeType.rect, {
      x: bx, y: by, w: barW, h: bh,
      fill: { color }, line: { color },
    });
    slide.addText(safeStr(seg.name, ''), {
      x: bx - 0.1, y: 6.1, w: barW + 0.2, h: 0.45,
      fontSize: 7, color: C.gray1, align: 'center', fontFace: 'Arial', wrap: true,
    });
    slide.addText(`${safeNum(seg.revenue, 0)}`, {
      x: bx - 0.1, y: by - 0.28, w: barW + 0.2, h: 0.25,
      fontSize: 7.5, color: C.dark, bold: true, align: 'center', fontFace: 'Arial',
    });
  });

  // Profitability line chart — right half (simplified as stacked data)
  slide.addShape(pres.ShapeType.rect, {
    x: 6.65, y: 2.55, w: 6.45, h: 4.15,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 6.65, 2.55, 6.45, C.navy);
  slide.addText('PROFITABILITY TREND', {
    x: 6.85, y: 2.65, w: 6.0, h: 0.3,
    fontSize: 7.5, color: C.navy, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  const pRows = [
    { l: 'Revenue', cv: safeNum(cur.revenue, 0), pv: safeNum(pri.revenue, 0) },
    { l: 'Gross Profit', cv: safeNum(cur.grossProfit, 0), pv: safeNum(pri.grossProfit, 0) },
    { l: 'EBIT', cv: safeNum(cur.ebit, 0), pv: safeNum(pri.ebit, 0) },
    { l: 'Net Profit', cv: safeNum(cur.netProfit, 0), pv: safeNum(pri.netProfit, 0) },
  ];

  pRows.forEach((row, i) => {
    const ry = 3.1 + i * 0.85;
    const isEven = i % 2 === 0;
    if (isEven) {
      slide.addShape(pres.ShapeType.rect, {
        x: 6.65, y: ry - 0.05, w: 6.45, h: 0.85,
        fill: { color: C.navyPale }, line: { color: C.navyPale },
      });
    }
    slide.addText(row.l, {
      x: 6.85, y: ry + 0.08, w: 2.2, h: 0.45,
      fontSize: 9, color: C.dark, fontFace: 'Arial',
    });
    slide.addText(`${row.pv.toLocaleString()}`, {
      x: 9.2, y: ry + 0.08, w: 1.8, h: 0.45,
      fontSize: 10, color: C.gray1, align: 'right', fontFace: 'Arial',
    });
    slide.addText(`${row.cv.toLocaleString()}`, {
      x: 11.2, y: ry + 0.08, w: 1.7, h: 0.45,
      fontSize: 10, color: C.dark, bold: true, align: 'right', fontFace: 'Arial',
    });
  });

  slide.addText(safeStr(pri.year, 'Prior Year'), {
    x: 9.2, y: 2.88, w: 1.8, h: 0.25,
    fontSize: 7.5, color: C.gray1, align: 'right', fontFace: 'Arial',
  });
  slide.addText(safeStr(cur.year, 'Current Year'), {
    x: 11.2, y: 2.88, w: 1.7, h: 0.25,
    fontSize: 7.5, color: C.dark, bold: true, align: 'right', fontFace: 'Arial',
  });

  addFooter(slide, 6, C);
};
