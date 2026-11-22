import { useState } from 'react';
import { invoke } from '@forge/bridge';
import { buildHistoryPdf } from '../pdf/buildHistoryPdf';
import { chartToPng } from '../pdf/chartToPng';

/**
 * PDF export flow: load all filtered rows -> snapshot charts -> build and save the PDF.
 * chartRefs point to DOM elements that contain the Recharts SVGs.
 */
export function usePdfExport({ filters, products, chartRefs }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const exportPdf = async () => {
    setExporting(true);
    setExportError(null);

    try {
      const { rows, truncated } = await invoke('getHistoryExport', filters);
      const charts = await Promise.all(chartRefs.map((ref) => chartToPng(ref.current)));

      // productId from <select> is a string, DB ids are numbers.
      const productName =
        products.find((product) => String(product.id) === filters.productId)?.name ??
        'All products';

      const doc = buildHistoryPdf({ rows, truncated, filters, productName, charts });
      doc.save('task-history.pdf');
    } catch (err) {
      console.error('PDF export failed', err);
      setExportError(err?.message ?? String(err));
    } finally {
      // Re-enable the button even if the export failed.
      setExporting(false);
    }
  };

  return { exportPdf, exporting, exportError };
}
