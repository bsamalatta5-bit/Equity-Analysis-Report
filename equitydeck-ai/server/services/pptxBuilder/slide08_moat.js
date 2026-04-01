const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr, safeNum } = require('./helpers');

module.exports = function slide08_moat(pres, data, C) {
  const slide = pres.addSlide();
  const moat = safeArr(data.moat).slice(0, 3);
  const rq = safeArr(data.revenueQuality);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Competitive Advantage', 'Economic Moat', null, C);

  const moatColors = [C.green, C.gold, C.navy];

  moat.forEach((m, i) => {
    const mx = 0.22 + i * 4.35;
    const strength = Math.min(100, Math.max(0, safeNum(m.strength, 75)));
    const color = moatColors[i] || C.green;

    slide.addShape(pres.ShapeType.rect, {
      x: mx, y: 1.3, w: 4.1, h: 4.2,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, mx, 1.3, 4.1, color);

    slide.addText(String(m.num || i + 1), {
      x: mx + 0.2, y: 1.45, w: 0.7, h: 0.55,
      fontSize: 28, color, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(m.title, `Moat ${i + 1}`), {
      x: mx + 0.2, y: 2.05, w: 3.7, h: 0.42,
      fontSize: 13, color: C.dark, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(m.subtitle, ''), {
      x: mx + 0.2, y: 2.5, w: 3.7, h: 0.35,
      fontSize: 9, color: C.gray1, fontFace: 'Arial',
    });
    slide.addText(safeStr(m.detail, ''), {
      x: mx + 0.2, y: 2.9, w: 3.7, h: 1.5,
      fontSize: 8.5, color: C.gray1, fontFace: 'Arial', wrap: true,
    });

    // Strength progress bar
    slide.addText('STRENGTH', {
      x: mx + 0.2, y: 4.5, w: 2, h: 0.25,
      fontSize: 7, color: C.gray1, charSpacing: 2, fontFace: 'Arial',
    });
    slide.addText(`${strength}%`, {
      x: mx + 2.8, y: 4.5, w: 1.1, h: 0.25,
      fontSize: 7, color, bold: true, align: 'right', fontFace: 'Arial',
    });
    // Background bar
    slide.addShape(pres.ShapeType.rect, {
      x: mx + 0.2, y: 4.78, w: 3.7, h: 0.15,
      fill: { color: C.navyPale }, line: { color: C.navyPale },
    });
    // Fill bar
    slide.addShape(pres.ShapeType.rect, {
      x: mx + 0.2, y: 4.78, w: 3.7 * (strength / 100), h: 0.15,
      fill: { color }, line: { color },
    });
  });

  // Revenue Quality Scorecard panel (full width below)
  slide.addShape(pres.ShapeType.rect, {
    x: 0.22, y: 5.7, w: 12.86, h: 1.2,
    fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
    shadow: makeCardShadow(),
  });
  topRule(slide, 0.22, 5.7, 12.86, C.navy);
  slide.addText('REVENUE QUALITY SCORECARD', {
    x: 0.4, y: 5.8, w: 4, h: 0.25,
    fontSize: 7.5, color: C.navy, bold: true, charSpacing: 2, fontFace: 'Arial',
  });

  rq.slice(0, 5).forEach((item, i) => {
    const ix = 0.4 + i * 2.55;
    const col = safeStr(item.color, C.green);
    slide.addText(safeStr(item.metric, ''), {
      x: ix, y: 6.08, w: 2.3, h: 0.3,
      fontSize: 7.5, color: C.gray1, fontFace: 'Arial',
    });
    slide.addShape(pres.ShapeType.roundRect, {
      x: ix, y: 6.42, w: 2.3, h: 0.35,
      fill: { color: col }, line: { color: col },
      rectRadius: 0.05,
    });
    slide.addText(safeStr(item.value, ''), {
      x: ix, y: 6.42, w: 2.3, h: 0.35,
      fontSize: 9, color: C.white, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });
  });

  addFooter(slide, 8, C);
};
