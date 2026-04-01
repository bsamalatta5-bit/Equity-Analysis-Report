const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr, safeNum } = require('./helpers');

module.exports = function slide05_revenue(pres, data, C) {
  const slide = pres.addSlide();
  const models = safeArr(data.revenueModel).slice(0, 3);
  const cs = data.customerSplit || {};

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Revenue Analysis', 'Revenue Model', null, C);

  const modelColors = [C.green, C.gold, C.navy];
  const cw = 4.15;

  models.forEach((model, i) => {
    const px = 0.22 + i * (cw + 0.2);
    const py = 1.3;
    const color = safeStr(model.color, modelColors[i] || C.green);

    slide.addShape(pres.ShapeType.rect, {
      x: px, y: py, w: cw, h: 5.0,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, px, py, cw, color);

    // Number
    slide.addText(safeStr(model.number, `0${i + 1}`), {
      x: px + 0.2, y: py + 0.18, w: 0.8, h: 0.55,
      fontSize: 28, color, bold: true, fontFace: 'Arial',
    });

    slide.addText(safeStr(model.title, `Stream ${i + 1}`), {
      x: px + 0.2, y: py + 0.78, w: cw - 0.4, h: 0.45,
      fontSize: 13, color: C.dark, bold: true, fontFace: 'Arial',
    });
    slide.addText(safeStr(model.subtitle, ''), {
      x: px + 0.2, y: py + 1.25, w: cw - 0.4, h: 0.35,
      fontSize: 9, color: C.gray1, fontFace: 'Arial',
    });

    // Points
    const points = safeArr(model.points);
    points.forEach((pt, j) => {
      const ptY = py + 1.75 + j * 0.6;
      slide.addShape(pres.ShapeType.rect, {
        x: px + 0.2, y: ptY + 0.12, w: 0.06, h: 0.06,
        fill: { color }, line: { color },
      });
      slide.addText(safeStr(pt, ''), {
        x: px + 0.38, y: ptY, w: cw - 0.6, h: 0.52,
        fontSize: 8.5, color: C.gray1, fontFace: 'Arial', wrap: true,
      });
    });
  });

  // B2B/B2G split bar at bottom
  const b2b = safeNum(cs.b2b, 0);
  const b2g = safeNum(cs.b2g, 0);
  const b2c = safeNum(cs.b2c, 0);
  const total = b2b + b2g + b2c || 100;
  const bw = 12.86;
  const bh = 0.5;
  const by = 6.55;

  slide.addShape(pres.ShapeType.rect, {
    x: 0.22, y: by, w: bw * (b2b / total), h: bh,
    fill: { color: C.green }, line: { color: C.green },
  });
  slide.addShape(pres.ShapeType.rect, {
    x: 0.22 + bw * (b2b / total), y: by, w: bw * (b2g / total), h: bh,
    fill: { color: C.navy }, line: { color: C.navy },
  });
  slide.addShape(pres.ShapeType.rect, {
    x: 0.22 + bw * ((b2b + b2g) / total), y: by, w: bw * (b2c / total), h: bh,
    fill: { color: C.gold }, line: { color: C.gold },
  });

  const labels = [
    { l: `B2B ${b2b}%`, c: C.white, x: 0.22 },
    { l: `B2G ${b2g}%`, c: C.white, x: 0.22 + bw * (b2b / total) },
    { l: `B2C ${b2c}%`, c: C.white, x: 0.22 + bw * ((b2b + b2g) / total) },
  ];
  labels.forEach((lb) => {
    if (lb.l.match(/\d+%/) && parseInt(lb.l.match(/(\d+)%/)[1]) > 5) {
      slide.addText(lb.l, {
        x: lb.x + 0.1, y: by + 0.05, w: 2, h: 0.4,
        fontSize: 9, color: lb.c, bold: true, fontFace: 'Arial',
      });
    }
  });

  addFooter(slide, 5, C);
};
