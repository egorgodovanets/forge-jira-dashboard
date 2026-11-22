import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import { STATUS_COLORS, statusLabel } from '../../constants/status';
import { ChartCard } from './ChartCard';
import {
  AXIS_PROPS,
  CHART_HEIGHT,
  CHART_WIDTH,
  GRID_COLOR,
  TOOLTIP_STYLE,
  formatEvents,
} from './chartTheme';

// Bar chart: number of history events per target status, e.g. [{ status: 'done', total: 444 }].
export function StatusChart({ data, error, loading, cardRef }) {
  return (
    <ChartCard
      title="Events by target status"
      data={data}
      error={error}
      loading={loading}
      cardRef={cardRef}
    >
      {(rows) => (
        <BarChart width={CHART_WIDTH} height={CHART_HEIGHT} data={rows}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="status" tickFormatter={statusLabel} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip
            cursor={{ fill: '#091e420f' }}
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={statusLabel}
            formatter={formatEvents}
          />
          <Bar dataKey="total" radius={[3, 3, 0, 0]}>
            {rows.map((row) => (
              <Cell key={row.status} fill={STATUS_COLORS[row.status] ?? '#1d7afc'} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ChartCard>
  );
}
