const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeNum, safeArr } = require('./helpers');

module.exports = function slide10_capital(pres, data, C) {
  const slide = pres.addSlide();
  const cap = data.capitalStructure || {};
  const fin = data.financials || {};
  const cur = fin.current || {};
  const pri = fin.prior || {};
  const highlights = safeArr(cap.highlights);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Capital & Cash Flow', 'Capital Structure', null, C);

  // 4 KPI cards top
  const capKpis = [
    { l: 'Cash & Equivalents', v: `SAR ${safeNum(cap.cash, safeNum(cur.cash, 0)).toLocaleString()}M` },
    { l: 'Debt / Equity', v: safeStr(cap.debtEquity, 'N/A') },
    { l: 'Dividend Yield', v: safeStr(cap.dividend, 'N/A') },
    { l: 'OCF / Net Income', v: safeStr(cap.ocfToNI, safeStr(cur.ocfToNI, 'N/A')) },
  ];

  capKpis.forEach((k, i) => {
    const kx = 0.22 + i * 3.22;
    slide.addShape(pres.ShapeType.rect, {
      x: kx, y: 1.28, w: 3.0, h: 1.05,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, kx, 1.28, 3.0, C.green);
    slide.addText(k.v, {
      x: kx + 0.15, y: 1.36, w: 2.7, h: 0.48,
      fontSize: 16, color: C.dark, bold: true, fontFace: 'Arial',
    });
    slide.addText(k.l.toUpperCase(), {
      x: kx + 0.15, y: 1.86, w: 2.7, h: 0.3,
      fontSize: 7.5, color: C.gray1, bold: true, charSpacing: 2, fontFace: 'Arial',
    });
  });

  // Cash flow bar chart left
  slide.addShape(pres.ShapeType.rect, {
    x: 0.22, y: 2.55, w: 6.2, h: 4.15,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 0.22, 2.55, 6.2, C.green);
  slide.addText('CASH & PROFIT (SAR M)', {
    x: 0.4, y: 2.65, w: 5.8, h: 0.3,
    fontSize: 7.5, color: C.green, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  const cfBars = [
    { l: 'Cash', cur: safeNum(cur.cash, 0), pri: 0 },
    { l: 'OCF ratio', cur: safeNum(cur.ocfToNI, 0), pri: 0 },
    { l: 'Net Profit', cur: safeNum(cur.netProfit, 0), pri: safeNum(pri.netProfit, 0) },
  ];

  const maxCF = Math.max(...cfBars.map((b) => Math.max(b.cur, b.pri)), 1);
  const barH_scale = 2.8;

  cfBars.forEach((bar, i) => {
    const gx = 0.6 + i * 1.85;
    const bh_cur = (bar.cur / maxCF) * barH_scale;
    const bh_pri = bar.pri > 0 ? (bar.pri / maxCF) * barH_scale : 0;
    const baseY = 5.9;

    if (bh_pri > 0) {
      slide.addShape(pres.ShapeType.rect, {
        x: gx, y: baseY - bh_pri, w: 0.65, h: bh_pri,
        fill: { color: C.gray2 }, line: { color: C.gray2 },
      });
    }
    slide.addShape(pres.ShapeType.rect, {
      x: gx + (bh_pri > 0 ? 0.75 : 0), y: baseY - bh_cur, w: 0.65, h: Math.max(bh_cur, 0.05),
      fill: { color: C.green }, line: { color: C.green },
    });
    slide.addText(`${bar.cur.toLocaleString()}`, {
      x: gx, y: baseY - bh_cur - 0.28, w: 1.4, h: 0.25,
      fontSize: 7.5, color: C.dark, bold: true, align: 'center', fontFace: 'Arial',
    });
    slide.addText(bar.l, {
      x: gx, y: baseY + 0.05, w: 1.5, h: 0.3,
      fontSize: 8, color: C.gray1, align: 'center', fontFace: 'Arial',
    });
  });

  // Highlights table right
  slide.addShape(pres.ShapeType.rect, {
    x: 6.65, y: 2.55, w: 6.45, h: 4.15,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 6.65, 2.55, 6.45, C.navy);
  slide.addText('CAPITAL HIGHLIGHTS', {
    x: 6.85, y: 2.65, w: 6.0, h: 0.3,
    fontSize: 7.5, color: C.navy, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  highlights.slice(0, 6).forEach((hl, i) => {
    const ry = 3.1 + i * 0.55;
    const isEven = i % 2 === 0;
    if (isEven) {
      slide.addShape(pres.ShapeType.rect, {
        x: 6.65, y: ry - 0.05, w: 6.45, h: 0.55,
        fill: { color: C.navyPale }, line: { color: C.navyPale },
      });
    }
    slide.addShape(pres.ShapeType.rect, {
      x: 6.75, y: ry + 0.15, w: 0.06, h: 0.06,
      fill: { color: C.green }, line: { color: C.green },
    });
    slide.addText(safeStr(hl, ''), {
      x: 6.9, y: ry + 0.04, w: 6.0, h: 0.45,
      fontSize: 8.5, color: C.dark, fontFace: 'Arial', wrap: true,
    });
  });

  addFooter(slide, 10, C);
};
