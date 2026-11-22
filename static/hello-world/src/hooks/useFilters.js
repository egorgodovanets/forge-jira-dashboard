import { useState } from 'react';

const EMPTY_FILTERS = { productId: '', status: '', dateFrom: '', dateTo: '' };

/**
 * Filter values plus the current page.
 * Any filter change resets the page to 1: page 37 of the old selection
 * usually doesn't exist in the new one.
 */
export function useFilters() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const setFilter = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const hasFilters = Object.values(filters).some((value) => value !== '');

  return { filters, setFilter, resetFilters, hasFilters, page, setPage };
}
