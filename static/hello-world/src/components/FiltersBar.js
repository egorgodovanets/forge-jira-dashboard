import { STATUS_LABELS } from '../constants/status';

// A form control with a small label above it.
function Field({ label, children }) {
  return (
    <label className="filter">
      <span className="filter-label">{label}</span>
      {children}
    </label>
  );
}

/**
 * Date range, product and status filters.
 * Controlled component: values come from `filters`, changes go to onChange(name, value).
 */
export function FiltersBar({ filters, products, onChange }) {
  return (
    <div className="filters">
      <Field label="From">
        <input
          className="field"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange('dateFrom', e.target.value)}
        />
      </Field>

      <Field label="To">
        <input
          className="field"
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange('dateTo', e.target.value)}
        />
      </Field>

      <Field label="Product">
        <select
          className="field"
          value={filters.productId}
          onChange={(e) => onChange('productId', e.target.value)}
        >
          <option value="">All products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Status">
        <select
          className="field"
          value={filters.status}
          onChange={(e) => onChange('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}
