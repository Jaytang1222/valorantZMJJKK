# 选手数据导入

`players.template.csv` 是导入模板，`players.seed.csv` 是仅用于开发验证的待审核草稿。所有草稿均为 `pending_review`，不会进入查选手公开结果或题目池。

字段约定：

- `aliases` 与 `hero_top_3` 使用 `|` 分隔；英雄必须恰好三个。
- `country_group` 用于国籍“相近”的版本化地理分区，例如 `north_america`、`eastern_europe`、`south_america`、`greater_china`。
- `data_as_of` 是资料快照日期；赛事冠军次数与英雄 Top 3 都以该日期为截止点。
- `source_url` 必须是可公开核验的资料来源；导入前需要人工核验。

验证 CSV：`pnpm --filter @valo-yiba/api players:validate ../../data/players.seed.csv`
