const { addHeader, addFooter, topRule, makeCardShadow, safeStr, safeArr } = require('./helpers');

module.exports = function slide04_products(pres, data, C) {
  const slide = pres.addSlide();
  const products = safeArr(data.products).slice(0, 6);

  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: '100%',
    fill: { color: C.offWhite }, line: { color: C.offWhite },
  });

  addHeader(slide, pres, 'Products & Services', 'Product Portfolio', null, C);

  const cardColors = [C.green, C.gold, C.gray1, C.green, C.gold, C.gray1];
  const cols = 3;
  const cw = 4.15;
  const ch = 2.55;
  const gx = 0.22;
  const gy = 1.3;
  const gapX = 0.2;
  const gapY = 0.2;

  products.forEach((prod, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const px = gx + col * (cw + gapX);
    const py = gy + row * (ch + gapY);
    const color = safeStr(prod.color, cardColors[i] || C.green);

    slide.addShape(pres.ShapeType.rect, {
      x: px, y: py, w: cw, h: ch,
      fill: { color: C.white }, line: { color: C.navyPale, pt: 1 },
      shadow: makeCardShadow(),
    });

    // Colored header
    slide.addShape(pres.ShapeType.rect, {
      x: px, y: py, w: cw, h: 0.65,
      fill: { color }, line: { color },
    });
    slide.addText(safeStr(prod.name, `Product ${i + 1}`), {
      x: px + 0.15, y: py + 0.08, w: cw - 0.3, h: 0.48,
      fontSize: 12, color: C.white, bold: true, fontFace: 'Arial',
    });

    // Segment badge
    slide.addShape(pres.ShapeType.roundRect, {
      x: px + 0.15, y: py + 0.78, w: 2.2, h: 0.28,
      fill: { color: C.navyPale }, line: { color: C.navyPale },
      rectRadius: 0.05,
    });
    slide.addText(safeStr(prod.segment, 'General'), {
      x: px + 0.15, y: py + 0.78, w: 2.2, h: 0.28,
      fontSize: 7.5, color: C.gray1, align: 'center', valign: 'middle', fontFace: 'Arial',
    });

    // Description
    slide.addText(safeStr(prod.description, ''), {
      x: px + 0.15, y: py + 1.15, w: cw - 0.3, h: 1.3,
      fontSize: 8.5, color: C.gray1, fontFace: 'Arial', wrap: true,
    });
  });

  // Note bar at bottom
  slide.addShape(pres.ShapeType.rect, {
    x: 0, y: 6.7, w: '100%', h: 0.35,
    fill: { color: C.navyPale }, line: { color: C.navyPale },
  });
  slide.addText('Product lineup based on latest available company filings and investor presentations.', {
    x: 0.3, y: 6.72, w: 12.7, h: 0.3,
    fontSize: 7.5, color: C.gray1, fontFace: 'Arial',
  });

  addFooter(slide, 4, C);
};
