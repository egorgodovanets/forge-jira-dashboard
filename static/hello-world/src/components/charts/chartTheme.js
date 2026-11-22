// Shared size and styling for both charts, in Atlassian colors.
export const CHART_WIDTH = 480;
export const CHART_HEIGHT = 260;

export const AXIS_PROPS = {
  tick: { fill: '#626f86', fontSize: 12 },
  axisLine: { stroke: '#dcdfe4' },
  tickLine: false,
};

export const GRID_COLOR = '#ebecf0';

export const TOOLTIP_STYLE = { borderRadius: 3, border: '1px solid #dcdfe4', fontSize: 12 };

// Tooltip shows "Events: 123" instead of the raw data key "total".
export const formatEvents = (value) => [value, 'Events'];
