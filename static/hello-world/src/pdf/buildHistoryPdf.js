import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { statusLabel } from '../constants/status';
import { drawTransition, TRANSITION_PLACEHOLDER } from './drawTransition';

// Layout in mm. A4 portrait is 210 mm wide: 14 mm margins leave 182 mm,
// which fits two charts of 88 mm with a 6 mm gap.
const MARGIN = 14;
const CHART_WIDTH = 88;
const CHART_GAP = 6;
const CHARTS_TOP = 48;
const TRANSITION_COLUMN = 3;

/**
 * Builds the history report: title, filters summary, charts and the full table.
 * Pure function: data in, jsPDF document out (the caller decides when to save it).
 *
 * @param rows - rows from the getHistoryExport resolver
 * @param truncated - true if the export hit the row limit
 * @param filters - { productId, status, dateFrom, dateTo }
 * @param productName - display name of the selected product
 * @param charts - [{ png, width, height } | null] from chartToPng
 */
export function buildHistoryPdf({ rows, truncated, filters, productName, charts }) {
  const doc = new jsPDF(); // A4 portrait, units in mm

  drawHeader(doc, { rowCount: rows.length, truncated, filters, productName });
  const tableTop = drawCharts(doc, charts);
  drawTable(doc, rows, tableTop);

  return doc;
}

function drawHeader(doc, { rowCount, truncated, filters, productName }) {
  const { status, dateFrom, dateTo } = filters;
  const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' '); // UTC

  const summary = [
    `Product: ${productName}`,
    `Status: ${status ? statusLabel(status) : 'All statuses'}`,
    `Period: ${dateFrom || 'any'} - ${dateTo || 'any'} (UTC)`,
    `Rows: ${rowCount}${truncated ? ' (limit reached, older rows not included)' : ''}`,
    `Generated: ${generatedAt} UTC`,
  ];

  doc.setFontSize(16);
  doc.text('Task history', MARGIN, 15);

  // An array of strings is printed line by line.
  doc.setFontSize(10);
  doc.text(summary, MARGIN, 23);
}

// Places the charts side by side and returns the Y where the table should start.
function drawCharts(doc, charts) {
  let tableTop = CHARTS_TOP;

  charts.forEach((chart, index) => {
    if (!chart) return;

    // Keep the original aspect ratio.
    const chartHeight = (chart.height / chart.width) * CHART_WIDTH;
    const x = MARGIN + index * (CHART_WIDTH + CHART_GAP);

    doc.addImage(chart.png, 'PNG', x, CHARTS_TOP, CHART_WIDTH, chartHeight);
    tableTop = Math.max(tableTop, CHARTS_TOP + chartHeight + CHART_GAP);
  });

  return tableTop;
}

function drawTable(doc, rows, startY) {
  const transitions = rows.map((row) => ({
    from: row.from_status ? statusLabel(row.from_status) : 'Created',
    to: statusLabel(row.to_status),
    created: !row.from_status,
  }));

  const isTransitionCell = (data) =>
    data.section === 'body' && data.column.index === TRANSITION_COLUMN;

  autoTable(doc, {
    startY, // only affects the first page
    headStyles: { fillColor: [12, 102, 228] }, // Atlassian blue
    // Fit the Transition column to its content so it never wraps.
    columnStyles: { [TRANSITION_COLUMN]: { cellWidth: 'wrap' } },
    head: [['Date', 'Product', 'Task', 'Transition']],
    body: rows.map((row, index) => [
      row.changed_at,
      row.product_name,
      row.task_name,
      // Only used to measure the column width, the cell is drawn by hand below.
      `${transitions[index].from}${TRANSITION_PLACEHOLDER}${transitions[index].to}`,
    ]),
    // Skip the default text output for Transition cells (background and borders stay)...
    willDrawCell: (data) => {
      if (isTransitionCell(data)) data.cell.text = [];
    },
    // ...and draw "<from> → <to>" instead.
    didDrawCell: (data) => {
      if (isTransitionCell(data)) drawTransition(doc, data.cell, transitions[data.row.index]);
    },
  });
}
