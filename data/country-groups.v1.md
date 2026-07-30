# 国籍相近分区 V1

国籍比较先判断 ISO 3166-1 alpha-2 代码是否相同；相同为“精确”。代码不同时，若二者在本表的 `country_group` 相同，显示“相近”；否则显示“不符”。

| 代码             | 显示名         | 本批覆盖国家/地区 |
| ---------------- | -------------- | ----------------- |
| `north_america`  | North America  | CA, US            |
| `south_america`  | South America  | AR, BR, CL        |
| `western_europe` | Western Europe | FI, GB            |
| `eastern_europe` | Eastern Europe | RU                |
| `middle_east`    | Middle East    | TR                |
| `north_africa`   | North Africa   | MA                |
| `east_asia`      | East Asia      | KR                |
| `greater_china`  | Greater China  | CN                |
| `southeast_asia` | Southeast Asia | ID, SG            |
| `oceania`        | Oceania        | 预留              |

分区代码和名称保存在 `country_groups` 表，版本号为 `1`。新增或调整规则时新增版本，已发布题目继续引用快照中的 `country_group_code`，不可回写历史结算。
