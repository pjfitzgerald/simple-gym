-- Manual personal-record override per exercise. PRs are normally derived from
-- logged sets (heaviest weight), but the user can seed/correct a PR by hand —
-- e.g. for a lift done outside the app, or to fix a wrongly-logged set. The
-- displayed PR is the heavier of {manual override, best logged set}, so a
-- heavier logged set still wins. NULL = no manual override (pure derived).
ALTER TABLE exercises ADD COLUMN manual_pr_weight REAL;
ALTER TABLE exercises ADD COLUMN manual_pr_reps INTEGER;
