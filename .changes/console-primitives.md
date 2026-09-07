---
bump: minor
title: Console primitives — a soft status tier, a badge emphasis axis, SettingRow and BudgetBar
---

- **A soft status tier, in the token layer, with its ink measured.** A status
  used to be an opaque tint (`bg-green-100`) and a foreground calibrated against
  one backdrop: the flat surface. On a raised panel or a hovered row that tint
  is the same flat patch and reads as a hole, because it does not know what is
  behind it. `--status-<group>-soft` is a wash of the group's own hue, so one
  value composites correctly over `--surface`, `--surface-raised` and a hovered
  row alike — and, being transparent, it is the same value in both themes.

  The ink had to move with it, and the obvious ink was the trap. `--success-text`
  / `--warning-text` / `--danger-text` clear AA on the flat surface — brand.css
  says so and measures it — and over a wash of their own hue they do not:
  4.02:1, 3.91:1 and 3.59:1 in light, 2.82:1, 4.58:1 and 3.86:1 in dark, against
  the darkest surface a badge can land on. Six of eight under AA. So the soft
  tier carries `--status-<group>-soft-ink`, one step further along the same hue,
  and the floor it achieves is **5.67:1 light and 5.39:1 dark** across all nine
  groups on all three surfaces. `tests/statusSoftTier.test.ts` measures every
  pair rather than pinning its hex, and fails the build under 4.5 — including a
  spec that fails if the ink is ever folded back onto the `-text` roles.

  `GROUP_COLORS` now reads those tokens, which also retires the nine
  `[data-theme="dark"] .bg-green-100.text-green-800` rules a tenth group would
  have had to remember to add. `StatusBadge` and `ColoredBadge` change colour by
  a shade in light and are unchanged in substance in dark.

- **`StatusBadge` takes `emphasis`.** `subtle` (the default) is the quiet
  register above; `solid` is a saturated fill with white on it, for the one
  place the same fact is the headline. The same two words `Banner` already uses,
  because the kit has one vocabulary for "how loud" rather than one per
  component. A risk tier can now be quiet in a dense table row and loud in the
  detail header that row opens without a second component and without a call
  site picking colours. The provider's status→group mapping is untouched;
  emphasis changes the volume and never the mapping.

- **`Switch` takes `disabledReason`, and `disabledReasonId`.** The same contract
  `Button` has carried: persistent text beside the control, wired with
  `aria-describedby`, never a `title` — a tooltip needs a hover a disabled
  control does not reliably get. `disabledReasonId` is the case a console runs
  into that a form does not: eight controls dead for ONE reason. Point them all
  at one element and the sentence is written once on the screen and announced
  once per control, instead of repeated eight times.

- **`SettingRow`** — a setting's name and its current value on one baseline,
  with the explanation at full width beneath in a smaller voice. It replaces a
  fixed narrow description column that folded a six-character badge onto three
  lines while the right half of the row sat empty; the fix is not a wider column
  but no column, so the value never shrinks and the row wraps instead. Handles
  the four kinds of value a settings panel has: a control (`controlId` makes the
  name its label), a read-only fact, one nobody knows (an em dash in the faint
  ink, never an empty cell and never "off"), and a `quiet` row nothing can write
  yet — dimmed by ink rather than `opacity`, which would multiply against
  whatever is behind the row and unmeasure the contrast.

- **`BudgetBar`** — a run's wall clock as **budget consumed**. Not work done:
  nothing here knows how much of the task is left, and a bar implying it would
  be the most confident lie on the screen. Three states a glance separates —
  within budget (a solid fill), past the deadline (a hatched band, deliberately
  not the shape of a full solid bar, which is the calm "finished" picture; given
  a `grace` the track spans budget + grace, so the bar is only full when the
  reaper is actually due and a marker sits where the budget ran out), and **no
  estimate at all**, which draws no bar rather than a zero one. `MetricBar`'s
  rule survives intact: `elapsed={null}` is no reading and draws nothing,
  `elapsed={0}` is a measurement and draws a real meter at zero. `budgetState`
  is exported so a run list sorts by the same verdict the row draws by.
