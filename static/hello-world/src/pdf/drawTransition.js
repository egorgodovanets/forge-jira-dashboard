// Built-in PDF fonts can't render '→', so the Transition cell is drawn by hand:
// "<from> [vector arrow] <to>". Sizes are in mm.
const ARROW_GAP = 2;
const ARROW_LENGTH = 5;
const MUTED_COLOR = [133, 144, 162];

// Spaces in the cell text reserve room for the arrow when autotable measures column widths.
export const TRANSITION_PLACEHOLDER = ' '.repeat(10);

/**
 * Draws one Transition cell. Called from autotable's didDrawCell hook.
 * @param doc - jsPDF document
 * @param cell - autotable cell (position, size, styles)
 * @param transition - { from, to, created }
 */
export function drawTransition(doc, cell, { from, to, created }) {
  const fontSize = doc.getFontSize() / doc.internal.scaleFactor; // pt -> mm
  // Same baseline autotable uses for regular cells, so the text lines up with other columns.
  const baseline = cell.getTextPos().y + fontSize * 0.85;
  const arrowY = baseline - fontSize * 0.3; // vertical middle of lowercase letters
  const textColor = [].concat(cell.styles.textColor); // number (gray) or [r, g, b]
  let x = cell.x + cell.padding('left');

  // "Created" is secondary information, so it's gray.
  doc.setTextColor(...(created ? MUTED_COLOR : textColor));
  doc.text(from, x, baseline);
  x += doc.getTextWidth(from) + ARROW_GAP;

  // Arrow: a thin line plus a filled triangle as the head.
  const headStart = x + ARROW_LENGTH - 1.6;
  doc.setDrawColor(...MUTED_COLOR);
  doc.setFillColor(...MUTED_COLOR);
  doc.setLineWidth(0.3);
  doc.line(x, arrowY, headStart, arrowY);
  doc.triangle(headStart, arrowY - 0.9, headStart, arrowY + 0.9, x + ARROW_LENGTH, arrowY, 'F');
  x += ARROW_LENGTH + ARROW_GAP;

  doc.setTextColor(...textColor);
  doc.text(to, x, baseline);
}
