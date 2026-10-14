-- Greeting cards. Works on PostgreSQL 14+ and PGlite.
-- The Creature Lab, chat editing and reference uploads are gone.
DROP TABLE IF EXISTS wish_claims;
DROP TABLE IF EXISTS wishes;
DROP TABLE IF EXISTS design_messages;
DROP TABLE IF EXISTS uploads;
ALTER TABLE orders DROP COLUMN IF EXISTS wish_code;

-- What gets printed and where it goes (orders/types.ts CardOrderDetails): the card id,
-- cover, inside message, sign-off, recipient and delivery choices. This is personal
-- data. It is never logged, and it is purged a set time after delivery
-- (personal_data_purged_at records when).
ALTER TABLE orders ADD COLUMN card jsonb;
-- Hold the card at the studio and ship it on this date (null = as soon as it is packed).
ALTER TABLE orders ADD COLUMN ship_on date;
ALTER TABLE orders ADD COLUMN personal_data_purged_at timestamptz;
