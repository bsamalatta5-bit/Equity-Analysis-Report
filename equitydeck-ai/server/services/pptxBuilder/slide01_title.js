const { addFooter, safeStr, safeArr, safeNum } = require('./helpers');

module.exports = function slide01_title(pres, data, C) {
  const slide = pres.addSlide();
  const co = data.company || {};
  const es = data.executiveSummary || {};
  const kpis = safeArr(data.kpis).slice(0, 3);

  // Full dark bg
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.dark },
    line: { color: C.dark },
  });

  // Left green accent bar
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: '100%',
    fill: { color: C.green },
    line: { color: C.green },
  });

  // Right panel
  slide.addShape(pres.ShapeType.rect, {
    x: 8.8, y: 0, w: 4.5, h: '100%',
    fill: { color: C.navy },
    line: { color: C.navy },
  });

  // Company name (left content)
  slide.addText(safeStr(co.name, 'Company Name'), {
    x: 0.5, y: 0.7, w: 8, h: 1.1,
    fontSize: 38,
    color: C.white,
    bold: true,
    fontFace: 'Arial',
  });

  // Arabic name / tagline subtitle
  slide.addText(safeStr(es.tagline, safeStr(co.sector, 'TASI Listed Company')), {
    x: 0.5, y: 1.75, w: 8, h: 0.5,
    fontSize: 14,
    color: C.gray2,
    fontFace: 'Arial',
  });

  // Tags
  const tags = safeArr(es.tags).slice(0, 4);
  tags.forEach((tag, i) => {
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.5 + i * 2.0, y: 2.4, w: 1.8, h: 0.35,
      fill: { color: C.navyMid },
      line: { color: C.green, pt: 1 },
      rectRadius: 0.06,
    });
    slide.addText(safeStr(tag).toUpperCase(), {
      x: 0.5 + i * 2.0, y: 2.4, w: 1.8, h: 0.35,
      fontSize: 7.5,
      color: C.green,
      bold: true,
      align: 'center',
      valign: 'middle',
      fontFace: 'Arial',
    });
  });

  // KPI chips
  kpis.forEach((kpi, i) => {
    const bx = 0.5 + i * 2.65;
    slide.addShape(pres.ShapeType.roundRect, {
      x: bx, y: 3.0, w: 2.4, h: 0.65,
      fill: { color: C.navyMid },
      line: { color: C.navyMid },
      rectRadius: 0.08,
    });
    slide.addText([
      { text: safeStr(kpi.value, '-'), options: { fontSize: 15, bold: true, color: C.white } },
      { text: '\n' + safeStr(kpi.label, ''), options: { fontSize: 7, color: C.gray2 } },
    ], {
      x: bx, y: 3.0, w: 2.4, h: 0.65,
      align: 'center',
      valign: 'middle',
      fontFace: 'Arial',
    });
  });

  // Founded badge
  if (co.founded) {
    slide.addText(`Est. ${co.founded}`, {
      x: 0.5, y: 3.85, w: 3, h: 0.35,
      fontSize: 9,
      color: C.gray1,
      fontFace: 'Arial',
    });
  }

  // Right panel content — 3 stat boxes
  const rightStats = [
    { l: 'Ticker', v: safeStr(co.ticker, 'N/A') },
    { l: 'Exchange', v: safeStr(co.exchange, 'TASI') },
    { l: 'Sector', v: safeStr(co.sector, 'N/A') },
  ];
  rightStats.forEach((stat, i) => {
    const sy = 1.2 + i * 1.8;
    slide.addShape(pres.ShapeType.rect, {
      x: 9.0, y: sy, w: 4.1, h: 1.4,
      fill: { color: C.navyMid },
      line: { color: C.navyMid },
    });
    slide.addText(stat.l.toUpperCase(), {
      x: 9.1, y: sy + 0.12, w: 3.9, h: 0.3,
      fontSize: 7,
      color: C.green,
      bold: true,
      charSpacing: 3,
      fontFace: 'Arial',
    });
    slide.addText(stat.v, {
      x: 9.1, y: sy + 0.45, w: 3.9, h: 0.7,
      fontSize: 22,
      color: C.white,
      bold: true,
      fontFace: 'Arial',
    });
  });

  addFooter(slide, 1, C);
};
