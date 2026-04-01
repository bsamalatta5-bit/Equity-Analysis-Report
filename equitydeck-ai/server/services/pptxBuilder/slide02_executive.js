const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr } = require('./helpers');

module.exports = function slide02_executive(pres, data, C) {
  const slide = pres.addSlide();
  const es = data.executiveSummary || {};
  const kpis = safeArr(data.kpis).slice(0, 3);
  const thesis = safeArr(data.investmentThesis).slice(0, 4);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Executive Overview', 'Executive Summary', null, C);

  // Thesis quote card (left)
  slide.addShape(pres.ShapeType.rect, {
    x: 0.25, y: 1.3, w: 5.8, h: 2.2,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 0.25, 1.3, 5.8, C.green);
  slide.addText('"', {
    x: 0.4, y: 1.35, w: 0.6, h: 0.7,
    fontSize: 48, color: C.green, bold: true, fontFace: 'Georgia',
  });
  slide.addText(safeStr(es.thesis, 'No thesis available.'), {
    x: 0.4, y: 1.85, w: 5.5, h: 1.5,
    fontSize: 11, color: C.dark, fontFace: 'Arial',
    wrap: true,
  });

  // 3 KPI cards (right)
  kpis.forEach((kpi, i) => {
    const cx = 6.35;
    const cy = 1.3 + i * 0.78;
    slide.addShape(pres.ShapeType.rect, {
      x: cx, y: cy, w: 6.6, h: 0.68,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    });
    topRule(slide, cx, cy, 6.6, kpi.positive === false ? 'E53E3E' : C.green);
    slide.addText(safeStr(kpi.value, '-'), {
      x: cx + 0.15, y: cy + 0.1, w: 2, h: 0.48,
      fontSize: 18, color: C.dark, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(kpi.label, ''), {
      x: cx + 2.3, y: cy + 0.1, w: 3, h: 0.25,
      fontSize: 8.5, color: C.gray1, fontFace: 'Arial',
    });
    slide.addText(safeStr(kpi.change, ''), {
      x: cx + 2.3, y: cy + 0.35, w: 3, h: 0.25,
      fontSize: 9, color: kpi.positive === false ? 'E53E3E' : C.green,
      bold: true, fontFace: 'Arial',
    });
  });

  // 4 numbered pillar cards (full width below)
  thesis.forEach((item, i) => {
    const px = 0.25 + i * 3.2;
    slide.addShape(pres.ShapeType.rect, {
      x: px, y: 3.7, w: 3.0, h: 2.95,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, px, 3.7, 3.0, C.green);
    slide.addText(String(item.n || i + 1).padStart(2, '0'), {
      x: px + 0.15, y: 3.82, w: 0.7, h: 0.5,
      fontSize: 22, color: C.green, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(item.t, `Pillar ${i + 1}`), {
      x: px + 0.15, y: 4.32, w: 2.7, h: 0.45,
      fontSize: 11, color: C.dark, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(item.b, ''), {
      x: px + 0.15, y: 4.82, w: 2.7, h: 1.65,
      fontSize: 9, color: C.gray1, fontFace: 'Arial', wrap: true,
    });
  });

  addFooter(slide, 2, C);
};
