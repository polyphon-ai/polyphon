**What's New**
- Log files are now automatically rotated at 25 MB, keeping up to 5 files on disk
- The About page now shows app version, database schema version, platform, and architecture at a glance
- A banner now appears at the top of the app when debug logging is active, with a one-click turn-off button

**Fixed**
- Log files were being written to the wrong location; they now correctly land in the app data directory
- Log entries in the Logs viewer are now much easier to read against the dark background

**Improved**
- The About page no longer duplicates the Documentation link already present in the sidebar
- Verbose debug instrumentation added throughout the main process for easier troubleshooting
