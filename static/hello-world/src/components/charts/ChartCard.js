import { LoadingBlock, LoadingOverlay } from '../Loading';
import { CHART_HEIGHT, CHART_WIDTH } from './chartTheme';

/**
 * Card with a title that handles the chart states: error, first load, reload.
 * `children` is a function that renders the chart from loaded data (render prop),
 * so the chart is only created once data exists.
 * `cardRef` points to the card element; the PDF export looks for the chart SVG inside it.
 */
export function ChartCard({ title, data, error, loading, cardRef, children }) {
  let content;
  if (error) {
    content = <p className="error">Failed to load: {error}</p>;
  } else if (data) {
    content = <LoadingOverlay loading={loading}>{children(data)}</LoadingOverlay>;
  } else {
    content = <LoadingBlock width={CHART_WIDTH} height={CHART_HEIGHT} />;
  }

  return (
    <div className="card" ref={cardRef}>
      <h3>{title}</h3>
      {content}
    </div>
  );
}
