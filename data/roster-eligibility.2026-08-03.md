# 2026-08-03 选手快照与题库资格台账

## 快照与来源

- 快照日期：2026-08-03。
- 选手档案与英雄出场统计：VLR.gg 的公开选手页，查询参数为 `timespan=all`。
- 请求方式：带联系信息的 User-Agent、串行低频读取；每位选手在 CSV 中保留其可核验来源 URL 与核验时间。
- Hero Top 3：按该页面的赛事地图出场数降序取前三个英雄。没有三个可核验统计的档案不导入公开题库。
- 冠军赛和大师赛冠军次数：仅在已有可靠赛事记录时写入；无法确认的新增选手保持 `0`，不以推测补值。

## 入门题库的队伍快照

`is_featured_team=true` 的各赛区三支流量队：

| 赛区     | 队伍                                      |
| -------- | ----------------------------------------- |
| Americas | 100 Thieves、NRG、LEVIATÁN                |
| EMEA     | Team Vitality、BBL Esports、Team Heretics |
| Pacific  | Paper Rex、Gen.G、Rex Regum Qeon          |
| China    | EDward Gaming                             |

VCT CN 全部已取得公开选手名单的队伍使用 `is_vct_cn_team=true`：EDward Gaming、All Gamers、FunPlus Phoenix、Wolves Esports、JD Mall JDG Esports、Dragon Ranger Gaming、Trace Esports、Wuxi Titan Esports Club、KeepBest Gaming。

## 规则落地

- 单人入门：`is_active_roster=true`、非教练，且 `is_featured_team=true` 或 `is_vct_cn_team=true`。
- 单人简单：`is_active_roster=true`、非教练。
- 单人完整：所有具备已批准最新快照的选手。
- 联机：服务端以 30% 入门、50% 简单、20% 完整的权重抽题；若某候选集合为空，按确定性回退保证可开局。

除入门名单外，已补充 VCT 2026 Stage 2 的 Americas、EMEA 与 Pacific 公开赛事名单中可取得全历史三英雄统计的现役选手，因此简单题库与入门题库已实际分层。

## 已知例外

- A Team：公开 VLR 队伍页在快照时没有登记选手名单，最近比赛页也没有选手统计。为避免根据非可核验信息推断阵容，未导入该队选手；待公开资料可验证后再补入。
- Wolves Esports 的 `nothing`、Trace Esports 的 `Toosy`：快照时没有可用的三项全历史英雄出场统计，未导入公开题库。

本台账记录的是 2026-08-03 的一次内容快照，不宣称为长期或实时名单。后续更新应先重新核验名单、Hero Top 3、来源 URL 和数据日期，再通过 CSV 校验与后台审核流程发布。
