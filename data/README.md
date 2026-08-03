# 选手数据导入

`players.template.csv` 是导入模板，`players.seed.csv` 是仅用于开发验证的待审核草稿。所有草稿均为 `pending_review`，不会进入查选手公开结果或题目池。

字段约定：

- `aliases` 与 `hero_top_3` 使用 `|` 分隔；英雄必须恰好三个。
- `country_group` 用于国籍“相近”的版本化地理分区，例如 `north_america`、`eastern_europe`、`south_america`、`greater_china`。
- `data_as_of` 是资料快照日期；赛事冠军次数与英雄 Top 3 都以该日期为截止点。
- `source_url` 必须是可公开核验的资料来源；导入前需要人工核验。

当前 `players.seed.csv` 为 248 名已批准选手的内容快照。每行保留公开选手档案 URL 与核验日期；`hero_top_3` 依据“截至快照日，官方/高水平赛事出场次数最多的三个英雄”的产品定义。该字段在题目发布前应以赛事统计源二次复核，不能将 CSV 视为永久赛事档案。

难度分层字段：

- `is_active_roster`：当前是否在队伍选手名单中；教练不进入本阶段数据集。
- `is_featured_team`：是否属于各赛区当期选定的前三流量队。
- `is_vct_cn_team`：是否属于当前 VCT CN 选手队伍；与 `is_featured_team` 共同决定入门题库。

本次名单选择、快照范围和无法可靠导入的例外见 `roster-eligibility.2026-08-03.md`。

国籍“相近”规则见 `country-groups.v1.md`。新增国家时必须先分配版本化分区，再录入选手快照。

验证 CSV：`pnpm --filter @valo-yiba/api players:validate ../../data/players.seed.csv`
