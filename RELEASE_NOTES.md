**Fixed**
- App failed to launch after updating if a previous run had partially applied database migrations

**Improved**
- Database migrations are now atomic — if the app crashes mid-startup, the database is left in a clean state that recovers automatically on the next launch
