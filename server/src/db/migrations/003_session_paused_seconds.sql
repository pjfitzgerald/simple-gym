-- Tracks accumulated paused time (between an end and a subsequent resume) on
-- a session. The displayed/recorded duration is wall-clock elapsed minus this
-- value, so resuming a long-ended session doesn't inflate its duration with
-- the idle gap.
ALTER TABLE sessions ADD COLUMN paused_seconds INTEGER NOT NULL DEFAULT 0;
