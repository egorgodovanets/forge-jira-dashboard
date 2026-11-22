import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartCard } from './ChartCard';
import {
  AXIS_PROPS,
  CHART_HEIGHT,
  CHART_WIDTH,
  GRID_COLOR,
  TOOLTIP_STYLE,
  formatEvents,
} from './chartTheme';

// "2026-10-27" or "2026-10-27T00:00:00.000Z" -> "2026-10-27"
const formatDay = (day) => String(day).slice(0, 10);

// Line chart: number of history events per day (UTC), e.g. [{ day: '2026-10-27', total: 37 }].
export function DailyChart({ data, error, loading, cardRef }) {
  return (
    <ChartCard
      title="Status changes per day"
      data={data}
      error={error}
      loading={loading}
      cardRef={cardRef}
    >
      {(rows) => (
        <LineChart width={CHART_WIDTH} height={CHART_HEIGHT} data={rows}>
          <CartesianGrid vertical={false} stroke={GRID_COLOR} />
          <XAxis dataKey="day" tickFormatter={formatDay} {...AXIS_PROPS} />
          <YAxis allowDecimals={false} {...AXIS_PROPS} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={formatDay} formatter={formatEvents} />
          <Line type="monotone" dataKey="total" stroke="#1d7afc" strokeWidth={2} dot={false} />
        </LineChart>
      )}
    </ChartCard>
  );
}
