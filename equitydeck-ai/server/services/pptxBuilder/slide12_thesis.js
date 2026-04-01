const { addFooter, safeStr, safeArr } = require('./helpers');

module.exports = function slide12_thesis(pres, data, C) {
  const slide = pres.addSlide();
  const thesis = safeArr(data.investmentThesis).slice(0, 4);
  const stats = safeArr(data.summaryStats).slice(0, 6);
  const es = data.executiveSummary || {};
  const co = data.company || {};

  // Full dark bg
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.dark }, line: { color: C.dark },
  });

  // Left green accent bar
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: '100%',
    fill: { color: C.green }, line: { color: C.green },
  });

  // Right panel
  slide.addShape(pres.ShapeType.rect, {
    x: 8.5, y: 0, w: 4.8, h: '100%',
    fill: { color: C.navy }, line: { color: C.navy },
  });

  // Header area
  slide.addText('INVESTMENT THESIS', {
    x: 0.5, y: 0.3, w: 7.8, h: 0.3,
    fontSize: 8, color: C.green, bold: true, charSpacing: 4, fontFace: 'Arial',
  });
  slide.addText(safeStr(co.name, 'Investment Case'), {
    x: 0.5, y: 0.62, w: 7.8, h: 0.75,
    fontSize: 26, color: C.white, bold: true, fontFace: 'Arial',
  });
  slide.addText(safeStr(es.tagline, ''), {
    x: 0.5, y: 1.38, w: 7.8, h: 0.38,
    fontSize: 11, color: C.gray2, fontFace: 'Arial',
  });

  // Separator
  slide.addShape(pres.ShapeType.rect, {
    x: 0.5, y: 1.85, w: 7.8, h: 0.04,
    fill: { color: C.green }, line: { color: C.green },
  });

  // 4 numbered thesis points (left)
  thesis.forEach((item, i) => {
    const ty = 2.05 + i * 1.2;
    // Number circle
    slide.addShape(pres.ShapeType.ellipse, {
      x: 0.5, y: ty + 0.05, w: 0.5, h: 0.5,
      fill: { color: C.green }, line: { color: C.green },
    });
    slide.addText(String(item.n || i + 1), {
      x: 0.5, y: ty + 0.05, w: 0.5, h: 0.5,
      fontSize: 11, color: C.white, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });

    slide.addText(safeStr(item.t, `Point ${i + 1}`), {
      x: 1.15, y: ty + 0.06, w: 7.1, h: 0.35,
      fontSize: 12, color: C.white, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(item.b, ''), {
      x: 1.15, y: ty + 0.44, w: 7.1, h: 0.65,
      fontSize: 8.5, color: C.gray2, fontFace: 'Arial', wrap: true,
    });
  });

  // 6 summary stat boxes (right panel)
  stats.forEach((stat, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = 8.7 + col * 2.25;
    const sy = 0.5 + row * 2.25;

    slide.addShape(pres.ShapeType.rect, {
      x: sx, y: sy, w: 2.15, h: 2.05,
      fill: { color: C.navyMid }, line: { color: C.navyMid },
    });

    slide.addText(safeStr(stat.v, '-'), {
      x: sx + 0.12, y: sy + 0.35, w: 1.92, h: 0.85,
      fontSize: 22, color: C.white, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });
    slide.addText(safeStr(stat.l, ''), {
      x: sx + 0.12, y: sy + 1.35, w: 1.92, h: 0.55,
      fontSize: 8, color: C.gray2, align: 'center', fontFace: 'Arial', wrap: true,
    });

    // Green top accent
    slide.addShape(pres.ShapeType.rect, {
      x: sx, y: sy, w: 2.15, h: 0.08,
      fill: { color: C.green }, line: { color: C.green },
    });
  });

  addFooter(slide, 12, C);
};
