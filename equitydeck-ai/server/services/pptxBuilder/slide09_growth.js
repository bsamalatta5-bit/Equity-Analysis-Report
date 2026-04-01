const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr } = require('./helpers');

module.exports = function slide09_growth(pres, data, C) {
  const slide = pres.addSlide();
  const drivers = safeArr(data.growthDrivers).slice(0, 3);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Growth Strategy', 'Growth Drivers', null, C);

  const defaultColors = [C.green, C.gold, C.navy];
  const cw = 4.15;

  drivers.forEach((driver, i) => {
    const dx = 0.22 + i * (cw + 0.2);
    const color = safeStr(driver.color, defaultColors[i] || C.green);
    const textColor = safeStr(driver.textColor, C.white);
    const points = safeArr(driver.points);

    slide.addShape(pres.ShapeType.rect, {
      x: dx, y: 1.3, w: cw, h: 5.55,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });

    // Colored header section
    slide.addShape(pres.ShapeType.rect, {
      x: dx, y: 1.3, w: cw, h: 1.5,
      fill: { color }, line: { color },
    });

    // Label chip
    slide.addShape(pres.ShapeType.roundRect, {
      x: dx + 0.2, y: 1.4, w: 1.5, h: 0.28,
      fill: { color: 'FFFFFF22' }, line: { color: 'FFFFFF44' },
      rectRadius: 0.05,
    });
    slide.addText(safeStr(driver.label, `DRIVER ${i + 1}`).toUpperCase(), {
      x: dx + 0.2, y: 1.4, w: 1.5, h: 0.28,
      fontSize: 7, color: textColor, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });

    slide.addText(safeStr(driver.title, `Growth Driver ${i + 1}`), {
      x: dx + 0.2, y: 1.75, w: cw - 0.4, h: 0.85,
      fontSize: 15, color: textColor, bold: true, fontFace: 'Arial', wrap: true,
    });

    // Points
    points.slice(0, 6).forEach((pt, j) => {
      const ptY = 3.0 + j * 0.62;
      slide.addShape(pres.ShapeType.rect, {
        x: dx + 0.2, y: ptY + 0.14, w: 0.08, h: 0.08,
        fill: { color }, line: { color },
      });
      slide.addText(safeStr(pt, ''), {
        x: dx + 0.4, y: ptY, w: cw - 0.6, h: 0.55,
        fontSize: 8.5, color: C.gray1, fontFace: 'Arial', wrap: true,
      });
    });
  });

  addFooter(slide, 9, C);
};
