# Third-party notices

Inventory of packages and external content used by BuildIQ. Versions match `package-lock.json` unless noted. Verification status is what was checked in BIQ-0276, not a substitute for legal review.

Commercial-use status means the recorded license allows commercial use when its conditions are met. Restrictive or unverified items are flagged and are not treated as cleared.

## Direct packages

| Name | Source and version | License and commercial use | Attribution | Use in BuildIQ | Verification |
| --- | --- | --- | --- | --- | --- |
| next | npm `next` 14.2.35 | MIT. Commercial use allowed. | Copyright notices in the package. | App framework | Lockfile `license` field |
| react | npm `react` 18.3.1 | MIT. Commercial use allowed. | Copyright notices in the package. | UI | Lockfile `license` field |
| react-dom | npm `react-dom` 18.3.1 | MIT. Commercial use allowed. | Copyright notices in the package. | UI | Lockfile `license` field |
| @supabase/supabase-js | npm 2.110.1 | MIT. Commercial use allowed. | Copyright notices in the package. | Database client | Lockfile `license` field |
| openai | npm `openai` 4.104.0 | Apache-2.0. Commercial use allowed. | Retain Apache notices if the SDK source is redistributed. The API itself is a separate service agreement. | Nutrition label vision | Lockfile `license` field |
| @zxing/browser | npm 0.1.5 | MIT. Commercial use allowed. | Copyright notices in the package. | Barcode scanning | Lockfile `license` field |
| @playwright/test | npm 1.64.1 | Apache-2.0. Commercial use allowed. Dev dependency. | Retain Apache notices if redistributed. | Tests | Lockfile `license` field |
| typescript | npm 5.9.3 | Apache-2.0. Commercial use allowed. Dev dependency. | Retain Apache notices if redistributed. | Compiler | Lockfile `license` field |
| tsx | npm 4.23.0 | MIT. Commercial use allowed. Dev dependency. | Copyright notices in the package. | Script runner | Lockfile `license` field |
| @types/node | npm 22.20.1 | MIT. Commercial use allowed. Dev dependency. | Copyright notices in the package. | Types | Lockfile `license` field |
| @types/react | npm 18.3.31 | MIT. Commercial use allowed. Dev dependency. | Copyright notices in the package. | Types | Lockfile `license` field |
| @types/react-dom | npm 18.3.7 | MIT. Commercial use allowed. Dev dependency. | Copyright notices in the package. | Types | Lockfile `license` field |

## Transitive packages that need a note

Other lockfile entries are MIT except the rows below. No GPL, AGPL, or SSPL identifier appears in the lockfile. This inventory did not unpack every tarball.

