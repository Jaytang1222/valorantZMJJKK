# 国籍相近分区 V2

国籍比较先判断 ISO 3166-1 alpha-2 代码是否相同；相同为“精确”。代码不同时，若二者在本表的 `country_group` 相同，显示“相近”；否则显示“不符”。

V2 依据国际通用地理分区标准（联合国 M49 大区为主，个别国家按电竞通识调整），覆盖当前选手数据的全部 38 个国家和地区。

| code | 显示名 | 覆盖国家/地区 | 说明 |
| ---- | ------ | ------------- | ---- |
| `east_asia` | East Asia | CN, HK, JP, KR, TW | 东亚；原 V1 的 `greater_china`（CN/HK/TW）并入本组 |
| `southeast_asia` | Southeast Asia | ID, MY, PH, SG, TH, VN | 东南亚 |
| `south_asia` | South Asia | IN | 南亚（新增） |
| `middle_east` | Middle East | TR | 中东/西亚；土耳其统一归本组 |
| `north_america` | North America | CA, MX, US | 北美洲 |
| `south_america` | South America | AR, BR, CL, CO | 南美洲 |
| `western_europe` | Western Europe | BE, CH, DE, FR, GB | 西欧（GB 按电竞通识归西欧） |
| `northern_europe` | Northern Europe | FI | 北欧（新增） |
| `southern_europe` | Southern Europe | HR, IT, PT, RS | 南欧（新增；HR、RS、IT、PT 由 V1 的原组调整而来） |
| `eastern_europe` | Eastern Europe | CZ, LT, MD, PL, RO, RU | 东欧 |
| `oceania` | Oceania | AU | 大洋洲 |
| `north_africa` | North Africa | MA | 北非 |

## 与 V1 的差异
- 移除 `greater_china`：CN/HK/TW 并入 `east_asia`。
- 新增 `south_asia`、`northern_europe`、`southern_europe` 三组。
- 土耳其（TR）统一归入 `middle_east`（V1 中 Wo0t、RieNs 被误归 `eastern_europe`，已修正）。
- 意大利、葡萄牙、克罗地亚、塞尔维亚由原 `western_europe`/`eastern_europe` 调整为 `southern_europe`；芬兰（FI）单列 `northern_europe`。

分区代码和名称保存在 `country_groups` 表，版本号为 `2`。新增或调整规则时新增版本，已发布题目继续引用快照中的 `country_group_code`，不可回写历史结算。