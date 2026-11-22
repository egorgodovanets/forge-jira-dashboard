/**
 * Converts a Recharts SVG inside `container` to a PNG for jsPDF:
 * SVG -> string -> Image -> canvas -> PNG data URL.
 * Resolves to { png, width, height }, or null if there is no chart yet.
 */
export function chartToPng(container) {
  return new Promise((resolve, reject) => {
    const svg = container?.querySelector('svg.recharts-surface');
    if (!svg) {
      resolve(null);
      return;
    }

    const width = svg.clientWidth;
    const height = svg.clientHeight;

    // The SVG becomes a standalone image without page CSS, so copy the font explicitly
    // (otherwise chart labels fall back to a serif font in the PDF).
    const clone = svg.cloneNode(true);
    clone.setAttribute('font-family', getComputedStyle(svg).fontFamily);
    const svgString = new XMLSerializer().serializeToString(clone);

    const image = new Image();
    image.onload = () => {
      // Render at 2x so the chart stays sharp in the PDF.
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff'; // SVG background is transparent
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      resolve({ png: canvas.toDataURL('image/png'), width, height });
    };
    image.onerror = reject;
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}
