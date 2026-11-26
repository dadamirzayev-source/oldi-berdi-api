-- Force PIN change after provisional defaults; existing rows stay usable (false).
ALTER TABLE role_pins
  ADD COLUMN IF NOT EXISTS must_change BOOLEAN NOT NULL DEFAULT false;
