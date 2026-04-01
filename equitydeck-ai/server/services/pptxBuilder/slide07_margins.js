const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeNum, safeArr } = require('./helpers');

module.exports = function slide07_margins(pres, data, C) {
  const slide = pres.addSlide();
  const fin = data.financials || {};
  const cur = fin.current || {};
  const pri = fin.prior || {};
  const rq = safeArr(data.revenueQuality);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Margin Analysis', 'Profitability & Margins', null, C);

  // 4 margin KPI cards top
  const margins = [
    { l: 'Gross Margin', cv: safeNum(cur.grossMargin, 0), pv: safeNum(pri.grossMargin, 0) },
    { l: 'EBIT Margin', cv: safeNum(cur.ebitMargin, 0), pv: safeNum(pri.ebitMargin, 0) },
    { l: 'Net Margin', cv: safeNum(cur.netMargin, 0), pv: safeNum(pri.netMargin, 0) },
    { l: 'OCF / Net Income', cv: safeNum(cur.ocfToNI, 0), pv: 0 },
  ];

  margins.forEach((m, i) => {
    const kx = 0.22 + i * 3.22;
    const delta = m.cv - m.pv;
    const isGood = delta >= 0;
    slide.addShape(pres.ShapeType.rect, {
      x: kx, y: 1.28, w: 3.0, h: 1.05,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, kx, 1.28, 3.0, isGood ? C.green : 'E53E3E');
    slide.addText(`${m.cv}%`, {
      x: kx + 0.15, y: 1.36, w: 2.0, h: 0.48,
      fontSize: 20, color: C.dark, bold: true, fontFace: 'Arial',
    });
    if (m.pv !== 0) {
      slide.addText(`${isGood ? '+' : ''}${delta.toFixed(1)}pp YoY`, {
        x: kx + 2.05, y: 1.36, w: 0.9, h: 0.48,
        fontSize: 8, color: isGood ? C.green : 'E53E3E', bold: true, fontFace: 'Arial', valign: 'bottom',
      });
    }
    slide.addText(m.l.toUpperCase(), {
      x: kx + 0.15, y: 1.86, w: 2.7, h: 0.3,
      fontSize: 7.5, color: C.gray1, bold: true, charSpacing: 2, fontFace: 'Arial',
    });
  });

  // Bar chart (margins) left
  slide.addShape(pres.ShapeType.rect, {
    x: 0.22, y: 2.55, w: 6.2, h: 4.15,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 0.22, 2.55, 6.2, C.green);
  slide.addText('MARGIN COMPARISON (%)', {
    x: 0.4, y: 2.65, w: 5.8, h: 0.3,
    fontSize: 7.5, color: C.green, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  const marginBars = [
    { l: 'Gross', cur: safeNum(cur.grossMargin, 0), pri: safeNum(pri.grossMargin, 0) },
    { l: 'EBIT', cur: safeNum(cur.ebitMargin, 0), pri: safeNum(pri.ebitMargin, 0) },
    { l: 'Net', cur: safeNum(cur.netMargin, 0), pri: safeNum(pri.netMargin, 0) },
  ];

  const maxM = Math.max(...marginBars.map((m) => Math.max(m.cur, m.pri)), 1);
  const barGroupW = 1.6;
  const barH_scale = 2.8;

  marginBars.forEach((mb, i) => {
    const gx = 0.55 + i * 1.85;
    const bh_cur = (mb.cur / maxM) * barH_scale;
    const bh_pri = (mb.pri / maxM) * barH_scale;
    const baseY = 5.9;

    // Prior year bar (gray)
    slide.addShape(pres.ShapeType.rect, {
      x: gx, y: baseY - bh_pri, w: 0.65, h: bh_pri,
      fill: { color: C.gray2 }, line: { color: C.gray2 },
    });
    // Current year bar (green)
    slide.addShape(pres.ShapeType.rect, {
      x: gx + 0.75, y: baseY - bh_cur, w: 0.65, h: bh_cur,
      fill: { color: C.green }, line: { color: C.green },
    });

    slide.addText(`${mb.cur}%`, {
      x: gx + 0.75, y: baseY - bh_cur - 0.28, w: 0.65, h: 0.25,
      fontSize: 7.5, color: C.dark, bold: true, align: 'center', fontFace: 'Arial',
    });
    slide.addText(mb.l, {
      x: gx, y: baseY + 0.05, w: 1.4, h: 0.3,
      fontSize: 8, color: C.gray1, align: 'center', fontFace: 'Arial',
    });
  });

  // Legend
  slide.addShape(pres.ShapeType.rect, {
    x: 0.5, y: 6.55, w: 0.25, h: 0.12,
    fill: { color: C.gray2 }, line: { color: C.gray2 },
  });
  slide.addText(safeStr(pri.year, 'Prior'), {
    x: 0.82, y: 6.5, w: 1, h: 0.2, fontSize: 7.5, color: C.gray1, fontFace: 'Arial',
  });
  slide.addShape(pres.ShapeType.rect, {
    x: 1.8, y: 6.55, w: 0.25, h: 0.12,
    fill: { color: C.green }, line: { color: C.green },
  });
  slide.addText(safeStr(cur.year, 'Current'), {
    x: 2.12, y: 6.5, w: 1, h: 0.2, fontSize: 7.5, color: C.gray1, fontFace: 'Arial',
  });

  // Revenue quality table right
  slide.addShape(pres.ShapeType.rect, {
    x: 6.65, y: 2.55, w: 6.45, h: 4.15,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 6.65, 2.55, 6.45, C.navy);
  slide.addText('REVENUE QUALITY SCORECARD', {
    x: 6.85, y: 2.65, w: 6.0, h: 0.3,
    fontSize: 7.5, color: C.navy, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  rq.slice(0, 6).forEach((item, i) => {
    const ry = 3.1 + i * 0.55;
    const isEven = i % 2 === 0;
    if (isEven) {
      slide.addShape(pres.ShapeType.rect, {
        x: 6.65, y: ry - 0.05, w: 6.45, h: 0.55,
        fill: { color: C.navyPale }, line: { color: C.navyPale },
      });
    }
    slide.addText(safeStr(item.metric, ''), {
      x: 6.85, y: ry + 0.04, w: 3.5, h: 0.38,
      fontSize: 9, color: C.dark, fontFace: 'Arial',
    });
    const col = safeStr(item.color, C.green);
    slide.addShape(pres.ShapeType.roundRect, {
      x: 10.55, y: ry + 0.04, w: 1.8, h: 0.33,
      fill: { color: col }, line: { color: col },
      rectRadius: 0.05,
    });
    slide.addText(safeStr(item.value, ''), {
      x: 10.55, y: ry + 0.04, w: 1.8, h: 0.33,
      fontSize: 8.5, color: C.white, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });
  });

  addFooter(slide, 7, C);
};