| Name | Source and version | License and commercial use | Attribution | Use in BuildIQ | Verification |
| --- | --- | --- | --- | --- | --- |
| caniuse-lite | npm 1.0.30001803, via Next | CC-BY-4.0. Commercial use allowed with attribution. | Attribute caniuse data if the dataset is publicly redistributed. Build-time browser data, not shown to users. | Next build tooling | Lockfile `license` field |
| busboy | npm 1.6.0, via Next | MIT. Commercial use allowed. Lockfile has no `license` field. | Copyright Brian White. Include the notice when distributing substantial portions. | Multipart parsing inside Next | Installed `node_modules/busboy/LICENSE` and `package.json` `licenses` entry |
| streamsearch | npm 1.1.0, via busboy | MIT. Commercial use allowed. Lockfile has no `license` field. | Copyright Brian White. Include the notice when distributing substantial portions. | Used by busboy | Installed `node_modules/streamsearch/LICENSE` and `package.json` `licenses` entry |
| @swc/counter | npm 0.1.3 | Apache-2.0. Commercial use allowed. | Retain Apache notices if redistributed. | Next compile helper | Lockfile `license` field |
| @swc/helpers | npm 0.5.5 | Apache-2.0. Commercial use allowed. | Retain Apache notices if redistributed. | Next compile helper | Lockfile `license` field |
| playwright | npm 1.64.1 | Apache-2.0. Commercial use allowed. Dev dependency. | Retain Apache notices if redistributed. | Test runner | Lockfile `license` field |
| playwright-core | npm 1.64.1 | Apache-2.0. Commercial use allowed. Dev dependency. | Retain Apache notices if redistributed. | Test runner | Lockfile `license` field |
| graceful-fs | npm 4.2.11 | ISC. Commercial use allowed. | Copyright notices in the package. | Next file helper | Lockfile `license` field |
| picocolors | npm 1.1.1 | ISC. Commercial use allowed. | Copyright notices in the package. | PostCSS terminal color | Lockfile `license` field |
| source-map-js | npm 1.2.1 | BSD-3-Clause. Commercial use allowed. | Retain the copyright notice in source redistributions. | PostCSS source maps | Lockfile `license` field |
| webidl-conversions | npm 3.0.1 | BSD-2-Clause. Commercial use allowed. | Retain the copyright notice in source redistributions. | URL parsing helper | Lockfile `license` field |
| tslib | npm 2.8.1 | 0BSD. Commercial use allowed. | No attribution required by 0BSD. | TypeScript runtime helper | Lockfile `license` field |
| @zxing/text-encoding | npm 0.9.0, optional | Unlicense OR Apache-2.0. Commercial use allowed. | Apache attribution applies if that license is selected. | Optional barcode text encoding | Lockfile `license` field |

## Exercise and nutrition content

| Name | Source and version | License and commercial use | Attribution | Use in BuildIQ | Verification |
| --- | --- | --- | --- | --- | --- |
| BuildIQ Master Library | `lib/training/data/builtiq-master-catalog.json`, produced from `docs/catalog-overhaul/BuiltIQ_Exercise_Master_Library_with_Form_Links.xlsx` | First-party. Spreadsheet core properties list Jesse Trowbridge as last modifier on 2026-09-17. | None. This is BuildIQ content. | `external_source = builtiq_master`. Default exercise catalog. | In-repo spreadsheet and JSON. Entries are short coaching cues. YouTube form-search cells are links, not copied video files. No third-party dataset id is stored on these rows. |
| ExerciseDB v1 | AscendAPI free tier, `https://oss.exercisedb.dev/docs`. Bulk import previously used `AbdelrahmanElghoul/exercises-dataset`. About 1,324 exercises. | Free-tier terms: non-commercial only. Commercial products require a paid plan. Not cleared for BuildIQ. The API server repo is AGPL-3.0 and is not vendored here. | Credit AscendAPI if the dataset is used. | Import disabled. GIFs and instruction text hidden. Stored `st_exercise_catalog` rows are not deleted. | Published free-tier terms and in-repo comments. Commercial grant not verified. |
| free-exercise-db | `yuhonas/free-exercise-db` | JSON text: The Unlicense. Commercial use of the JSON is allowed. Photos: maintainer said provenance is unknown. Not cleared. | None required for the Unlicense JSON. Do not label the photos as Unlicense. | Legacy text may appear as `free_exercise_db`. Photo URLs are not displayed or newly imported. | Repository LICENSE.md for the JSON. Image rights remain unverified (project issues 2 and 13). |
| Open Food Facts | `https://world.openfoodfacts.org/api/v2` | Database: Open Database License. Contents: Database Contents License. Photos: CC BY-SA. Commercial use allowed with attribution. A shared or public derivative database must stay under ODbL. Packaging in photos can carry separate trademarks. | Visible link to https://openfoodfacts.org, ODbL, and CC BY-SA on barcode results. | Barcode product name, nutrients, and product photo. No shared cache. | Open Food Facts terms of use. User-Agent `BuildIQ-Health/1.0`. |

## Removed from the repo

`docs/catalog-overhaul/exercise-catalog.csv` was a committed copy of ExerciseDB instructions and media paths. BIQ-0276 removed that file. Git history still contains it. Do not regenerate it until a commercial license is recorded.
