---
bump: minor
title: useSort drops a saved sort the columns do not offer
---

- **`useSort` takes `options.columns` and ignores a saved sort the columns do
  not offer.** The table makes a column sortable on `sortField ?? key`, and the
  choice is saved per list. A save on a column since given `sortField: ''`, or
  on a key whose column now sorts on another `sortField`, used to go out as
  `?ordering=` on every open — DRF drops a term it cannot order by, so the list
  came back unsorted for good. Given the same columns the table gets, `sort`
  and `ordering` now fall back to the page default instead. The rule is the
  table's own: `sortField ?? key`, never `_select`.

  Backward compatible: without `columns` nothing is checked — and an EMPTY
  array counts as not given, because a list page whose columns are not built
  yet (permission-filtered, or keyed off a fetch) is not a table that offers no
  sort. Read the other way it sent the page default on the first render and the
  saved sort once the columns arrived: two requests per open, the first of them
  sorted wrongly. `SortableColumn` is exported for callers that type the array
  themselves; it is not `DataTable`'s column, which nests inside groups and
  offers a sort on `sortable`.
