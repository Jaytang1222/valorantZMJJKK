# 选手数据导入

`players.template.csv` 是导入模板，`players.seed.csv` 是仅用于开发验证的待审核草稿。所有草稿均为 `pending_review`，不会进入查选手公开结果或题目池。

字段约定：

- `aliases` 使用 `|` 分隔。
- `country_group` 用于国籍“相近”的版本化地理分区，例如 `north_america`、`eastern_europe`、`south_america`、`greater_china`。
- `data_as_of` 是资料快照日期；赛事冠军次数与选手状态都以该日期为截止点。`is_active_roster=true` 表示现役，`false` 表示退役。
- `source_url` 必须是可公开核验的资料来源；导入前需要人工核验。

当前 `players.seed.csv` 为 248 名已批准选手的内容快照。每行保留公开选手档案 URL 与核验日期；冠军赛夺冠次数、大师赛夺冠次数、冠军赛入围次数和现役状态均以快照日期为准，发布前仍应按来源复核。

字段约定（续）：

- `champions_titles`：冠军赛夺冠次数（2021–2025 届冠军赛冠军）。
- `masters_titles`：大师赛夺冠次数（大师赛冠军）。
- `champions_appearances`：冠军赛入围次数（随队伍获得冠军赛参赛资格并进入参赛名单的次数，不含 2026 届）。

难度分层字段：

- `is_active_roster`：当前是否在队伍选手名单中；教练不进入本阶段数据集。
- `is_featured_team`：是否属于各赛区当期选定的前三流量队。
- `is_vct_cn_team`：是否属于当前 VCT CN 选手队伍；与 `is_featured_team` 共同决定入门题库。

本次名单选择、快照范围和无法可靠导入的例外见 `roster-eligibility.2026-08-03.md`。

国籍“相近”规则见 `country-groups.v1.md`。新增国家时必须先分配版本化分区，再录入选手快照。

验证 CSV：`pnpm --filter @valo-yiba/api players:validate ../../data/players.seed.csv`
