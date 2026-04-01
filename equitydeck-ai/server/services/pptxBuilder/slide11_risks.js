const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr } = require('./helpers');

module.exports = function slide11_risks(pres, data, C) {
  const slide = pres.addSlide();
  const risks = safeArr(data.risks).slice(0, 6);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Risk Assessment', 'Key Risks & Mitigants', null, C);

  const levelColors = { HIGH: 'E53E3E', MEDIUM: 'F59E0B', LOW: '38A169' };
  const cols = 3;
  const cw = 4.15;
  const ch = 2.5;
  const gx = 0.22;
  const gy = 1.3;
  const gapX = 0.2;
  const gapY = 0.22;

  risks.forEach((risk, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rx = gx + col * (cw + gapX);
    const ry = gy + row * (ch + gapY);

    const level = safeStr(risk.level, 'MEDIUM').toUpperCase();
    const levelColor = safeStr(risk.levelColor, levelColors[level] || C.gold);

    slide.addShape(pres.ShapeType.rect, {
      x: rx, y: ry, w: cw, h: ch,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });
    topRule(slide, rx, ry, cw, levelColor);

    // Title + level badge
    slide.addText(safeStr(risk.title, `Risk ${i + 1}`), {
      x: rx + 0.15, y: ry + 0.12, w: 2.9, h: 0.42,
      fontSize: 11, color: C.dark, bold: true, fontFace: 'Arial',
    });

    slide.addShape(pres.ShapeType.roundRect, {
      x: rx + cw - 1.05, y: ry + 0.13, w: 0.88, h: 0.28,
      fill: { color: levelColor }, line: { color: levelColor },
      rectRadius: 0.05,
    });
    slide.addText(level, {
      x: rx + cw - 1.05, y: ry + 0.13, w: 0.88, h: 0.28,
      fontSize: 7.5, color: C.white, bold: true, align: 'center', valign: 'middle', fontFace: 'Arial',
    });

    // Risk text
    slide.addText(safeStr(risk.risk, ''), {
      x: rx + 0.15, y: ry + 0.62, w: cw - 0.3, h: 0.85,
      fontSize: 8.5, color: C.gray1, fontFace: 'Arial', wrap: true,
    });

    // Separator
    slide.addShape(pres.ShapeType.rect, {
      x: rx + 0.15, y: ry + 1.5, w: cw - 0.3, h: 0.01,
      fill: { color: C.navyPale }, line: { color: C.navyPale },
    });

    // Mitigant (green)
    slide.addText('MITIGANT', {
      x: rx + 0.15, y: ry + 1.58, w: 1.5, h: 0.2,
      fontSize: 6.5, color: C.green, bold: true, charSpacing: 2, fontFace: 'Arial',
    });
    slide.addText(safeStr(risk.mitigant, ''), {
      x: rx + 0.15, y: ry + 1.8, w: cw - 0.3, h: 0.6,
      fontSize: 8, color: C.green, fontFace: 'Arial', wrap: true,
    });
  });

  addFooter(slide, 11, C);
};
