# VCT four-region roster audit baseline

Snapshot date: 2026-08-20/21. Primary source: VLR.gg team Current Roster pages. The list below is the baseline used by `pnpm --filter @valo-yiba/api players:sync-vct`.

The baseline contains 55 teams. `SLT Seongnam` (`team/12446`) and `ULF Esports` (`team/18019`) are included even when their current roster page has limited roster metadata. Historical match participation is collected with `pnpm --filter @valo-yiba/api players:sync-vct-history`; the generated review report is `data/vct-history-added.2026-08-22.csv`.

## Americas

- Cloud9
- M80
- NRG
- LEVIATÁN
- MIBR
- Evil Geniuses
- ENVY
- FURIA
- G2 Esports
- Sentinels
- KRÜ Esports
- Fluxo W7M
- BESTIA
- 2GAME Esports

## EMEA

- BBL Esports
- Team Vitality
- Karmine Corp
- Team Liquid
- FUT Esports
- Enterprise Esports
- Eintracht Frankfurt
- Fire Flux Esports
- FNATIC
- GIANTX
- Natus Vincere
- Team Heretics
- Gentle Mates
- ULF Esports

FNATIC is included explicitly because its current roster page lists `crashies` even though it is not present in the Stage 2 event-team extraction.

## Pacific

- Team Secret
- Rex Regum Qeon
- QTDIG
- XIPTO Esports
- ZETA DIVISION
- Nongshim RedForce
- FULL SENSE
- T1
- DetonatioN FocusMe
- Kiwoom DRX
- Gen.G
- Paper Rex
- Onside Gaming
- Sharper Esports
- SLT Seongnam

## China

- EDward Gaming
- Bilibili Gaming
- TYLOO
- Xi Lai Gaming
- Nova Esports
- FunPlus Phoenix
- JD Gaming
- All Gamers
- Trace Esports
- Titan Esports Club
- Wolves Esports
- Dragon Ranger Gaming

The CSV keeps previous VCT records that are absent from this baseline as `transferred` or `retired`; current pages may also expose `inactive` players. No historical row is deleted during synchronization.

For beginner difficulty, China uses all current VCT CN rosters. In the other
regions, the configured traffic-team set is:

- Americas: ENVY, G2 Esports, KRÜ Esports, LEVIATÁN, MIBR, NRG, Sentinels
- EMEA: BBL Esports, FNATIC, Gentle Mates, GIANTX, Natus Vincere, Team Heretics, Team Liquid, Team Vitality
- Pacific: Gen.G, Kiwoom DRX, Paper Rex, Rex Regum Qeon, T1

The synchronizer applies the marker to every current roster member of a
traffic team so a team cannot be partially included because of an old
row-level flag.

## Historical player supplement

On 2026-08-22, historical player rosters were supplemented from the public
THESPIKE team `Past Players` pages. The supplement covers all 47 teams above
and adds 595 previously absent player records. The audit list, including the
source player ID and team, is `data/vct-history-thespike-added.2026-08-22.csv`.

Only player rows are imported; staff and coaches are excluded and every
supplemented row has `is_coach=false`, `is_active_roster=false`, and
`roster_status=transferred`. Source labels that are not ISO-3166 two-letter
country codes are stored as `UN` in the seed CSV rather than guessed.

Repeatable commands:

```text
pnpm --filter @valo-yiba/api players:sync-vct-history:thespike
pnpm --filter @valo-yiba/api players:validate
```
