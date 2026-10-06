-- Fifth Gear: display rename only. Keep game_id = 'fifth-run' so scores / challenges / seeds stay valid.
-- Court Vision untouched.
UPDATE arcade_games
SET title = 'Fifth Gear'
WHERE id = 'fifth-run'
  AND title IS DISTINCT FROM 'Fifth Gear';
