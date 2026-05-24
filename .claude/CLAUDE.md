# ocf-water-crew

Scheduler for water crew work assignments at Oregon Country Faire. Deployed as a
Google Apps Script bound to a Google Sheet; the same JS also runs under Node for
local testing.

Used in production for 2025; now working on the 2026 version. No backward
compatibility required — prefer the correct approach over the compatible one.

## Privacy

Do not put real volunteer names or other personal information into any tracked
file (docs, code comments, test fixtures, commit messages). The live
`thejson*.json` files may contain real names and are gitignored for this reason
— keep it that way. When an example needs a name, use a placeholder like
`"Jane Doe"`.
