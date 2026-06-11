# Street timeline audit report

Generated: 2026-06-09 · Read-only audit of [data/master/street-events.json](../data/master/street-events.json)

## How to read this report

Each **event** is one dated fact in the master file (e.g. "Lung Yuet Road named 2016-03-18"). Events with the same `street_code` form a **timeline** for one road.

**Important:** A data issue can exist in the master file even when the map looks fine. The build pipeline can match events to roads by **English name** when `street_code` is missing — so roads like Lung Yuet Road and Fung Yu Road appear correctly on the map today, but their events are still not explicitly linked by code.


| Term                | Meaning                                                                         |
| ------------------- | ------------------------------------------------------------------------------- |
| `street_code`       | LandsD centreline ID (e.g. `14412`) — the reliable join key                     |
| Name-only aggregate | Timeline grouped by English|Chinese name because the event has no `street_code` |
| Verified road       | Road on the map with a naming year and 舊稱 timeline                              |
| Shadow duplicate    | Same street exists twice: once by code, once by name only                       |


---

## Executive summary

**958** events → **914** timelines → **856** verified roads on the map. Gazette lint: **0 errors**.

### Do users see broken roads on the map?

**Mostly no.** The biggest issue (missing `street_code`) sounds alarming but often **does not** hide roads from the map. Name-based fallback matching works when the English name is unique.


| Source         | Events missing code | On map today  | Not on map    |
| -------------- | ------------------- | ------------- | ------------- |
| landsd         | 117                 | 111 (95%)     | 6             |
| egazette_pdf   | 164                 | 83 (51%)      | 81            |
| crowdsubmitted | 25                  | 0             | 25            |
| **Total**      | **306**             | **194 (63%)** | **112 (37%)** |


### What actually needs fixing?


| Priority   | Issue                                                                                                       | User-visible today?                                  | Fix needed?                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| **High**   | 6 shadow duplicates with year conflicts (Cheung Sha Wan, Shing Kai, Chui Kwan, Nga Cheung, Lai Po, Fleming) | Possible wrong naming year on map                    | **Yes** — merge or delete orphan events                      |
| **High**   | 81 egazette + 25 crowd events not on map                                                                    | Roads show "資料待補" or no timeline                     | **Yes** — backfill `street_code` or match to geojson         |
| **Medium** | 306 events missing `street_code` (but 194 already on map)                                                   | Map OK for most landsd roads; fragile for homonyms   | **Yes** — backfill codes for data hygiene                    |
| **Medium** | 6 landsd roads not matching (HZMB Link Road, etc.)                                                          | Missing naming year                                  | **Yes** — fix name spelling or add geometry                  |
| **Low**    | 56 aggregate vs geojson name mismatches                                                                     | Map names correct; QA flags only (except remarks UI) | **Optional** — fix pickDisplayNames logic or geometry labels |
| **Low**    | Queen's Road occupation names in aggregate metadata                                                         | Map and timeline correct                             | **Optional** — cosmetic in build logic                       |
| **Low**    | 1 rename chain break on 11805                                                                               | Timeline may confuse historians                      | **Optional** — add missing intermediate event                |


### Summary counts


| Metric                                 | Value |
| -------------------------------------- | ----- |
| Total events                           | 958   |
| Total timelines (aggregates)           | 914   |
| Timelines with street_code             | 616   |
| Name-only timelines                    | 298   |
| Events missing street_code             | 306   |
| Shadow duplicate pairs                 | 10    |
| Name mismatches (aggregate vs geojson) | 56    |


---

## 1. Missing `street_code` (306 events)

### What this means

These event rows have no `street_code` field. In the master file they are grouped by **name** (`Lung Yuet Road|龍悅道`) instead of **code** (`code:14412`).

### Why Lung Yuet Road still works on the map

1. The **centreline** has `STREETCODE: 14412` and name "LUNG YUET ROAD".
2. The **event** has no code but name "Lung Yuet Road".
3. At build time, `[enrichGeojson](../scripts/lib/street-naming-core.mjs)` tries code first, then **falls back to English name** when the name is unique.
4. Result: `naming_year: 2016` appears on the map and the 舊稱 panel works.

You will see `naming_details.street_code: null` in verified-roads even though the road row has `street_code: 14412` — that is the symptom.

### When this becomes a real problem

- **Homonyms** — two different roads share a similar English name; name fallback attaches the wrong timeline.
- **Shadow duplicates** — same street has both a coded timeline and a name-only copy (see §2).
- **Editing** — you cannot find events by grepping `street_code: "14412"` in the master file.
- **egazette_pdf / crowd** — only ~51% and 0% reach the map without code; most of the real gaps are here.

### Fix recommendation


| Action                                             | Effort                                   | Effect                                                                                      |
| -------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Backfill `street_code` on all 117 `landsd` events  | Low — match EN+ZH to geojson             | Explicit linkage; no behaviour change for roads already on map                              |
| Backfill 164 `egazette_pdf` events                 | Medium — many lack English name          | ~81 more roads could get timelines                                                          |
| Match or remove 25 `crowdsubmitted` tier-c orphans | Medium — may be renamed/absorbed streets | Unclear if these roads still exist under different names                                    |
| Fix 6 landsd name mismatches                       | Low per road                             | HZMB Link Road, On Pik Road, Kam Yee Road, Toscana Drive, Choi Lung Street, Ping Yip Street |


### Roads with landsd events that are NOT on the map (6)


| English                                           | Chinese    | Gazette date |
| ------------------------------------------------- | ---------- | ------------ |
| Hong Kong-Zhuhai-Macao Bridge Hong Kong Link Road | 港珠澳大橋香港連接路 | 2017-03-10   |
| On Pik Road                                       | 安碧道        | 2021-10-22   |
| Kam Yee Road                                      | 錦義路        | 2023-12-08   |
| Toscana Drive                                     | 意濤徑        | 2024-04-26   |
| Choi Lung Street                                  | 彩隆街        | 2025-10-10   |
| Ping Yip Street                                   | 屏業街        | 2026-04-24   |


Full table: all 306 events missing street_code (click to expand)


| event_id                                                   | source         | date       | EN                                                | ZH         | change_kind | notice_no |
| ---------------------------------------------------------- | -------------- | ---------- | ------------------------------------------------- | ---------- | ----------- | --------- |
| 1927-11-25|GN4780|0                                        | egazette_pdf   | 1927-11-25 | Cheung Sha Wan Road                               |            | declare     | GN4780    |
| crowd|2017-gn3555-tier-c-1-1957-10-11                      | crowdsubmitted | 1957-10-11 | Ching Road                                        | 青道         | declare     | GN1367    |
| crowd|2017-gn3555-tier-c-FookLaiRoad--1957-10-11           | crowdsubmitted | 1957-10-11 | Fook Lai Road                                     | 復禮道        | declare     | GN1367    |
| crowd|2017-gn3555-tier-c-LungShanRoad--1957-10-11          | crowdsubmitted | 1957-10-11 | Lung Shan Road                                    | 龍山道        | declare     | GN1367    |
| crowd|2019-gn3586-tier-c-1-1958-07-11                      | crowdsubmitted | 1958-07-11 | Church Lane                                       | 教堂里        | declare     | GN939     |
| crowd|2019-gn6067-tier-c-1-1959-12-11                      | crowdsubmitted | 1959-12-11 | Wan King Street                                   | 環景街        | declare     | GN1743    |
| crowd|2019-gn6067-tier-c-WanLeiStreet--1959-12-11          | crowdsubmitted | 1959-12-11 | Wan Lei Street                                    | 環利街        | declare     | GN1743    |
| crowd|2019-gn6067-tier-c-WanShunStreet--1959-12-11         | crowdsubmitted | 1959-12-11 | Wan Shun Street                                   | 環順街        | declare     | GN1743    |
| crowd|2019-gn3586-tier-c-1-1960-01-22                      | crowdsubmitted | 1960-01-22 | Nation Street                                     | 禮信街        | declare     | GN110     |
| 2010-12-24|GN8237|0                                        | egazette_pdf   | 1960-11-04 | Hoi Tai Street                                    | 海堤街        | declare     | GN8237    |
| crowd|2017-gn3555-tier-c-1-1963-11-08                      | crowdsubmitted | 1963-11-08 | Ming Tak Street                                   | 明德街        | declare     | GN2197    |
| crowd|2017-gn3555-tier-c-SheungTakStreet--1963-11-08       | crowdsubmitted | 1963-11-08 | Sheung Tak Street                                 | 尚德街        | declare     | GN2197    |
| crowd|2017-gn3555-tier-c-1-1966-06-16                      | crowdsubmitted | 1966-06-16 | Jordan Valley South Road                          | 佐頓谷南道      | declare     | GN1628    |
| crowd|2017-gn3555-tier-c-1-1967-01-05                      | crowdsubmitted | 1967-01-05 | Fu Mei Street West                                | 富美西街       | declare     | GN89      |
| crowd|2016-gn427-tier-c-1-1967-03-04                       | crowdsubmitted | 1967-03-04 | Sau Lai Street                                    | 秀麗街        | declare     | GN537     |
| crowd|2016-gn427-tier-c-SauMauPath--1967-03-04             | crowdsubmitted | 1967-03-04 | Sau Mau Path                                      | 秀茂徑        | declare     | GN537     |
| crowd|2016-gn427-tier-c-SauPoStreet--1967-03-04            | crowdsubmitted | 1967-03-04 | Sau Po Street                                     | 秀圃街        | declare     | GN537     |
| crowd|2016-gn427-tier-c-TakWoStreet--1967-03-04            | crowdsubmitted | 1967-03-04 | Tak Wo Street                                     | 德和街        | declare     | GN537     |
| crowd|2017-gn3555-tier-c-1-1967-06-06                      | crowdsubmitted | 1967-06-06 | Ko Long Road                                      | 高朗道        | declare     | GN1244    |
| crowd|2017-gn3555-tier-c-1-1970-01-23                      | crowdsubmitted | 1970-01-23 | Shing Shun Road                                   | 誠信路        | declare     | GN225     |
| 2009-03-06|GN1502|0                                        | egazette_pdf   | 1970-04-03 | Ting Kok Road                                     | 汀角路        | declare     | GN1502    |
| 2009-03-06|GN1502|2                                        | egazette_pdf   | 1970-04-03 | Tung Tsz Road                                     | 洞梓路        | declare     | GN1502    |
| 2009-03-06|GN1502|3                                        | egazette_pdf   | 1970-04-03 | Shan Liu Road                                     | 山寮路        | declare     | GN1502    |
| crowd|2016-gn427-tier-c-1-1970-07-03                       | crowdsubmitted | 1970-07-03 | Ngau Tau Kok Fifth Street                         | 牛頭角第五街     | declare     | GN1370    |
| crowd|2016-gn427-tier-c-NgauTauKokFourthStreet--1970-07-03 | crowdsubmitted | 1970-07-03 | Ngau Tau Kok Fourth Street                        | 牛頭角第四街     | declare     | GN1370    |
| crowd|2016-gn427-tier-c-NgauTauKokSecondStreet--1970-07-03 | crowdsubmitted | 1970-07-03 | Ngau Tau Kok Second Street                        | 牛頭角第二街     | declare     | GN1370    |
| crowd|2016-gn427-tier-c-NgauTauKokThirdStreet--1970-07-03  | crowdsubmitted | 1970-07-03 | Ngau Tau Kok Third Street                         | 牛頭角第三街     | declare     | GN1370    |
| 2015-01-23|GN1172|0                                        | egazette_pdf   | 1981-12-11 | Concorde Road                                     | 協調道        | declare     | GN1172    |
| crowd|2017-gn2428-tier-c-1-1981-12-11                      | crowdsubmitted | 1981-12-11 | Cargo Circuit                                     | 貨運道        | declare     | GN3682    |
| 2009-12-18|GN7994|0                                        | egazette_pdf   | 1984-11-30 | Lai Ping Road                                     | 麗坪路        | declare     | GN7994    |
| 2009-12-18|GN7994|1                                        | egazette_pdf   | 1984-11-30 | Yung Ping Path                                    | 雍坪徑        | declare     | GN7994    |
| 2015-08-28|GN6517|0                                        | egazette_pdf   | 1985-12-27 | Fuk Man Road                                      | 福民路        | declare     | GN6517    |
| 1992-05-29|GN6117|1                                        | egazette_pdf   | 1990-11-30 | Tong Hang Road                                    |            | declare     | GN6117    |
| 1992-05-29|GN6117|2                                        | egazette_pdf   | 1990-11-30 | Tsz Tin Road                                      |            | declare     | GN6117    |
| 2015-11-13|GN8863|0                                        | egazette_pdf   | 1992-01-31 |                                                   | 馬鞍山路       | declare     | GN8863    |
| 2015-11-13|GN8863|1                                        | egazette_pdf   | 1992-01-31 |                                                   | 大老山公路      | declare     | GN8863    |
| 2014-02-14|GN933|0                                         | egazette_pdf   | 1992-04-10 | Sai Kung Rural Committee Lane                     | 西貢鄉事會里     | declare     | GN933     |
| 1992-05-29|GN6117|0                                        | egazette_pdf   | 1992-05-29 | Hing Kwai Street                                  |            | declare     | GN6117    |
| 2010-01-15|GN296|0                                         | egazette_pdf   | 1997-10-17 | Lung Wui Road                                     | 龍匯道        | declare     | GN296     |
| crowd|2018-gn2323-tier-c-1-1998-01-09                      | crowdsubmitted | 1998-01-09 | San Chuk Street                                   | 新竹街        | declare     | GN172     |
| 2013-08-02|GN4532|0                                        | egazette_pdf   | 2000-12-15 |                                                   | 牛皮沙街       | declare     | GN4532    |
| crowd|2021-gn6002-tier-c-1-2002-05-31                      | crowdsubmitted | 2002-05-31 | Cheong Lin Path                                   | 暢連徑        | declare     | GN3296    |
| 2013-11-01|GN6569|0                                        | egazette_pdf   | 2003-01-10 | On Lai Street                                     | 安麗街        | declare     | GN6569    |
| 2008-08-29|GN6060|0                                        | egazette_pdf   | 2008-08-29 | Lam Yu Road                                       | 欖裕路        | declare     | GN6060    |
| 2008-10-10|GN7003|0                                        | egazette_pdf   | 2008-10-10 | Nightingale Road                                  | 南丁格爾路      | declare     | GN7003    |
| 2008-10-10|GN7003|1                                        | egazette_pdf   | 2008-10-10 | Queen Elizabeth Hospital Road                     | 伊利沙伯醫院路    | declare     | GN7003    |
| 2008-10-10|GN7003|2                                        | egazette_pdf   | 2008-10-10 | Queen Elizabeth Hospital Path                     | 伊利沙伯醫院徑    | declare     | GN7003    |
| 2008-10-10|GN7004|0                                        | egazette_pdf   | 2008-10-10 | Fo Hing Street                                    | 科興街        | declare     | GN7004    |
| 2008-12-05|GN8315|0                                        | egazette_pdf   | 2008-12-05 | Cheung Chau Electric Path                         | 長洲電廠徑      | declare     | GN8315    |
| 2009-01-30|GN0683|0                                        | egazette_pdf   | 2009-01-30 | Tung Chung Road                                   | 東涌道        | declare     | GN0683    |
| 2009-02-06|GN0852|0                                        | egazette_pdf   | 2009-02-06 | Fat Kwong Street Flyover                          | 佛光街天橋      | declare     | GN0852    |
| 2009-02-06|GN851|0                                         | egazette_pdf   | 2009-02-06 | Bel-Air Peak Avenue                               | 貝沙山道       | declare     | GN851     |
| 2009-03-20|GN1820|0                                        | egazette_pdf   | 2009-03-20 | Yip Wong Road                                     | 業旺路        | declare     | GN1820    |
| 2009-04-09|GN2232|0                                        | egazette_pdf   | 2009-04-09 | LOHAS Park Road                                   | 康城路        | declare     | GN2232    |
| 2009-06-05|GN3561|0                                        | egazette_pdf   | 2009-06-05 | Wui Man Road                                      | 匯民道        | declare     | GN3561    |
| 2009-08-14|GN5125|0                                        | egazette_pdf   | 2009-08-14 | Tat Fuk Road                                      | 達福路        | declare     | GN5125    |
| 2009-08-14|GN5125|1                                        | egazette_pdf   | 2009-08-14 | Tung Fuk Road                                     | 同福路        | declare     | GN5125    |
| 2009-09-18|GN5906|0                                        | egazette_pdf   | 2009-09-18 | Shui Fu Road                                      | 水庫路        | declare     | GN5906    |
| 2009-12-04|GN7642|0                                        | egazette_pdf   | 2009-12-04 | Lung Wo Road                                      | 龍和道        | declare     | GN7642    |
| 2009-12-04|GN7642|1                                        | egazette_pdf   | 2009-12-04 | Edinburgh Place                                   | 愛丁堡廣場      | declare     | GN7642    |
| 2011-02-25|GN1314|0                                        | egazette_pdf   | 2009-12-04 | Lung Wo Road                                      | 龍和道        | declare     | GN1314    |
| 2009-12-18|GN7995|0                                        | egazette_pdf   | 2009-12-18 | Cheung Tsing Highway                              | 長青公路       | declare     | GN7995    |
| 2009-12-18|GN7996|0                                        | egazette_pdf   | 2009-12-18 | Hoi Long Path                                     | 海浪徑        | declare     | GN7996    |
| 2010-02-05|GN737|0                                         | egazette_pdf   | 2010-02-05 | Wong Kong Wai Road                                | 黃崗圍路       | declare     | GN737     |
| 2010-04-09|GN2046|0                                        | egazette_pdf   | 2010-04-09 | Pok Chuen Street                                  | 博泉街        | declare     | GN2046    |
| 2010-04-09|GN2046|1                                        | egazette_pdf   | 2010-04-09 | Pok Chuen Path                                    | 博泉徑        | declare     | GN2046    |
| 2010-04-09|GN2046|2                                        | egazette_pdf   | 2010-04-09 | To Shek Street                                    | 多石街        | declare     | GN2046    |
| 2010-04-09|GN2046|3                                        | egazette_pdf   | 2010-04-09 | To Shek Path                                      | 多石徑        | declare     | GN2046    |
| 2010-06-18|GN3608|0                                        | egazette_pdf   | 2010-06-18 | Ma Shing Path                                     | 馬成徑        | declare     | GN3608    |
| 2010-06-18|GN3609|0                                        | egazette_pdf   | 2010-06-18 | Sai Kwo Road                                      | 世歌路        | declare     | GN3609    |
| 2010-06-18|GN3611|0                                        | egazette_pdf   | 2010-06-18 | Sheung Kin Street                                 | 常健街        | declare     | GN3611    |
| 2010-06-25|GN4011|0                                        | egazette_pdf   | 2010-06-25 | Liu Pok Road                                      | 料壆路        | declare     | GN4011    |
| 2010-06-25|GN4012|0                                        | egazette_pdf   | 2010-06-25 | Wang Ping Shan South Road                         | 橫平山南路      | declare     | GN4012    |
| 2010-07-16|GN4562|2                                        | egazette_pdf   | 2010-07-16 | Choi Wing Lane                                    | 彩榮里        | declare     | GN4562    |
| 2010-08-06|GN5085|0                                        | egazette_pdf   | 2010-08-06 | Sheung Kok Shan Road                              | 上角山路       | declare     | GN5085    |
| 2010-08-20|GN5350|0                                        | egazette_pdf   | 2010-08-20 | Lung Wah Street                                   | 龍華街        | declare     | GN5350    |
| 2010-12-02|GN7631|0                                        | egazette_pdf   | 2010-12-02 | Ting Yat Road                                     | 汀逸路        | declare     | GN7631    |
| 2010-12-02|GN7632|0                                        | egazette_pdf   | 2010-12-02 | Yin Kong Road                                     | 燕崗路        | declare     | GN7632    |
| 2011-02-18|GN1154|0                                        | egazette_pdf   | 2011-02-18 | Tat Mei Road                                      | 達美路        | declare     | GN1154    |
| 2011-02-25|GN1313|0                                        | egazette_pdf   | 2011-02-25 | Legislative Council Road                          | 立法會道       | declare     | GN1313    |
| 2011-05-13|GN2995|0                                        | egazette_pdf   | 2011-05-13 | Golden Beach Path                                 | 黃金泳灘徑      | declare     | GN2995    |
| 2011-05-13|GN2996|0                                        | egazette_pdf   | 2011-05-13 | Mei Fai Street                                    | 美輝街        | declare     | GN2996    |
| 2011-05-13|GN2996|1                                        | egazette_pdf   | 2011-05-13 | Ying Wan Lane                                     | 迎運里        | declare     | GN2996    |
| 2011-10-14|GN6773|0                                        | egazette_pdf   | 2011-10-14 | School Road                                       | 學校路        | declare     | GN6773    |
| 2011-10-14|GN6773|1                                        | egazette_pdf   | 2011-10-14 | Tai San Back Street                               | 大新後街       | declare     | GN6773    |
| 2011-10-14|GN6773|2                                        | egazette_pdf   | 2011-10-14 | Tai Tsoi Yuen Road                                | 大菜園路       | declare     | GN6773    |
| 2011-11-11|GN7459|0                                        | egazette_pdf   | 2011-11-11 | Wun Yiu Road                                      | 碗窰路        | declare     | GN7459    |
| 2011-11-11|GN7460|0                                        | egazette_pdf   | 2011-11-11 | Wholesale Market Street                           | 批發市場街      | declare     | GN7460    |
| 2011-11-11|GN7461|0                                        | egazette_pdf   | 2011-11-11 | Kai Pak Ling Road                                 | 雞伯嶺路       | declare     | GN7461    |
| 2011-12-02|GN7901|0                                        | egazette_pdf   | 2011-12-02 | Chai Kek Road                                     | 寨乪路        | declare     | GN7901    |
| 2013-05-10|GN2719|0                                        | egazette_pdf   | 2013-05-10 | Ha Mei Road                                       | 廈尾路        | declare     | GN2719    |
| 2013-05-10|GN2719|1                                        | egazette_pdf   | 2013-05-10 | Kam Pok Road East                                 | 錦壆路東       | declare     | GN2719    |
| 2013-05-10|GN2719|2                                        | egazette_pdf   | 2013-05-10 | Kam Pok Road West                                 | 錦壆路西       | declare     | GN2719    |
| 2013-05-10|GN2719|3                                        | egazette_pdf   | 2013-05-10 | Kiu Sau Path                                      | 橋壽徑        | declare     | GN2719    |
| 2013-05-10|GN2719|4                                        | egazette_pdf   | 2013-05-10 | Kiu Tak Path                                      | 橋德徑        | declare     | GN2719    |
| 2013-05-10|GN2719|5                                        | egazette_pdf   | 2013-05-10 | Tin Wah Road                                      | 天華路        | declare     | GN2719    |
| 2013-08-02|GN4533|0                                        | egazette_pdf   | 2013-08-02 | Lung Chak Road                                    | 龍澤路        | declare     | GN4533    |
| 2013-08-23|GN4994|0                                        | egazette_pdf   | 2013-08-23 | Universal Gate Road                               | 普門路        | declare     | GN4994    |
| 2013-11-01|GN6570|0                                        | egazette_pdf   | 2013-11-01 |                                                   | 嘉敬里        | declare     | GN6570    |
| 2014-02-14|GN930|0                                         | egazette_pdf   | 2014-02-14 | Muk Ning Street                                   | 沐寧街        | declare     | GN930     |
| 2014-02-14|GN931|0                                         | egazette_pdf   | 2014-02-14 | Shek Tin Road                                     | 石田路        | declare     | GN931     |
| 2014-02-14|GN932|0                                         | egazette_pdf   | 2014-02-14 | Tai Ching Cheung Road                             | 大蒸場路       | declare     | GN932     |
| 2014-03-14|GN1563|0                                        | egazette_pdf   | 2014-03-14 |                                                   | 龍田街        | declare     | GN1563    |
| 2014-03-14|GN1563|1                                        | egazette_pdf   | 2014-03-14 |                                                   | 榕樹灣廣場路     | declare     | GN1563    |
| 2014-03-28|GN1857|0                                        | egazette_pdf   | 2014-03-28 | On Sau Road                                       | 安秀道        | declare     | GN1857    |
| 2014-05-09|GN2737|0                                        | egazette_pdf   | 2014-05-09 |                                                   | 麥園圍路青亦路    | declare     | GN2737    |
| 2014-05-30|GN3150|0                                        | egazette_pdf   | 2014-05-30 |                                                   | 迎康街        | declare     | GN3150    |
| 2014-05-30|GN3150|1                                        | egazette_pdf   | 2014-05-30 |                                                   | 迎東路        | declare     | GN3150    |
| 2015-01-02|GN166|0                                         | egazette_pdf   | 2015-01-02 |                                                   | 下灣村東路      | declare     | GN166     |
| 2015-01-02|GN166|1                                         | egazette_pdf   | 2015-01-02 |                                                   | 下灣村路       | declare     | GN166     |
| 2015-02-13|GN1690|0                                        | egazette_pdf   | 2015-02-13 | Sam Wo Road                                       | 三和路        | declare     | GN1690    |
| 2015-02-13|GN1691|0                                        | egazette_pdf   | 2015-02-13 | Wai Yin Path                                      | 薈然徑        | declare     | GN1691    |
| 2015-03-13|GN2181|0                                        | egazette_pdf   | 2015-03-13 | Hang Kai Lane                                     | 坑溪里        | declare     | GN2181    |
| 2015-03-13|GN2182|0                                        | egazette_pdf   | 2015-03-13 | Lau Yip Street                                    | 流業街        | declare     | GN2182    |
| 2015-03-13|GN2183|0                                        | egazette_pdf   | 2015-03-13 | Man Chat Road                                     | 文質路        | declare     | GN2183    |
| 2015-06-12|GN4273|0                                        | egazette_pdf   | 2015-06-12 |                                                   | 嘉健里        | declare     | GN4273    |
| 2015-06-12|GN4274|0                                        | egazette_pdf   | 2015-06-12 | Tramway Lane                                      | 纜車里        | declare     | GN4274    |
| 2015-07-03|GN4865|0                                        | egazette_pdf   | 2015-07-03 | Pak Shing Kok Road                                | 百勝角路       | declare     | GN4865    |
| 2015-07-24|GN5558|0                                        | egazette_pdf   | 2015-07-24 | Pak Shing Kok Road                                | 百勝角路       |             | GN5558    |
| 2015-08-28|GN6516|0                                        | egazette_pdf   | 2015-08-28 |                                                   | 安茵街        | declare     | GN6516    |
| 2015-11-13|GN8862|0                                        | egazette_pdf   | 2015-11-13 | Tan Kwai Tsuen Lane                               | 丹桂村里       | declare     | GN8862    |
| 2015-12-24|GN9966|0                                        | egazette_pdf   | 2015-12-24 | Lok Ma Chau Road                                  | 落馬洲路       | declare     | GN9966    |
| 2016-03-18|GN1596|0                                        | landsd         | 2016-03-18 | Lung Yuet Road                                    | 龍悅道        | declare     | GN1596    |
| 2016-04-29|GN2478|0                                        | landsd         | 2016-04-29 | Fung Yu Road                                      | 豐裕路        | declare     | GN2478    |
| 2016-05-27|GN3020|0                                        | landsd         | 2016-05-27 | U Lam Terrace                                     | 儒林臺        | declare     | GN3020    |
| 2016-07-08|GN3864|0                                        | landsd         | 2016-07-08 | Lung Kui Road                                     | 龍駒道        | declare     | GN3864    |
| 2016-07-29|GN4332|0                                        | landsd         | 2016-07-29 | U Lam Terrace                                     | 儒林臺        | declare     | GN4332    |
| 2016-09-23|GN5398|0                                        | landsd         | 2016-09-23 | Peng Chau Ho King Street                          | 坪洲好景街      | declare     | GN5398    |
| 2016-11-11|GN6438|0                                        | landsd         | 2016-11-11 | Ying Tung Road                                    | 迎東路        | declare     | GN6438    |
| 2017-01-20|GN330|0                                         | landsd         | 2017-01-20 | Kam Kong Road                                     | 錦江路        | declare     | GN330     |
| 2017-02-17|GN875|0                                         | landsd         | 2017-02-17 | Hammer Hill Road                                  | 斧山道        | declare     | GN875     |
| 2017-02-17|GN876|0                                         | landsd         | 2017-02-17 | Sheung Shing Lane                                 | 常盛里        | declare     | GN876     |
| 2017-03-03|GN1160|0                                        | landsd         | 2017-03-03 | Chun Chi Lane North                               | 振翅里北       | declare     | GN1160    |
| 2017-03-03|GN1160|1                                        | landsd         | 2017-03-03 | Chun Chi Lane South                               | 振翅里南       | declare     | GN1160    |
| 2017-03-03|GN1160|10                                       | landsd         | 2017-03-03 | Tin Chai Lane West                                | 天際里西       | declare     | GN1160    |
| 2017-03-03|GN1160|11                                       | landsd         | 2017-03-03 | Yeung Fan Lane North                              | 揚帆里北       | declare     | GN1160    |
| 2017-03-03|GN1160|12                                       | landsd         | 2017-03-03 | Yeung Fan Lane South                              | 揚帆里南       | declare     | GN1160    |
| 2017-03-03|GN1160|13                                       | landsd         | 2017-03-03 | Yuen Yeung Lane North                             | 遠洋里北       | declare     | GN1160    |
| 2017-03-03|GN1160|14                                       | landsd         | 2017-03-03 | Yuen Yeung Lane South                             | 遠洋里南       | declare     | GN1160    |
| 2017-03-03|GN1160|2                                        | landsd         | 2017-03-03 | Kai Yung Lane                                     | 啟融里        | declare     | GN1160    |
| 2017-03-03|GN1160|3                                        | landsd         | 2017-03-03 | Ko Fei Lane North                                 | 高飛里北       | declare     | GN1160    |
| 2017-03-03|GN1160|4                                        | landsd         | 2017-03-03 | Ko Fei Lane South                                 | 高飛里南       | declare     | GN1160    |
| 2017-03-03|GN1160|5                                        | landsd         | 2017-03-03 | Muk Tai Street                                    | 沐泰街        | declare     | GN1160    |
| 2017-03-03|GN1160|6                                        | landsd         | 2017-03-03 | Muk Yuen Street                                   | 沐元街        | declare     | GN1160    |
| 2017-03-03|GN1160|7                                        | landsd         | 2017-03-03 | Shin Lun Lane                                     | 善鄰里        | declare     | GN1160    |
| 2017-03-03|GN1160|8                                        | landsd         | 2017-03-03 | Shing Kai Road                                    | 承啟道        | declare     | GN1160    |
| 2017-03-03|GN1160|9                                        | landsd         | 2017-03-03 | Tin Chai Lane East                                | 天際里東       | declare     | GN1160    |
| 2017-03-10|GN1273|0                                        | landsd         | 2017-03-10 | Chek Lap Kok Road                                 | 赤鱲角路       | declare     | GN1273    |
| 2017-03-10|GN1273|1                                        | landsd         | 2017-03-10 | Hong Kong-Zhuhai-Macao Bridge Hong Kong Link Road | 港珠澳大橋香港連接路 | declare     | GN1273    |
| 2017-03-10|GN1273|10                                       | landsd         | 2017-03-10 | Shun Wan Road                                     | 順環路        | declare     | GN1273    |
| 2017-03-10|GN1273|11                                       | landsd         | 2017-03-10 | Shun Wui Road                                     | 順匯路        | declare     | GN1273    |
| 2017-03-10|GN1273|12                                       | landsd         | 2017-03-10 | Tung Wing Road                                    | 東榮路        | declare     | GN1273    |
| 2017-03-10|GN1273|2                                        | landsd         | 2017-03-10 | Shun Chit Road                                    | 順捷路        | declare     | GN1273    |
| 2017-03-10|GN1273|3                                        | landsd         | 2017-03-10 | Shun Fai Road                                     | 順暉路        | declare     | GN1273    |
| 2017-03-10|GN1273|4                                        | landsd         | 2017-03-10 | Shun Hang Road                                    | 順行路        | declare     | GN1273    |
| 2017-03-10|GN1273|5                                        | landsd         | 2017-03-10 | Shun Lin Road                                     | 順連路        | declare     | GN1273    |
| 2017-03-10|GN1273|6                                        | landsd         | 2017-03-10 | Shun Long Road                                    | 順朗路        | declare     | GN1273    |
| 2017-03-10|GN1273|7                                        | landsd         | 2017-03-10 | Shun Lui Road                                     | 順旅路        | declare     | GN1273    |
| 2017-03-10|GN1273|8                                        | landsd         | 2017-03-10 | Shun Ming Road                                    | 順明路        | declare     | GN1273    |
| 2017-03-10|GN1273|9                                        | landsd         | 2017-03-10 | Shun Ngon Road                                    | 順岸路        | declare     | GN1273    |
| 2017-04-07|GN1920|0                                        | landsd         | 2017-04-07 | Tan Lai Street                                    | 丹荔街        | declare     | GN1920    |
| 2017-04-07|GN1920|1                                        | landsd         | 2017-04-07 | Yau Ma Tei Interchange                            | 油麻地交匯處     | declare     | GN1920    |
| 2017-04-07|GN1922|0                                        | landsd         | 2017-04-07 | Heung Yip Path                                    | 香葉徑        | declare     | GN1922    |
| 2017-04-21|GN2427|0                                        | landsd         | 2017-04-21 | Hammer Hill Road                                  | 斧山道        | declare     | GN2427    |
| 2017-04-21|GN2429|0                                        | landsd         | 2017-04-21 | Hammer Hill Road                                  | 斧山道        |             | GN2429    |
| 2017-06-30|GN4525|0                                        | landsd         | 2017-06-30 | Tai Shu Ha Road West                              | 大樹下西路      | declare     | GN4525    |
| 2017-08-04|GN5710|0                                        | landsd         | 2017-08-04 | Kai San Road                                      | 啟新道        | declare     | GN5710    |
| 2017-08-04|GN5710|1                                        | landsd         | 2017-08-04 | Muk Long Street                                   | 沐朗街        | declare     | GN5710    |
| 2017-09-29|GN7314|0                                        | landsd         | 2017-09-29 | Ping Kin Lane                                     | 屏健里        | declare     | GN7314    |
| 2017-09-29|GN7316|0                                        | landsd         | 2017-09-29 | Yee Ming Path                                     | 怡明徑        | declare     | GN7316    |
| 2017-10-13|GN7595|0                                        | landsd         | 2017-10-13 | Ching Yu Path                                     | 菁裕徑        | declare     | GN7595    |
| 2017-10-13|GN7595|1                                        | landsd         | 2017-10-13 | Fung Cheung Path                                  | 鳳翔徑        | declare     | GN7595    |
| 2017-10-13|GN7595|2                                        | landsd         | 2017-10-13 | Fung Kwan Path                                    | 鳳群徑        | declare     | GN7595    |
| 2017-10-13|GN7595|3                                        | landsd         | 2017-10-13 | Fung Yau Path                                     | 鳳攸徑        | declare     | GN7595    |
| 2017-10-13|GN7595|4                                        | landsd         | 2017-10-13 | Kin Cheung Street                                 | 建翔街        | declare     | GN7595    |
| 2017-10-13|GN7595|5                                        | landsd         | 2017-10-13 | Kin Yip Path                                      | 建業徑        | declare     | GN7595    |
| 2017-10-13|GN7595|6                                        | landsd         | 2017-10-13 | On Shun Path                                      | 安信徑        | declare     | GN7595    |
| 2017-10-13|GN7595|7                                        | landsd         | 2017-10-13 | Sai Ching Path                                    | 西菁徑        | declare     | GN7595    |
| 2017-10-13|GN7595|8                                        | landsd         | 2017-10-13 | Shui Che Kwun Lane                                | 水車館里       | declare     | GN7595    |
| 2017-10-13|GN7595|9                                        | landsd         | 2017-10-13 | Yu Wing Path                                      | 裕榮徑        | declare     | GN7595    |
| 2017-11-10|GN8364|0                                        | landsd         | 2017-11-10 | Long Ngai Path                                    | 朗藝徑        | declare     | GN8364    |
| 2017-11-10|GN8364|1                                        | landsd         | 2017-11-10 | Sai Yu Path                                       | 西裕徑        | declare     | GN8364    |
| 2017-11-10|GN8364|2                                        | landsd         | 2017-11-10 | Ping Ha Path                                      | 屏廈徑        | declare     | GN8364    |
| 2017-11-10|GN8364|3                                        | landsd         | 2017-11-10 | Tin Shui Path                                     | 天瑞徑        | declare     | GN8364    |
| 2017-11-10|GN8364|4                                        | landsd         | 2017-11-10 | Tin Ying Path                                     | 天影徑        | declare     | GN8364    |
| 2017-12-22|GN9865|0                                        | landsd         | 2017-12-22 | Lai Ying Street                                   | 荔盈街        | declare     | GN9865    |
| 2017-12-22|GN9866|0                                        | landsd         | 2017-12-22 | Ko Po Path                                        | 高埔徑        | declare     | GN9866    |
| 2018-02-02|GN650|0                                         | landsd         | 2018-02-02 | Choi Shing Lane                                   | 彩盛里        | declare     | GN650     |
| 2018-02-02|GN651|0                                         | landsd         | 2018-02-02 | Po Min Path                                       | 坡面徑        | declare     | GN651     |
| 2018-03-02|GN1472|0                                        | landsd         | 2018-03-02 | Pak Sha Wan Street                                | 白沙灣街       | declare     | GN1472    |
| 2018-03-29|GN2325|0                                        | landsd         | 2018-03-29 | Chui Fuk Road                                     | 翠福路        | declare     | GN2325    |
| 2018-03-29|GN2325|1                                        | landsd         | 2018-03-29 | Fu Fuk Road                                       | 富福路        | declare     | GN2325    |
| 2018-05-04|GN3295|0                                        | landsd         | 2018-05-04 | Shung Shan Street                                 | 崇山街        | declare     | GN3295    |
| 2018-06-01|GN4004|1                                        | landsd         | 2018-06-01 | Wui Man Road                                      | 匯民道        |             | GN4004    |
| 2018-10-05|GN7463|1                                        | landsd         | 2018-10-05 | Nga Cheung Road                                   | 雅翔道        |             | GN7463    |
| 2018-12-14|GN9290|0                                        | landsd         | 2018-12-14 | Lai Po Road                                       | 荔寶路        |             | GN9290    |
| 2019-02-01|GN1094|0                                        | landsd         | 2019-02-01 | Heung Yuen Wai Highway                            | 香園圍公路      | declare     | GN1094    |
| 2019-02-01|GN1095|0                                        | landsd         | 2019-02-01 | Yi Tung Road                                      | 怡東路        | declare     | GN1095    |
| 2019-03-01|GN1656|0                                        | landsd         | 2019-03-01 | Hung Hom Bypass                                   | 紅磡繞道       | declare     | GN1656    |
| 2019-03-01|GN1657|0                                        | landsd         | 2019-03-01 | Ching Lai Road                                    | 澄麗路        | declare     | GN1657    |
| 2019-03-15|GN1970|0                                        | landsd         | 2019-03-15 | Lung Hop Street                                   | 龍合街        | declare     | GN1970    |
| 2019-03-29|GN2321|3                                        | landsd         | 2019-03-29 | Fleming Road                                      | 菲林明道       |             | GN2321    |
| 2019-04-26|GN2869|0                                        | landsd         | 2019-04-26 | Yiu Sha Road                                      | 耀沙路        | declare     | GN2869    |
| 2019-04-26|GN2870|0                                        | landsd         | 2019-04-26 | Tung Lei Path                                     | 東籬徑        | declare     | GN2870    |
| 2019-04-26|GN2871|0                                        | landsd         | 2019-04-26 | Hung Leng North Road                              | 孔嶺北路       | declare     | GN2871    |
| 2019-05-31|GN3588|0                                        | landsd         | 2019-05-31 | Museum Drive                                      | 博物館道       | declare     | GN3588    |
| 2019-07-26|GN4779|0                                        | landsd         | 2019-07-26 | Tung Yiu Road                                     | 東耀路        | declare     | GN4779    |
| 2019-09-27|GN6068|0                                        | landsd         | 2019-09-27 | Hung Pak Road                                     | 洪柏路        | declare     | GN6068    |
| 2019-10-25|GN6636|0                                        | landsd         | 2019-10-25 | Hoi Sha Path                                      | 海沙徑        | declare     | GN6636    |
| 2020-04-03|GN1669|0                                        | egazette_pdf   | 2020-04-03 |                                                   | 米埔南路       | declare     | GN1669    |
| 2020-04-03|GN1669|1                                        | egazette_pdf   | 2020-04-03 |                                                   | 清攸徑        | declare     | GN1669    |
| 2020-04-03|GN1669|2                                        | egazette_pdf   | 2020-04-03 |                                                   | 江埔路        | declare     | GN1669    |
| 2020-04-03|GN1669|3                                        | egazette_pdf   | 2020-04-03 |                                                   | 高上路        | declare     | GN1669    |
| 2020-04-03|GN1669|4                                        | egazette_pdf   | 2020-04-03 |                                                   | 梁盛路        | declare     | GN1669    |
| 2020-04-03|GN1669|5                                        | egazette_pdf   | 2020-04-03 |                                                   | 石上路        | declare     | GN1669    |
| 2020-05-22|GN2656|0                                        | landsd         | 2020-05-22 | Shek Po East Road                                 | 石埗東路       | declare     | GN2656    |
| 2020-06-12|GN3236|0                                        | landsd         | 2020-06-12 | Ho Chung North Road                               | 蠔涌北路       | declare     | GN3236    |
| 2020-08-07|GN4507|0                                        | egazette_pdf   | 2020-08-07 | Tung Cheong Street                                | 東昌街        | declare     | GN4507    |
| 2020-08-07|GN4508|0                                        | landsd         | 2020-08-07 | Lai Chui Path                                     | 麗翠徑        | declare     | GN4508    |
| 2020-10-16|GN5983|0                                        | egazette_pdf   | 2020-10-16 | Gascoigne Road Fylover                            | 加士居道天橋     | declare     | GN5983    |
| 2020-10-23|GN6116|0                                        | landsd         | 2020-10-23 | Yan Po Road                                       | 欣寶路        | declare     | GN6116    |
| 2020-10-23|GN6118|0                                        | egazette_pdf   | 2020-10-23 | Gascoigne Road Flyover                            |            |             | GN6118    |
| 2020-11-06|GN6474|0                                        | egazette_pdf   | 2020-11-06 |                                                   | 屯門赤鱲角隧道公路  | declare     | GN6474    |
| 2020-11-06|GN6474|1                                        | egazette_pdf   | 2020-11-06 |                                                   | 浩和街        | declare     | GN6474    |
| 2020-11-06|GN6474|2                                        | egazette_pdf   | 2020-11-06 |                                                   | 浩逸街        | declare     | GN6474    |
| 2020-11-20|GN6775|0                                        | egazette_pdf   | 2020-11-20 | Kwun Tong Bypass                                  | 觀塘繞道       | declare     | GN6775    |
| 2020-12-31|GN7695|0                                        | landsd         | 2020-12-31 | Tsing Tin Interchange                             | 青田交匯處      | declare     | GN7695    |
| 2021-02-05|GN708|0                                         | egazette_pdf   | 2021-02-05 |                                                   | 尾逢路        | declare     | GN708     |
| 2021-02-05|GN708|1                                         | egazette_pdf   | 2021-02-05 |                                                   | 水尾路        | declare     | GN708     |
| 2021-02-26|GN1088|0                                        | landsd         | 2021-02-26 | Lung Chun Road                                    | 龍峻路        | declare     | GN1088    |
| 2021-04-30|GN2547|0                                        | landsd         | 2021-04-30 | Ocean Drive                                       | 海洋徑        | declare     | GN2547    |
| 2021-05-28|GN3262|0                                        | egazette_pdf   | 2021-05-28 |                                                   | 安愉道        | declare     | GN3262    |
| 2021-05-28|GN3262|1                                        | egazette_pdf   | 2021-05-28 |                                                   | 安愉徑        | declare     | GN3262    |
| 2021-05-28|GN3262|2                                        | egazette_pdf   | 2021-05-28 |                                                   | 安健道        | declare     | GN3262    |
| 2021-05-28|GN3262|3                                        | egazette_pdf   | 2021-05-28 |                                                   | 安禧街        | declare     | GN3262    |
| 2021-06-11|GN3565|0                                        | landsd         | 2021-06-11 | Discovery Peak Road                               | 愉峰道        | declare     | GN3565    |
| 2021-06-25|GN3897|0                                        | egazette_pdf   | 2021-06-25 |                                                   | 啟德橋道       | declare     | GN3897    |
| 2021-06-25|GN3897|1                                        | egazette_pdf   | 2021-06-25 |                                                   | 承富里        | declare     | GN3897    |
| 2021-06-25|GN3897|2                                        | egazette_pdf   | 2021-06-25 |                                                   | 承裕里        | declare     | GN3897    |
| 2021-06-25|GN3897|3                                        | egazette_pdf   | 2021-06-25 |                                                   | 承景街        | declare     | GN3897    |
| 2021-07-23|GN4522|0                                        | landsd         | 2021-07-23 | Muk Lai Street                                    | 沐禮街        | declare     | GN4522    |
| 2021-07-30|GN4715|0                                        | landsd         | 2021-07-30 | Ping Shek Lane                                    | 坪石里        | declare     | GN4715    |
| 2021-09-24|GN6003|0                                        | egazette_pdf   | 2021-09-24 | Fi R S T Sky Street                               | 航天城第一街     | declare     | GN6003    |
| 2021-09-24|GN6003|1                                        | egazette_pdf   | 2021-09-24 | S E Cond Sky Street                               | 航天城第二街     | declare     | GN6003    |
| 2021-09-24|GN6003|2                                        | egazette_pdf   | 2021-09-24 | T Hi R D Sky Street                               | 航天城第三街     | declare     | GN6003    |
| 2021-09-30|GN6129|0                                        | landsd         | 2021-09-30 | Choi Tip Street                                   | 彩蝶街        | declare     | GN6129    |
| 2021-10-22|GN6649|0                                        | landsd         | 2021-10-22 | On Pik Road                                       | 安碧道        | declare     | GN6649    |
| 2021-11-26|GN7441|0                                        | landsd         | 2021-11-26 | Ko Ling Road                                      | 高嶺道        | declare     | GN7441    |
| 2021-12-03|GN7633|0                                        | egazette_pdf   | 2021-12-03 | T U E N Lok L A N E                               | 屯樂里        | declare     | GN7633    |
| 2022-08-19|GN4534|0                                        | landsd         | 2022-08-19 | Ko Nga Lane                                       | 高雅里        | declare     | GN4534    |
| 2022-09-02|GN4919|0                                        | landsd         | 2022-09-02 | Hoi Tat Street                                    | 海達街        | declare     | GN4919    |
| 2022-10-07|GN5717|0                                        | egazette_pdf   | 2022-10-07 | T In Wo R O A D                                   | 田禾路        | declare     | GN5717    |
| 2022-10-21|GN6005|0                                        | egazette_pdf   | 2022-10-21 | Chi Li T P At H                                   | 誌烈徑        | declare     | GN6005    |
| 2022-11-25|GN6835|0                                        | egazette_pdf   | 2022-11-25 | L Am T In In Ter Ch A Ng E                        | 藍田交匯處      | declare     | GN6835    |
| 2022-11-25|GN6835|1                                        | egazette_pdf   | 2022-11-25 | T S E Ung L Am Highw A Y                          | 將藍公路       | declare     | GN6835    |
| 2022-12-09|GN7138|0                                        | egazette_pdf   | 2022-12-09 | Hoi Shin L A N E                                  | 海善里        | declare     | GN7138    |
| 2022-12-30|GN7562|0                                        | egazette_pdf   | 2022-12-30 |                                                   | 柏壽路        | declare     | GN7562    |
| 2022-12-30|GN7562|1                                        | egazette_pdf   | 2022-12-30 |                                                   | 鄉梓路        | declare     | GN7562    |
| 2023-02-03|GN839|0                                         | egazette_pdf   | 2023-02-03 | Hoi Ying R O A D                                  | 海映路        | declare     | GN839     |
| 2023-02-17|GN1075|0                                        | egazette_pdf   | 2023-02-17 |                                                   | 香蓮路        | declare     | GN1075    |
| 2023-02-17|GN1075|1                                        | egazette_pdf   | 2023-02-17 |                                                   | 蓮竹路        | declare     | GN1075    |
| 2023-04-28|GN2593|0                                        | landsd         | 2023-04-28 | Muk Wo Street                                     | 沐和街        | declare     | GN2593    |
| 2023-05-12|GN2908|0                                        | egazette_pdf   | 2023-05-12 | Shing Y A Us Treet                                | 承佑街        | declare     | GN2908    |
| 2023-05-19|GN3075|0                                        | egazette_pdf   | 2023-05-19 | M Oon T In L A N E                                | 滿田里        | declare     | GN3075    |
| 2023-06-09|GN3522|0                                        | egazette_pdf   | 2023-06-09 | Kwun Sh A P At H                                  | 觀沙徑        | declare     | GN3522    |
| 2023-06-23|GN3740|0                                        | egazette_pdf   | 2023-06-23 | Lung Tat P At H                                   | 龍達徑        | declare     | GN3740    |
| 2023-07-28|GN4517|0                                        | landsd         | 2023-07-28 | Chi Tin Street                                    | 智田街        | declare     | GN4517    |
| 2023-12-08|GN7465|0                                        | landsd         | 2023-12-08 | Kam Yee Road                                      | 錦義路        | declare     | GN7465    |
| 2024-03-01|GN1176|0                                        | egazette_pdf   | 2024-03-01 | Ma Ta K R O A D                                   | 馬得路        | declare     | GN1176    |
| 2024-03-01|GN1176|1                                        | egazette_pdf   | 2024-03-01 | Ma Fuk R O A D                                    | 馬福路        | declare     | GN1176    |
| 2024-03-01|GN1176|2                                        | egazette_pdf   | 2024-03-01 | Wo Lok L A N E                                    | 和樂里        | declare     | GN1176    |
| 2024-03-08|GN1335|0                                        | egazette_pdf   | 2024-03-08 | Lung T Ing L A N E                                | 龍庭里        | declare     | GN1335    |
| 2024-04-26|GN2409|0                                        | landsd         | 2024-04-26 | Toscana Drive                                     | 意濤徑        | declare     | GN2409    |
| 2024-05-10|GN2696|0                                        | landsd         | 2024-05-10 | Fung Ying Path                                    | 豐盈徑        | declare     | GN2696    |
| 2024-06-14|GN3412|0                                        | landsd         | 2024-06-14 | Chui Kwan Drive                                   | 翠群徑        | declare     | GN3412    |
| 2024-06-21|GN3555|0                                        | egazette_pdf   | 2024-06-21 | Y A U M Ong L A N E                               | 油旺里        | declare     | GN3555    |
| 2024-08-16|GN4837|0                                        | landsd         | 2024-08-16 | Chui Kwan Drive                                   | 翠群徑        | declare     | GN4837    |
| 2024-08-23|GN4962|0                                        | egazette_pdf   | 2024-08-23 | T Sz Lun R O A D                                  | 紫麟路        | declare     | GN4962    |
| 2024-09-06|GN5323|0                                        | egazette_pdf   | 2024-09-06 | Wui T Ung Street                                  | 匯東街        | declare     | GN5323    |
| 2024-09-06|GN5324|0                                        | landsd         | 2024-09-06 | Ying Tung Road                                    | 迎東路        |             | GN5324    |
| 2024-09-13|GN5451|0                                        | egazette_pdf   | 2024-09-13 | Shing Fung L A N E                                | 承豐里        | declare     | GN5451    |
| 2024-10-18|GN6215|0                                        | landsd         | 2024-10-18 | Yuk Tong Path                                     | 沃塘徑        | declare     | GN6215    |
| 2024-12-06|GN7369|0                                        | landsd         | 2024-12-06 | Shing Yan Lane                                    | 承恩里        | declare     | GN7369    |
| 2025-01-24|GN565|0                                         | landsd         | 2025-01-24 | Long Fung Street                                  | 朗風街        | declare     | GN565     |
| 2025-02-28|GN1271|0                                        | egazette_pdf   | 2025-02-28 | Innov At Ion A Nd Te Chnology P Ar K R O A D      | 創科園路       | declare     | GN1271    |
| 2025-02-28|GN1271|1                                        | egazette_pdf   | 2025-02-28 | Re S Ear Ch R O A D                               | 研發路        | declare     | GN1271    |
| 2025-07-25|GN4611|0                                        | egazette_pdf   | 2025-07-25 |                                                   | 貴東路        | declare     | GN4611    |
| 2025-07-25|GN4611|1                                        | egazette_pdf   | 2025-07-25 |                                                   | 朗東路        | declare     | GN4611    |
| 2025-07-25|GN4611|2                                        | egazette_pdf   | 2025-07-25 |                                                   | 曉東路        | declare     | GN4611    |
| 2025-07-25|GN4611|3                                        | egazette_pdf   | 2025-07-25 |                                                   | 錦東街        | declare     | GN4611    |
| 2025-07-25|GN4611|4                                        | egazette_pdf   | 2025-07-25 |                                                   | 兆東街        | declare     | GN4611    |
| 2025-07-25|GN4611|5                                        | egazette_pdf   | 2025-07-25 |                                                   | 孝東街        | declare     | GN4611    |
| 2025-07-25|GN4611|6                                        | egazette_pdf   | 2025-07-25 |                                                   | 彩東里        | declare     | GN4611    |
| 2025-07-25|GN4611|7                                        | egazette_pdf   | 2025-07-25 |                                                   | 善東里        | declare     | GN4611    |
| 2025-07-25|GN4611|8                                        | egazette_pdf   | 2025-07-25 |                                                   | 仁東里        | declare     | GN4611    |
| 2025-10-10|GN6447|0                                        | landsd         | 2025-10-10 | Choi Lung Street                                  | 彩隆街        | declare     | GN6447    |
| 2025-11-21|GN7381|0                                        | egazette_pdf   | 2025-11-21 |                                                   | 啟德交匯處      | declare     | GN7381    |
| 2025-11-21|GN7381|1                                        | landsd         | 2025-11-21 | Kai Tak Interchange                               | 啟德交匯處      | declare     | GN7381    |
| 2026-01-16|GN377|0                                         | egazette_pdf   | 2026-01-16 |                                                   | 古洞北路       | declare     | GN377     |
| 2026-01-16|GN377|1                                         | egazette_pdf   | 2026-01-16 |                                                   | 古雋街        | declare     | GN377     |
| 2026-02-13|GN995|0                                         | landsd         | 2026-02-13 | Sheung Yip Street                                 | 尚業街        | declare     | GN995     |
| 2026-03-27|GN1839|0                                        | egazette_pdf   | 2026-03-27 | F A Nling Bypass                                  | 粉嶺繞道       | declare     | GN1839    |
| 2026-03-27|GN1839|1                                        | egazette_pdf   | 2026-03-27 | Sh E Ung Ho R O A D                               | 上河路        | declare     | GN1839    |
| 2026-03-27|GN1839|2                                        | egazette_pdf   | 2026-03-27 | Fung L Am R O A D                                 | 鳳林路        | declare     | GN1839    |
| 2026-03-27|GN1839|3                                        | egazette_pdf   | 2026-03-27 | Fung Ling R O A D                                 | 鳳嶺路        | declare     | GN1839    |
| 2026-04-24|GN2370|0                                        | landsd         | 2026-04-24 | Ping Yip Street                                   | 屏業街        | declare     | GN2370    |




---

## 2. Shadow duplicate timelines (10 pairs)

### What this means

The same street name exists **twice** in the master data: once linked by `street_code` (used by the map) and once as a name-only orphan (ignored by the map but still in the file).

### Impact


| Conflict?     | Streets                                                           | What happens                                                                                                   |
| ------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **YES — fix** | Cheung Sha Wan, Shing Kai, Chui Kwan, Nga Cheung, Lai Po, Fleming | Orphan has different (or null) canonical year; QA reports false issues; risk if code-based row is ever deleted |
| no            | Tong Hang, Tsz Tin, Hing Kwai, Yau Ma Tei Interchange             | Duplicate copy with same date — harmless but should be merged for cleanliness                                  |


### Fix recommendation

For each pair: **delete the name-only orphan event** (or merge its events into the coded `street_code` if the orphan has extra facts). Re-run `npm run rebuild:naming && npm run report:pending-years`.


| Street                 | Coded | Coded canonical | Orphan canonical | Fix action                            |
| ---------------------- | ----- | --------------- | ---------------- | ------------------------------------- |
| Cheung Sha Wan Road    | 10206 | 1923-09-28      | 1927-11-25       | Delete orphan or merge into coded row |
| Tong Hang Road         | 12993 | 1990-11-30      | 1990-11-30       | Delete duplicate orphan               |
| Tsz Tin Road           | 12992 | 1990-11-30      | 1990-11-30       | Delete duplicate orphan               |
| Hing Kwai Street       | 13517 | 1992-05-29      | 1992-05-29       | Delete duplicate orphan               |
| Shing Kai Road         | 14363 | 2012-09-28      | 2017-03-03       | Delete orphan or merge into coded row |
| Yau Ma Tei Interchange | 14449 | 2017-04-07      | 2017-04-07       | Delete duplicate orphan               |
| Nga Cheung Road        | 13884 | 1998-05-22      | (null)           | Delete orphan (false no_declaration)  |
| Lai Po Road            | 13951 | 1999-03-12      | (null)           | Delete orphan (false no_declaration)  |
| Fleming Road           | 10495 | 1929-06-14      | (null)           | Delete orphan (false no_declaration)  |
| Chui Kwan Drive        | 13996 | 1999-12-30      | 2024-06-14       | Delete orphan or merge into coded row |


---

## 3. Aggregate display names (pickDisplayNames)

### What this means

Build logic sets the timeline's "display name" from the **last event by date**, even if that event is a former name (e.g. Japanese occupation rename).

### Impact on users

**None for normal map use.** The map chip shows names from geojson (Queen's Road Central), not from this aggregate field. This only breaks automated QA comparisons and internal metadata.

### Fix recommendation

**Optional.** Change `pickDisplayNames` to prefer the latest `current_name` event, or the geojson name. Low priority.

**Rename chain break on 11805:** occupation event says previous name was Queen's Road East, but prior event is Gap Road — optional historical cleanup.

---

## 4. Name mismatches: aggregate vs geojson (56 streets)

### What this means

For 56 verified roads, the timeline's stored display name differs from the centreline label in geojson. The map **shows the geojson name** (correct for users).

### Impact on users


| Category                                   | Count | User sees                                                      | Fix?                                                                     |
| ------------------------------------------ | ----- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Occupation name in aggregate (11804–11806) | 3     | Correct Queen's Road names on map                              | Optional — build logic                                                   |
| Chinese differs, English agrees            | 40    | Map Chinese from geojson; 舊稱 may show gazette Chinese + remark | Verify gazette; often geojson Chinese is wrong (e.g. 10326 Conduit Road) |
| English differs                            | 13    | Map uses geojson English                                       | Review for spelling vs homonym (e.g. Emma/Ema Avenue)                    |


### Fix recommendation

- **10326, 10666:** Likely **geojson label bugs** (干德道 on Conduit Road; 克頓道 on Hatton Road) — fix upstream in LandsD geometry, not delete events.
- **Most zh-only (40):** Gazette Chinese may be authoritative; UI already adds remarks via `buildNamingRemarks`.
- **No urgent fix** unless you want cleaner QA output.

### Full mismatch table


| street_code | category                    | geo EN                              | agg EN                              | geo ZH | agg ZH | canonical  |
| ----------- | --------------------------- | ----------------------------------- | ----------------------------------- | ------ | ------ | ---------- |
| 10083       | zh_only_geojson_or_event    | Braga Circuit                       | Braga Circuit                       | 布力架街   | 布力架道   | 1936-11-06 |
| 10095       | zh_only_geojson_or_event    | Brown Street                        | Brown Street                        | 布朗街    | 寶現街    | 1941-07-18 |
| 10231       | zh_only_geojson_or_event    | Chi Wo Street                       | Chi Wo Street                       | 志和街    | 致和街    | 1920-09-17 |
| 10249       | zh_only_geojson_or_event    | Ching Lin Terrace                   | Ching Lin Terrace                   | 青蓮臺    | 青蓮台    | 1926-01-29 |
| 10326       | zh_only_geojson_or_event    | Conduit Road                        | Conduit Road                        | 干德道    | 干諾道    | 1907-04-12 |
| 10339       | zh_only_geojson_or_event    | Cornwall Street                     | Cornwall Street                     | 歌和老街   | 歌和老道   | 1929-08-23 |
| 10373       | zh_only_geojson_or_event    | Derby Road                          | Derby Road                          | 打比道    | 多庇道    | 1939-04-28 |
| 10385       | zh_only_geojson_or_event    | Dragon Road                         | Dragon Road                         | 皇龍道    | 黃龍道    | 1930-11-28 |
| 10413       | en_mismatch                 | Emma Avenue                         | Ema Avenue                          | 艷馬道    | 艷馬道    | 1925-10-09 |
| 10496       | zh_only_geojson_or_event    | Flint Road                          | Flint Road                          | 火石道    | 芙蓮道    | 1939-04-28 |
| 10550       | zh_only_geojson_or_event    | Fuk Lo Tsun Road                    | Fuk Lo Tsun Road                    | 福佬村道   | 福老村道   | 1933-05-12 |
| 10666       | zh_only_geojson_or_event    | Hatton Road                         | Hatton Road                         | 克頓道    | 旭龢道    | 1906-08-03 |
| 10709       | en_mismatch                 | Hillwood Road                       | Hill Wood Road                      | 山林道    | 山林道    | 1933-05-12 |
| 10799       | zh_only_geojson_or_event    | Holy Cross Path                     | Holy Cross Path                     | 聖十字徑   | 聖十字路   | 1937-06-04 |
| 10892       | en_mismatch                 | Jaffe Road                          | Jaffé Road                          | 謝斐道    | 謝斐道    | 1931-10-30 |
| 10897       | zh_only_geojson_or_event    | Java Road                           | Java Road                           | 渣華道    | 爪哇路    | 1933-07-28 |
| 10902       | zh_only_geojson_or_event    | Jones Street                        | Jones Street                        | 重士街    | 瓊斯街    | 1915-10-22 |
| 11048       | zh_only_geojson_or_event    | Knight Street                       | Knight Street                       | 勵德街    | 勳德街    | 1929-06-21 |
| 11070       | zh_only_geojson_or_event    | Kuk Ting Street                     | Kuk Ting Street                     | 谷亭街    | 穀亭街    | 1935-02-15 |
| 11128       | zh_only_geojson_or_event    | Kwong Hon Terrace                   | Kwong Hon Terrace                   | 光漢臺    | 光漢台    | 1920-11-05 |
| 11240       | zh_only_geojson_or_event    | Link Road                           | Link Road                           | 連道     | 連合道    | 1931-05-15 |
| 11241       | zh_only_geojson_or_event    | Lion Rock Road                      | Lion Rock Road                      | 獅子石道   | 獅子石街   | 1933-05-12 |
| 11349       | zh_only_geojson_or_event    | Ma Tau Chung Road                   | Ma Tau Chung Road                   | 馬頭涌道   | 碼頭涌道   | 1926-04-16 |
| 11350       | zh_only_geojson_or_event    | Ma Tau Kok Road                     | Ma Tau Kok Road                     | 馬頭角道   | 碼頭角道   | 1926-04-16 |
| 11490       | zh_only_geojson_or_event    | Nam Kok Road                        | Nam Kok Road                        | 南角道    | 南角路    | 1933-05-12 |
| 11550       | zh_only_geojson_or_event    | North Point Road                    | North Point Road                    | 北角道    | 北角路    | 1933-07-28 |
| 11620       | zh_only_geojson_or_event    | Ormsby Street                       | Ormsby Street                       | 安庶庇街   | 安庶庇道   | 1941-07-18 |
| 11749       | zh_only_geojson_or_event    | Po On Road                          | Po On Road                          | 保安道    | 普安道    | 1934-02-09 |
| 11767       | en_mismatch                 | Pok Fu Lam Reservoir Road           | Pokfulam Reservoir Road             | 薄扶林水塘道 | 薄扶林水塘道 | 1937-09-24 |
| 11782       | zh_only_geojson_or_event    | Prat Avenue                         | Prat Avenue                         | 寶勒巷    | 勃利亞街   | 1921-02-04 |
| 11788       | en_mismatch                 | Prince Edward Road West             | Prince Edward Road                  | 太子道西   | 太子道    | 1924-03-07 |
| 11804       | occupation_latest_aggregate | Queen's Road Central                | Nakameiji-dori                      | 皇后大道中  | 中明治通   | 1874-02-14 |
| 11805       | occupation_latest_aggregate | Queen's Road East                   | Higashimeiji-dori                   | 皇后大道東  | 東明治通   | 1874-02-14 |
| 11806       | occupation_latest_aggregate | Queen's Road West                   | Nishimeiji-dori                     | 皇后大道西  | 西明治通   | 1877-01-06 |
| 11831       | zh_only_geojson_or_event    | Sa Po Road                          | Sa Po Road                          | 沙浦道    | 沙埔道    | 1926-06-25 |
| 11840       | zh_only_geojson_or_event    | Sai Kung Road                       | Sai Kung Road                       | 西貢道    | 西貢路    | 1922-05-05 |
| 11937       | zh_only_geojson_or_event    | Schooner Street                     | Schooner Street                     | 捷船街    | 帆船街    | 1916-02-05 |
| 11991       | en_mismatch                 | Shau Kei Wan Road                   | Shaukiwan Road                      | 筲箕灣道   | 筲箕灣道   | 1940-07-26 |
| 11996       | zh_only_geojson_or_event    | Shek Ku Lung Road                   | Shek Ku Lung Road                   | 石鼓壟道   | 石古壟道   | 1926-06-25 |
| 12068       | en_mismatch                 | Shiu Wo Street                      | Siu Wo Street                       | 兆和街    | 兆和街    | 1940-01-19 |
| 12106       | en_mismatch                 | Shung Yan Street                    | Shung Yan Road                      | 崇仁街    | 崇仁道    | 1935-03-01 |
| 12134       | zh_only_geojson_or_event    | Sports Road                         | Sports Road                         | 體育道    | 體育路    | 1939-06-19 |
| 12180       | zh_only_geojson_or_event    | Sun Wui Road                        | Sun Wui Road                        | 新會道    | 新會路    | 1933-07-28 |
| 12193       | zh_only_geojson_or_event    | Surrey Lane                         | Surrey Lane                         | 舒梨道    | 舒梨里    | 1929-08-23 |
| 12282       | zh_only_geojson_or_event    | Tai Wan Road                        | Tai Wan Road                        | 大環道    | 大灣道    | 1922-06-02 |
| 12384       | zh_only_geojson_or_event    | To Li Terrace                       | To Li Terrace                       | 桃李臺    | 桃李台    | 1926-01-29 |
| 12391       | zh_only_geojson_or_event    | Tong Shui Road                      | Tong Shui Road                      | 糖水道    | 糖水路    | 1933-07-28 |
| 12395       | zh_only_geojson_or_event    | Tonnochy Road                       | Tonnochy Road                       | 杜老誌道   | 謝斐道    | 1929-06-14 |
| 12399       | zh_only_geojson_or_event    | Tregunter Path                      | Tregunter Path                      | 地利根德里  | 地利根德道  | 1920-03-19 |
| 12407       | en_mismatch                 | Tsat Tsz Mui Road                   | Tsat Tse Mui Road                   | 七姊妹道   | 七姊妹道   | 1939-12-15 |
| 12413       | zh_only_geojson_or_event    | Tsing Chau Street                   | Tsing Chau Street                   | 青州街    | 青洲街    | 1931-10-30 |
| 12781       | zh_only_geojson_or_event    | Wong Ma Kok Road                    | Wong Ma Kok Road                    | 黃麻角道   | 黃蔴角道   | 1937-09-24 |
| 12782       | en_mismatch                 | Wong Nai Chung Gap Road             | Wong Nei Cheong Gap Road            | 黃泥涌峽道  | 黃泥涌峽道  | 1932-10-07 |
| 12888       | en_mismatch                 | Yu Chau Street                      | Yu Chow Street                      | 汝州街    | 汝州街    | 1927-11-25 |
| 13997       | en_mismatch                 | Tung Cheong Street                  | Tung Cheung Street                  | 東昌街    | 東昌街    | 1936-04-17 |
| 14555       | en_mismatch                 | Innovation And Technology Park Road | Innovation and Technology Park Road | 創科園路   | 創科園路   | 2025-02-28 |


---

## 5. Other issues

### Multiple declare events (4 name-only timelines)

Likely corrigendum/republication pairs (e.g. Lung Wo Road 2009 + 2011). **Fix:** verify gazette, keep one row or link as corrigendum. Low urgency unless years conflict.


| street               | declare dates          | event_ids                                |
| -------------------- | ---------------------- | ---------------------------------------- |
| Lung Wo Road|龍和道     | 2009-12-04, 2009-12-04 | 2009-12-04|GN7642|0; 2011-02-25|GN1314|0 |
| U Lam Terrace|儒林臺    | 2016-05-27, 2016-07-29 | 2016-05-27|GN3020|0; 2016-07-29|GN4332|0 |
| Hammer Hill Road|斧山道 | 2017-02-17, 2017-04-21 | 2017-02-17|GN875|0; 2017-04-21|GN2427|0  |
| Chui Kwan Drive|翠群徑  | 2024-06-14, 2024-08-16 | 2024-06-14|GN3412|0; 2024-08-16|GN4837|0 |


### Manual exclusions (`data/naming-date-exclusions.json`)

Intentional — eGazette "replace description" notices excluded from canonical year. Roads on this list show pending on map **by design**.

### What looks healthy

- No duplicate event IDs, future dates, or invalid roles
- No naming year drift between geojson and aggregates (for matched roads)
- Gazette URL lint passes

---

## 6. Priority manual review notes

### Queen's Road Central (`11804`)

Timeline is coherent; occupation rename correctly marked former_name. Post-1945 restore event may be missing.

**Geojson:** QUEEN'S ROAD CENTRAL / 皇后大道中
**Canonical naming:** 1874-02-14 · **Fix needed?** Optional — historical completeness


| date       | kind    | role         | EN                   | ZH    | previous EN          |
| ---------- | ------- | ------------ | -------------------- | ----- | -------------------- |
| 1841-05-01 | declare | former_name  | Main Street          |       |                      |
| 1842-02-01 | declare | built        | Queen's Road Central | 皇后大道中 |                      |
| 1842-03-22 | declare | former_name  | Queen's Road         | 皇后大道  |                      |
| 1874-02-14 | declare | current_name | Queen's Road Central | 皇后大道中 |                      |
| 1942-04-20 | rename  | former_name  | Nakameiji-dori       | 中明治通  | Queen's Road Central |


### Queen's Road East (`11805`)

Gap Road → occupation rename chain needs review.

**Geojson:** QUEEN'S ROAD EAST / 皇后大道東
**Canonical naming:** 1874-02-14 · **Fix needed?** Optional — historical cleanup


| date       | kind    | role         | EN                | ZH    | previous EN       |
| ---------- | ------- | ------------ | ----------------- | ----- | ----------------- |
| 1842-02-01 | declare | built        | Queen's Road East | 皇后大道東 |                   |
| 1842-03-22 | declare | former_name  | Queen's Road      | 皇后大道  |                   |
| 1874-02-14 | declare | current_name | Queen's Road East | 皇后大道東 |                   |
| 1930-01-01 | declare | former_name  | Gap Road          |       |                   |
| 1942-04-20 | rename  | former_name  | Higashimeiji-dori | 東明治通  | Queen's Road East |


### Queen's Road West (`11806`)

Same pattern as 11804.

**Geojson:** QUEEN'S ROAD WEST / 皇后大道西
**Canonical naming:** 1877-01-06 · **Fix needed?** Optional — historical completeness


| date       | kind    | role         | EN                | ZH    | previous EN       |
| ---------- | ------- | ------------ | ----------------- | ----- | ----------------- |
| 1842-02-01 | declare | built        | Queen's Road West | 皇后大道西 |                   |
| 1842-03-22 | declare | former_name  | Queen's Road      | 皇后大道  |                   |
| 1877-01-06 | declare | current_name | Queen's Road West | 皇后大道西 |                   |
| 1942-04-20 | rename  | former_name  | Nishimeiji-dori   | 西明治通  | Queen's Road West |


### Cheung Sha Wan Road (`10206`)

Coded year 1923 vs orphan 1927 — verify gazettes and delete orphan.

**Geojson:** CHEUNG SHA WAN ROAD / 長沙灣道
**Canonical naming:** 1923-09-28 · **Fix needed?** **Yes** — shadow duplicate with year conflict


| date       | kind    | role         | EN                  | ZH   | previous EN |
| ---------- | ------- | ------------ | ------------------- | ---- | ----------- |
| 1923-09-28 | declare | current_name | Cheung Sha Wan Road | 長沙灣道 |             |


### Shing Kai Road (`14363`)

Coded 2012 vs orphan 2017 — merge or delete orphan.

**Geojson:** SHING KAI ROAD / 承啟道
**Canonical naming:** 2012-09-28 · **Fix needed?** **Yes** — shadow duplicate with year conflict


| date       | kind    | role         | EN             | ZH  | previous EN |
| ---------- | ------- | ------------ | -------------- | --- | ----------- |
| 2012-09-28 | declare | current_name | Shing Kai Road | 承啟道 |             |


### Chui Kwan Drive (`13996`)

Orphan has extra 2024 events not on coded timeline.

**Geojson:** CHUI KWAN DRIVE / 翠群徑
**Canonical naming:** 1999-12-30 · **Fix needed?** **Yes** — shadow duplicate; merge events into coded row


| date       | kind    | role         | EN              | ZH  | previous EN |
| ---------- | ------- | ------------ | --------------- | --- | ----------- |
| 1999-12-30 | declare | current_name | Chui Kwan Drive | 翠群徑 |             |


### Conduit Road (`10326`)

Event 干諾道 is correct; geojson 干德道 is wrong.

**Geojson:** CONDUIT ROAD / 干德道
**Canonical naming:** 1907-04-12 · **Fix needed?** Optional — geojson label fix upstream


| date       | kind    | role         | EN           | ZH  | previous EN |
| ---------- | ------- | ------------ | ------------ | --- | ----------- |
| 1907-04-12 | declare | current_name | Conduit Road | 干諾道 |             |


### Hatton Road (`10666`)

Event 旭龢道 is correct; geojson 克頓道 is Kotewall Road.

**Geojson:** HATTON ROAD / 克頓道
**Canonical naming:** 1906-08-03 · **Fix needed?** Optional — geojson label fix upstream


| date       | kind    | role         | EN          | ZH  | previous EN |
| ---------- | ------- | ------------ | ----------- | --- | ----------- |
| 1906-08-03 | declare | current_name | Hatton Road | 旭龢道 |             |


---

## Appendix A: Coded timelines (616)

Flags: `ok` · `shadow` · `mismatch` · `chain-break` · `excluded`


| code  | EN                                  | ZH     | events | year | derivation           | flags                |
| ----- | ----------------------------------- | ------ | ------ | ---- | -------------------- | -------------------- |
| 10013 | Aldrich Street                      | 愛秩序街   | 1      | 1931 | declaration_earliest | ok                   |
| 10019 | Anderson Road                       | 安達臣道   | 1      | 1976 | declaration_earliest | ok                   |
| 10020 | Anhui Street                        | 安徽街    | 1      | 1935 | declaration_earliest | ok                   |
| 10025 | Apliu Street                        | 鴨寮街    | 1      | 1927 | declaration_earliest | ok                   |
| 10027 | Argyle Street                       | 亞皆老街   | 1      | 1926 | declaration_earliest | ok                   |
| 10029 | Arran Street                        | 鴉蘭街    | 1      | 1923 | declaration_earliest | ok                   |
| 10033 | Ash Street                          | 槐樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 10039 | Bailey Street                       | 庇利街    | 1      | 1935 | declaration_earliest | ok                   |
| 10041 | Baker Street                        | 必嘉街    | 1      | 1923 | declaration_earliest | ok                   |
| 10042 | Bank Street                         | 銀行街    | 1      | 1974 | declaration_earliest | ok                   |
| 10046 | Battery Street                      | 炮台街    | 1      | 1930 | declaration_earliest | ok                   |
| 10050 | Beach Road                          | 海灘道    | 1      | 1935 | declaration_earliest | ok                   |
| 10053 | Bedford Road                        | 必發道    | 1      | 1927 | declaration_earliest | ok                   |
| 10054 | Beech Street                        | 櫸樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 10061 | Berwick Street                      | 巴域街    | 1      | 1950 | declaration_earliest | ok                   |
| 10062 | Big Wave Bay Road                   | 大浪灣道   | 1      | 1935 | declaration_earliest | ok                   |
| 10064 | Black's Link                        | 布力徑    | 1      | 1904 | declaration_earliest | ok                   |
| 10065 | Blenheim Avenue                     | 白蘭軒道   | 1      | 1935 | declaration_earliest | ok                   |
| 10066 | Blue Pool Road                      | 藍塘道    | 1      | 1932 | declaration_earliest | ok                   |
| 10068 | Boat Street                         | 艇街     | 1      | 1931 | declaration_earliest | ok                   |
| 10074 | Borrett Road                        | 波老道    | 1      | 1936 | declaration_earliest | ok                   |
| 10075 | Boundary Street                     | 界限街    | 4      | 1926 | declaration_earliest | ok                   |
| 10078 | Bowring Street                      | 寶靈街    | 1      | 1909 | current_name_since   | ok                   |
| 10083 | Braga Circuit                       | 布力架道   | 1      | 1936 | declaration_earliest | mismatch             |
| 10086 | Brewin Path                         | 蒲魯賢徑   | 1      | 1919 | declaration_earliest | ok                   |
| 10087 | Briar Avenue                        | 比雅道    | 1      | 1940 | declaration_earliest | ok                   |
| 10093 | Broadwood Road                      | 樂活道    | 1      | 1915 | declaration_earliest | ok                   |
| 10094 | Broom Road                          | 蟠龍道    | 1      | 1940 | declaration_earliest | ok                   |
| 10095 | Brown Street                        | 寶現街    | 1      | 1941 | declaration_earliest | mismatch             |
| 10100 | Bute Street                         | 弼街     | 1      | 1923 | declaration_earliest | ok                   |
| 10111 | Camp Street                         | 營盤街    | 1      | 1934 | declaration_earliest | ok                   |
| 10112 | Canal Road East                     | 堅拿道東   | 1      | 1929 | declaration_earliest | ok                   |
| 10113 | Canal Road West                     | 堅拿道西   | 1      | 1929 | declaration_earliest | ok                   |
| 10115 | Canton Road                         | 廣東道    | 1      | 1909 | current_name_since   | ok                   |
| 10117 | Cape D'aguilar Road                 | 鶴咀道    | 1      | 1935 | declaration_earliest | ok                   |
| 10125 | Carpenter Road                      | 賈炳達道   | 1      | 1933 | declaration_earliest | ok                   |
| 10149 | Catchick Street                     | 吉席街    | 1      | 1909 | current_name_since   | ok                   |
| 10151 | Cedar Street                        | 柏樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 10161 | Changsha Street                     | 長沙街    | 1      | 1909 | current_name_since   | ok                   |
| 10165 | Chatham Path                        | 漆咸徑    | 1      | 1919 | declaration_earliest | ok                   |
| 10168 | Che Fong Street                     | 智芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 10171 | Chengtu Road                        | 成都道    | 1      | 1941 | declaration_earliest | ok                   |
| 10175 | Cheong Ming Street                  | 昌明街    | 1      | 1930 | declaration_earliest | ok                   |
| 10180 | Cheong Wan Road                     | 暢運道    | 1      | 2001 | declaration_earliest | ok                   |
| 10188 | Cheung Fat Street                   | 長發街    | 1      | 1934 | declaration_earliest | ok                   |
| 10193 | Cheung Hong Street                  | 長康街    | 1      | 1933 | declaration_earliest | ok                   |
| 10202 | Cheung Ning Street                  | 長寧街    | 1      | 1931 | declaration_earliest | ok                   |
| 10206 | Cheung Sha Wan Road                 | 長沙灣道   | 1      | 1923 | declaration_earliest | shadow               |
| 10215 | Cheung Wah Street                   | 昌華街    | 1      | 1934 | declaration_earliest | ok                   |
| 10221 | Cheung Yip Street                   | 祥業街    | 1      | 1979 | declaration_earliest | ok                   |
| 10227 | Chi Kiang Street                    | 浙江街    | 1      | 1935 | declaration_earliest | ok                   |
| 10229 | Chi Man Street                      | 治民街    | 1      | 1974 | declaration_earliest | ok                   |
| 10231 | Chi Wo Street                       | 致和街    | 1      | 1920 | declaration_earliest | mismatch             |
| 10249 | Ching Lin Terrace                   | 青蓮台    | 1      | 1926 | declaration_earliest | mismatch             |
| 10262 | Choi Ha Road                        | 彩霞道    | 1      | 1974 | declaration_earliest | ok                   |
| 10276 | Chuk Yuen Road                      | 竹園道    | 1      | 1935 | declaration_earliest | ok                   |
| 10277 | Chun Fai Road                       | 春暉道    | 1      | 1975 | declaration_earliest | ok                   |
| 10281 | Chun Tin Street                     | 春田街    | 1      | 1955 | declaration_earliest | ok                   |
| 10285 | Chun Yeung Street                   | 春秧街    | 1      | 1933 | declaration_earliest | ok                   |
| 10286 | Chun Yi Lane                        | 真義里    | 1      | 1974 | declaration_earliest | ok                   |
| 10295 | Chung Man Street                    | 忠民街    | 1      | 1974 | declaration_earliest | ok                   |
| 10297 | Chung On Street                     | 眾安街    | 1      | 1938 | declaration_earliest | ok                   |
| 10307 | Church Street                       | 教堂街    | 1      | 1931 | declaration_earliest | ok                   |
| 10315 | Cliff Road                          | 石壁道    | 1      | 1935 | declaration_earliest | ok                   |
| 10317 | Clovelly Path                       | 高化利徑   | 1      | 1919 | declaration_earliest | ok                   |
| 10318 | Club Street                         | 會所街    | 1      | 1935 | declaration_earliest | ok                   |
| 10320 | College Road                        | 書院道    | 1      | 1935 | declaration_earliest | ok                   |
| 10326 | Conduit Road                        | 干諾道    | 1      | 1907 | declaration_earliest | mismatch             |
| 10331 | Container Port Road                 | 貨櫃碼頭路  | 1      | 1974 | declaration_earliest | ok                   |
| 10334 | Convention Avenue                   | 會議道    | 1      | 1988 | declaration_earliest | ok                   |
| 10339 | Cornwall Street                     | 歌和老道   | 1      | 1929 | declaration_earliest | mismatch             |
| 10341 | Cotton Path                         | 棉花路    | 1      | 1931 | declaration_earliest | ok                   |
| 10351 | Cumberland Road                     | 金巴倫道   | 1      | 1929 | declaration_earliest | ok                   |
| 10364 | Dakota Drive                        | 德高道    | 1      | 1987 | declaration_earliest | ok                   |
| 10371 | Deep Water Bay Road                 | 深水灣道   | 1      | 1937 | declaration_earliest | ok                   |
| 10373 | Derby Road                          | 多庇道    | 1      | 1939 | declaration_earliest | mismatch             |
| 10376 | Devon Road                          | 德雲道    | 1      | 1929 | declaration_earliest | ok                   |
| 10382 | Dorset Crescent                     | 多實街    | 1      | 1929 | declaration_earliest | ok                   |
| 10385 | Dragon Road                         | 黃龍道    | 1      | 1930 | declaration_earliest | mismatch             |
| 10389 | Duke Street                         | 公爵街    | 1      | 1929 | declaration_earliest | ok                   |
| 10395 | Dyer Avenue                         | 戴亞街    | 1      | 1930 | declaration_earliest | ok                   |
| 10396 | Earl Street                         | 伯爵街    | 1      | 1935 | declaration_earliest | ok                   |
| 10400 | Eastern Hospital Road               | 東院道    | 1      | 1931 | declaration_earliest | ok                   |
| 10406 | Electric Road                       | 電氣道    | 1      | 1935 | declaration_earliest | ok                   |
| 10407 | Electric Street                     | 電氣街    | 1      | 1929 | declaration_earliest | ok                   |
| 10411 | Elm Street                          | 榆樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 10412 | Embankment Road                     | 基堤道    | 1      | 1929 | declaration_earliest | ok                   |
| 10413 | Ema Avenue                          | 艷馬道    | 1      | 1925 | declaration_earliest | mismatch             |
| 10414 | Essex Crescent                      | 雅息士道   | 1      | 1929 | declaration_earliest | ok                   |
| 10419 | Fa Yuen Street                      | 花園街    | 1      | 1924 | declaration_earliest | ok                   |
| 10420 | Factory Street                      | 工廠街    | 1      | 1931 | declaration_earliest | ok                   |
| 10469 | Fan Wa Street                       | 繁華街    | 2      | 1975 | current_name_since   | ok                   |
| 10471 | Farm Road                           | 農圃道    | 1      | 1933 | declaration_earliest | ok                   |
| 10473 | Fat Kwong Street                    | 佛光街    | 1      | 1926 | declaration_earliest | ok                   |
| 10475 | Fat Tseung Street                   | 發祥街    | 1      | 1934 | declaration_earliest | ok                   |
| 10477 | Fau Tsoi Street                     | 阜財街    | 1      | 1935 | declaration_earliest | ok                   |
| 10481 | Fenwick Pier Street                 | 分域碼頭街  | 1      | 1974 | declaration_earliest | ok                   |
| 10482 | Fenwick Street                      | 分域街    | 1      | 1929 | declaration_earliest | ok                   |
| 10483 | Ferry Street                        | 渡船街    | 1      | 1941 | declaration_earliest | ok                   |
| 10487 | Findlay Path                        | 芬梨徑    | 1      | 1915 | declaration_earliest | ok                   |
| 10488 | Findlay Road                        | 芬梨道    | 1      | 1915 | declaration_earliest | ok                   |
| 10490 | Fir Street                          | 松樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 10495 | Fleming Road                        | 菲林明道   | 1      | 1929 | declaration_earliest | shadow               |
| 10496 | Flint Road                          | 芙蓮道    | 1      | 1939 | declaration_earliest | mismatch             |
| 10510 | Forfar Road                         | 科發道    | 1      | 1933 | declaration_earliest | ok                   |
| 10511 | Fort Street                         | 堡壘街    | 1      | 1933 | declaration_earliest | ok                   |
| 10528 | Fu Shin Street                      | 富善街    | 1      | 1930 | declaration_earliest | ok                   |
| 10548 | Fuk Kwan Avenue                     | 福群道    | 1      | 1931 | declaration_earliest | ok                   |
| 10550 | Fuk Lo Tsun Road                    | 福老村道   | 1      | 1933 | declaration_earliest | mismatch             |
| 10556 | Fuk Shun Street                     | 福順街    | 1      | 1986 | declaration_earliest | ok                   |
| 10559 | Fuk Tsun Street                     | 福全街    | 1      | 1927 | declaration_earliest | ok                   |
| 10560 | Fuk Wa Street                       | 福華街    | 2      | 1930 | current_name_since   | ok                   |
| 10562 | Fuk Wing Street                     | 福榮街    | 2      | 1930 | current_name_since   | ok                   |
| 10564 | Fuk Yuen Street                     | 福元街    | 1      | 1931 | declaration_earliest | ok                   |
| 10566 | Fung Cheung Road                    | 鳳翔路    | 1      | 1977 | declaration_earliest | ok                   |
| 10569 | Fung Heung Street                   | 鳳香街    | 1      | 1981 | declaration_earliest | ok                   |
| 10575 | Fung Mo Street                      | 鳳舞街    | 1      | 1963 | declaration_earliest | ok                   |
| 10595 | Fung Yuen Road                      | 鳳園路    | 1      | 1970 | declaration_earliest | ok                   |
| 10599 | Gascoigne Road                      | 加士居道   | 1      | 1905 | declaration_earliest | ok                   |
| 10603 | Gilman Street                       | 機利文街   | 1      | 1974 | declaration_earliest | ok                   |
| 10606 | Glass Street                        | 玻璃街    | 1      | 1931 | declaration_earliest | ok                   |
| 10609 | Gloucester Road                     | 告士打道   | 1      | 1929 | declaration_earliest | ok                   |
| 10614 | Good Shepherd Street                | 牧愛街    | 1      | 1975 | declaration_earliest | ok                   |
| 10620 | Grampian Road                       | 嘉林邊道   | 1      | 1932 | declaration_earliest | ok                   |
| 10625 | Green Lane                          | 箕璉坊    | 1      | 1940 | declaration_earliest | ok                   |
| 10632 | Ha Heung Road                       | 下鄉道    | 1      | 1926 | declaration_earliest | ok                   |
| 10635 | Hai Tan Street                      | 海壇街    | 1      | 1927 | declaration_earliest | ok                   |
| 10637 | Haiphong Road                       | 海防道    | 1      | 1909 | current_name_since   | ok                   |
| 10639 | Hak Po Street                       | 黑布街    | 1      | 1924 | declaration_earliest | ok                   |
| 10656 | Hankow Road                         | 漢口道    | 1      | 1909 | current_name_since   | ok                   |
| 10657 | Hanoi Road                          | 河內道    | 1      | 1909 | current_name_since   | ok                   |
| 10662 | Harbour View Street                 | 港景街    | 1      | 1974 | declaration_earliest | ok                   |
| 10665 | Hart Avenue                         | 赫德道    | 1      | 1909 | current_name_since   | ok                   |
| 10666 | Hatton Road                         | 旭龢道    | 1      | 1906 | declaration_earliest | mismatch             |
| 10669 | Hau Man Street                      | 孝民街    | 1      | 1975 | current_name_since   | ok                   |
| 10673 | Hau Wong Road                       | 侯王道    | 1      | 1933 | declaration_earliest | ok                   |
| 10675 | Haven Street                        | 希雲街    | 1      | 1931 | declaration_earliest | ok                   |
| 10676 | Hawthorn Road                       | 荷塘道    | 1      | 1940 | declaration_earliest | ok                   |
| 10686 | Hei Yuen Street                     | 戲院街    | 1      | 1936 | declaration_earliest | ok                   |
| 10689 | Hennessy Road                       | 軒尼詩道   | 1      | 1929 | declaration_earliest | ok                   |
| 10698 | Heung Yip Road                      | 香葉道    | 1      | 1972 | declaration_earliest | ok                   |
| 10704 | Hill Road                           | 山道     | 2      | 1936 | current_name_since   | ok                   |
| 10709 | Hill Wood Road                      | 山林道    | 1      | 1933 | declaration_earliest | mismatch             |
| 10717 | Hing Fat Street                     | 興發街    | 1      | 1921 | declaration_earliest | ok                   |
| 10718 | Hing Fong Road                      | 興芳路    | 1      | 1974 | declaration_earliest | ok                   |
| 10726 | Hing Man Street                     | 興民街    | 1      | 1937 | declaration_earliest | ok                   |
| 10729 | Hing Shing Road                     | 興盛路    | 1      | 1974 | declaration_earliest | ok                   |
| 10731 | Hing Wah Street                     | 興華街    | 1      | 1934 | declaration_earliest | ok                   |
| 10733 | Hing Wo Street                      | 興和街    | 1      | 1974 | declaration_earliest | ok                   |
| 10750 | Ho King Street                      | 好景街    | 1      | 1932 | declaration_earliest | ok                   |
| 10755 | Ho Man Tin Hill Road                | 何文田山道  | 1      | 1930 | declaration_earliest | ok                   |
| 10756 | Ho Man Tin Street                   | 何文田街   | 1      | 1929 | declaration_earliest | ok                   |
| 10761 | Ho Tung Road                        | 何東道    | 1      | 1939 | declaration_earliest | ok                   |
| 10764 | Hoi An Street                       | 海晏街    | 1      | 1937 | declaration_earliest | ok                   |
| 10769 | Hoi Foo Street                      | 海富街    | 1      | 1937 | declaration_earliest | ok                   |
| 10779 | Hoi Ning Street                     | 海寧街    | 1      | 1937 | declaration_earliest | ok                   |
| 10782 | Hoi Ping Road                       | 開平道    | 1      | 1936 | declaration_earliest | ok                   |
| 10788 | Hoi Yuen Road                       | 開源道    | 1      | 1957 | declaration_earliest | ok                   |
| 10797 | Holly Road                          | 冬青道    | 1      | 1940 | declaration_earliest | ok                   |
| 10799 | Holy Cross Path                     | 聖十字路   | 1      | 1937 | declaration_earliest | mismatch             |
| 10800 | Homestead Road                      | 堪仕達道   | 1      | 1939 | declaration_earliest | ok                   |
| 10802 | Hong Chong Road                     | 康莊道    | 1      | 1999 | declaration_earliest | ok                   |
| 10856 | Hospital Path                       | 醫院徑    | 1      | 1935 | declaration_earliest | ok                   |
| 10865 | Hung Hing Road                      | 鴻興道    | 1      | 1974 | declaration_earliest | ok                   |
| 10867 | Hung Hom South Road                 | 紅磡南道   | 1      | 1989 | declaration_earliest | ok                   |
| 10873 | Hung Shing Street                   | 洪聖街    | 1      | 1932 | declaration_earliest | ok                   |
| 10879 | Hysan Avenue                        | 希慎道    | 1      | 1934 | current_name_since   | ok                   |
| 10881 | Ichang Street                       | 宜昌街    | 1      | 1935 | declaration_earliest | ok                   |
| 10888 | Island Road                         | 香島道    | 1      | 1932 | declaration_earliest | ok                   |
| 10889 | Ivy Street                          | 埃華街    | 1      | 1974 | declaration_earliest | ok                   |
| 10892 | Jaffé Road                          | 謝斐道    | 1      | 1931 | declaration_earliest | mismatch             |
| 10897 | Java Road                           | 爪哇路    | 1      | 1933 | declaration_earliest | mismatch             |
| 10900 | Johnston Road                       | 莊士敦道   | 1      | 1929 | declaration_earliest | ok                   |
| 10902 | Jones Street                        | 瓊斯街    | 1      | 1915 | declaration_earliest | mismatch             |
| 10904 | Jordan Road                         | 佐敦道    | 1      | 1909 | current_name_since   | ok                   |
| 10908 | Julia Avenue                        | 棗梨雅道   | 1      | 1925 | declaration_earliest | ok                   |
| 10909 | Junction Road                       | 聯合道    | 1      | 1933 | declaration_earliest | ok                   |
| 10924 | Kadoorie Avenue                     | 嘉道理道   | 1      | 1936 | declaration_earliest | ok                   |
| 10955 | Kam Hong Street                     | 琴行街    | 1      | 1937 | declaration_earliest | ok                   |
| 10966 | Kansu Street                        | 甘肅街    | 1      | 1909 | current_name_since   | ok                   |
| 10978 | Kei Yip Lane                        | 基業里    | 1      | 1989 | declaration_earliest | ok                   |
| 10984 | Kent Road                           | 根德道    | 1      | 1929 | declaration_earliest | ok                   |
| 10989 | Ki Lung Street                      | 基隆街    | 1      | 1927 | declaration_earliest | ok                   |
| 10990 | Kiang Hsi Street                    | 江西街    | 1      | 1935 | declaration_earliest | ok                   |
| 10991 | Kiang Su Street                     | 江蘇街    | 1      | 1935 | declaration_earliest | ok                   |
| 11022 | King Fuk Street                     | 景福街    | 1      | 1961 | declaration_earliest | ok                   |
| 11025 | King Kwong Street                   | 景光街    | 1      | 1930 | declaration_earliest | ok                   |
| 11027 | King Ming Road                      | 景明道    | 1      | 1931 | declaration_earliest | ok                   |
| 11038 | King's Road                         | 英皇道    | 1      | 1935 | declaration_earliest | ok                   |
| 11041 | Kiu Kiang Street                    | 九江街    | 1      | 1932 | declaration_earliest | ok                   |
| 11048 | Knight Street                       | 勳德街    | 1      | 1929 | declaration_earliest | mismatch             |
| 11052 | Ko Fong Street                      | 高芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 11056 | Kok Cheung Street                   | 角祥街    | 1      | 1974 | declaration_earliest | ok                   |
| 11057 | Kom Tsun Street                     | 甘泉街    | 1      | 1935 | declaration_earliest | ok                   |
| 11062 | Kotewall Road                       | 旭龢道    | 1      | 1928 | declaration_earliest | ok                   |
| 11063 | Kowloon City Road                   | 九龍城道   | 2      | 1926 | declaration_earliest | ok                   |
| 11065 | Kowloon Road                        | 九龍道    | 1      | 1934 | declaration_earliest | ok                   |
| 11070 | Kuk Ting Street                     | 穀亭街    | 1      | 1935 | declaration_earliest | mismatch             |
| 11074 | Kung Yip Street                     | 工業街    | 1      | 1974 | declaration_earliest | ok                   |
| 11081 | Kwai Fong Street                    | 桂芳街    | 1      | 1930 | declaration_earliest | ok                   |
| 11082 | Kwai Foo Road                       | 葵富路    | 1      | 1974 | declaration_earliest | ok                   |
| 11087 | Kwai Heung Street                   | 桂香街    | 3      | 1919 | current_name_since   | ok                   |
| 11088 | Kwai Hing Road                      | 葵興路    | 1      | 1974 | declaration_earliest | ok                   |
| 11090 | Kwai Hop Street                     | 葵合街    | 1      | 1974 | declaration_earliest | ok                   |
| 11095 | Kwai Shing Circuit                  | 葵盛圍    | 1      | 1974 | declaration_earliest | ok                   |
| 11105 | Kwai Yan Road                       | 葵仁路    | 1      | 1982 | declaration_earliest | ok                   |
| 11107 | Kwai Yip Street                     | 葵葉街    | 1      | 1974 | declaration_earliest | ok                   |
| 11110 | Kwan Yick Street                    | 均益街    | 1      | 1925 | declaration_earliest | ok                   |
| 11111 | Kwei Chow Street                    | 貴州街    | 1      | 1935 | declaration_earliest | ok                   |
| 11118 | Kwong Cheung Street                 | 光昌街    | 1      | 1935 | declaration_earliest | ok                   |
| 11128 | Kwong Hon Terrace                   | 光漢台    | 1      | 1920 | declaration_earliest | mismatch             |
| 11129 | Kwong Lee Road                      | 廣利道    | 1      | 1934 | declaration_earliest | ok                   |
| 11130 | Kwong Ming Street                   | 光明街    | 1      | 1925 | declaration_earliest | ok                   |
| 11131 | Kwong Shing Street                  | 廣成街    | 1      | 1935 | declaration_earliest | ok                   |
| 11133 | Kwong Wa Street                     | 廣華街    | 1      | 1923 | declaration_earliest | ok                   |
| 11141 | Kwun Chung Street                   | 官涌街    | 1      | 1932 | declaration_earliest | ok                   |
| 11149 | Lai Chi Kok Road                    | 荔枝角道   | 1      | 1978 | declaration_earliest | ok                   |
| 11153 | Lai Fong Street                     | 禮芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 11184 | Lambeth Walk                        | 琳寶徑    | 1      | 1975 | declaration_earliest | ok                   |
| 11187 | Lancashire Road                     | 蘭開夏道   | 1      | 1939 | declaration_earliest | ok                   |
| 11190 | Larch Street                        | 洋松街    | 1      | 1927 | declaration_earliest | ok                   |
| 11193 | Lau Li Street                       | 琉璃街    | 1      | 1926 | declaration_earliest | ok                   |
| 11195 | Lau Sin Street                      | 留仙街    | 1      | 1926 | declaration_earliest | ok                   |
| 11205 | Lee Tung Street                     | 利東街    | 1      | 1923 | declaration_earliest | ok                   |
| 11221 | Li Chit Street                      | 李節街    | 1      | 1920 | declaration_earliest | ok                   |
| 11222 | Li Kwan Avenue                      | 利群道    | 1      | 1931 | declaration_earliest | ok                   |
| 11231 | Lily Street                         | 蓮花街    | 1      | 1935 | declaration_earliest | ok                   |
| 11233 | Lime Street                         | 菩提街    | 1      | 1927 | declaration_earliest | ok                   |
| 11234 | Lin Fa Kung Street East             | 蓮花宮東街  | 1      | 1935 | declaration_earliest | ok                   |
| 11235 | Lin Fa Kung Street West             | 蓮花宮西街  | 1      | 1935 | declaration_earliest | ok                   |
| 11238 | Lin Tak Road                        | 連德道    | 1      | 1987 | declaration_earliest | ok                   |
| 11239 | Lincoln Road                        | 林肯道    | 1      | 1929 | declaration_earliest | ok                   |
| 11240 | Link Road                           | 連合道    | 1      | 1931 | declaration_earliest | mismatch             |
| 11241 | Lion Rock Road                      | 獅子石街   | 1      | 1933 | declaration_earliest | mismatch             |
| 11244 | Lloyd Path                          | 雷丹彌徑   | 1      | 1935 | declaration_earliest | ok                   |
| 11245 | Lo Lung Hang Street                 | 老龍坑街   | 1      | 1923 | declaration_earliest | ok                   |
| 11250 | Lockhart Road                       | 駱克道    | 1      | 1929 | declaration_earliest | ok                   |
| 11263 | Lok Shan Road                       | 落山道    | 1      | 1931 | declaration_earliest | ok                   |
| 11272 | Lok Yeung Street                    | 洛陽街    | 1      | 1941 | declaration_earliest | ok                   |
| 11286 | Luard Road                          | 盧押道    | 1      | 1929 | declaration_earliest | ok                   |
| 11298 | Lugard Road                         | 盧吉道    | 1      | 1915 | declaration_earliest | ok                   |
| 11300 | Luk Hop Street                      | 六合街    | 1      | 1961 | declaration_earliest | ok                   |
| 11307 | Lun Hing Street                     | 聯興街    | 1      | 1930 | declaration_earliest | ok                   |
| 11308 | Lung Cheung Road                    | 龍翔道    | 1      | 1960 | declaration_earliest | ok                   |
| 11314 | Lung King Street                    | 龍景街    | 1      | 1974 | declaration_earliest | ok                   |
| 11315 | Lung Kong Road                      | 龍崗道    | 1      | 1933 | declaration_earliest | ok                   |
| 11319 | Lung Ping Road                      | 龍坪道    | 1      | 1985 | declaration_earliest | ok                   |
| 11323 | Lung Tak Street                     | 隆德街    | 1      | 1974 | declaration_earliest | ok                   |
| 11337 | Ma Chai Hang Road                   | 馬仔坑道   | 1      | 1976 | declaration_earliest | ok                   |
| 11339 | Ma Hang Chung Road                  | 馬坑涌道   | 1      | 1926 | declaration_earliest | ok                   |
| 11349 | Ma Tau Chung Road                   | 碼頭涌道   | 1      | 1926 | declaration_earliest | mismatch             |
| 11350 | Ma Tau Kok Road                     | 碼頭角道   | 1      | 1926 | declaration_earliest | mismatch             |
| 11353 | Ma Tin Road                         | 馬田路    | 1      | 1978 | declaration_earliest | ok                   |
| 11364 | Malacca Street                      | 馬來街    | 1      | 1929 | declaration_earliest | ok                   |
| 11366 | Man Cheong Street                   | 文昌街    | 1      | 1974 | declaration_earliest | ok                   |
| 11395 | Maple Street                        | 楓樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 11396 | Marble Road                         | 馬寶道    | 1      | 1937 | declaration_earliest | ok                   |
| 11400 | Market Street                       | 街市街    | 1      | 1938 | declaration_earliest | ok                   |
| 11401 | Marsh Road                          | 馬師道    | 1      | 1929 | declaration_earliest | ok                   |
| 11405 | Mau Lam Street                      | 茂林街    | 1      | 1922 | declaration_earliest | ok                   |
| 11407 | May Road                            | 梅道     | 1      | 1907 | declaration_earliest | ok                   |
| 11410 | Mei Fong Street                     | 美芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 11413 | Mei Lai Road                        | 美荔道    | 1      | 1975 | declaration_earliest | ok                   |
| 11415 | Mei Tin Road                        | 美田路    | 1      | 1984 | declaration_earliest | ok                   |
| 11423 | Middle Gap Road                     | 中峽道    | 1      | 1925 | declaration_earliest | ok                   |
| 11427 | Min Fat Street                      | 綿發街    | 1      | 1930 | declaration_earliest | ok                   |
| 11429 | Min Street                          | 閩街     | 1      | 1930 | declaration_earliest | ok                   |
| 11430 | Minden Avenue                       | 棉登徑    | 1      | 1923 | declaration_earliest | ok                   |
| 11453 | Mok Cheong Street                   | 木廠街    | 1      | 1926 | declaration_earliest | ok                   |
| 11454 | Mong Kok Road                       | 旺角道    | 1      | 1923 | declaration_earliest | ok                   |
| 11455 | Mong Lung Street                    | 望隆街    | 1      | 1931 | declaration_earliest | ok                   |
| 11459 | Moorsom Drive                       | 睦誠徑    | 1      | 1974 | declaration_earliest | ok                   |
| 11470 | Mount Cameron Road                  | 金馬麟山道  | 1      | 1926 | declaration_earliest | ok                   |
| 11472 | Mount Davis Road                    | 摩星嶺道   | 1      | 1924 | declaration_earliest | ok                   |
| 11477 | Mui Fong Street                     | 梅芳街    | 3      | 1919 | current_name_since   | ok                   |
| 11487 | Nam Cheong Street                   | 南昌街    | 1      | 1961 | declaration_earliest | ok                   |
| 11490 | Nam Kok Road                        | 南角路    | 1      | 1933 | declaration_earliest | mismatch             |
| 11495 | Nam On Street                       | 南安街    | 1      | 1930 | declaration_earliest | ok                   |
| 11498 | Nam Shing Street                    | 南盛街    | 1      | 1930 | declaration_earliest | ok                   |
| 11502 | Nanking Street                      | 南京街    | 1      | 1909 | current_name_since   | ok                   |
| 11504 | Nathan Road                         | 彌敦道    | 1      | 1909 | current_name_since   | ok                   |
| 11516 | Nga Tsin Long Road                  | 衙前塱道   | 1      | 1933 | declaration_earliest | ok                   |
| 11517 | Nga Tsin Wai Road                   | 衙前圍道   | 1      | 1926 | declaration_earliest | ok                   |
| 11525 | Ngan Mok Street                     | 銀幕街    | 1      | 1926 | declaration_earliest | ok                   |
| 11545 | Ning Po Street                      | 寧波街    | 1      | 1909 | current_name_since   | ok                   |
| 11549 | Norfolk Road                        | 羅福道    | 1      | 1929 | declaration_earliest | ok                   |
| 11550 | North Point Road                    | 北角路    | 1      | 1933 | declaration_earliest | mismatch             |
| 11553 | North View Street                   | 北景街    | 1      | 1933 | declaration_earliest | ok                   |
| 11556 | Nullah Road                         | 水渠道    | 1      | 1930 | declaration_earliest | ok                   |
| 11557 | O'brien Road                        | 柯布連道   | 1      | 1929 | declaration_earliest | ok                   |
| 11563 | Ocean Park Road                     | 海洋公園道  | 1      | 1975 | declaration_earliest | ok                   |
| 11566 | Oil Street                          | 油街     | 1      | 1931 | declaration_earliest | ok                   |
| 11570 | Olympic Avenue                      | 世運道    | 1      | 1964 | declaration_earliest | ok                   |
| 11576 | On Fu Road                          | 安富道    | 1      | 1930 | declaration_earliest | ok                   |
| 11588 | On Lok Lane                         | 安樂里    | 1      | 1930 | declaration_earliest | ok                   |
| 11608 | On Tin Street                       | 安田街    | 1      | 2003 | current_name_since   | ok                   |
| 11610 | On Wah Street                       | 安華街    | 1      | 1979 | declaration_earliest | ok                   |
| 11611 | On Wan Road                         | 安運道    | 1      | 2001 | declaration_earliest | ok                   |
| 11616 | On Yip Street                       | 安業街    | 1      | 1974 | declaration_earliest | ok                   |
| 11620 | Ormsby Street                       | 安庶庇道   | 1      | 1941 | declaration_earliest | mismatch             |
| 11627 | Pak Hoi Street                      | 北海街    | 1      | 1909 | current_name_since   | ok                   |
| 11634 | Pak Po Street                       | 白布街    | 1      | 1932 | declaration_earliest | ok                   |
| 11646 | Pak Shing Street                    | 北盛街    | 1      | 1930 | declaration_earliest | ok                   |
| 11647 | Pak Tai Street                      | 北帝街    | 1      | 1926 | declaration_earliest | ok                   |
| 11666 | Pau Chung Street                    | 炮仗街    | 1      | 1926 | declaration_earliest | ok                   |
| 11676 | Peking Road                         | 北京道    | 1      | 1909 | current_name_since   | ok                   |
| 11681 | Pentland Street                     | 品蘭街    | 1      | 1935 | declaration_earliest | ok                   |
| 11683 | Percival Street                     | 波斯富街   | 1      | 1929 | declaration_earliest | ok                   |
| 11687 | Pier Road                           | 統一碼頭道  | 1      | 1974 | declaration_earliest | ok                   |
| 11693 | Pilkem Street                       | 庇利金街   | 1      | 1923 | declaration_earliest | ok                   |
| 11694 | Pine Street                         | 杉樹街    | 1      | 1927 | declaration_earliest | ok                   |
| 11695 | Pine Tree Hill Road                 | 松山道    | 1      | 1933 | declaration_earliest | ok                   |
| 11707 | Ping Lai Path                       | 屏麗徑    | 1      | 1974 | declaration_earliest | ok                   |
| 11708 | Ping Lan Street                     | 平瀾街    | 1      | 1932 | declaration_earliest | ok                   |
| 11724 | Playing Field Road                  | 運動場道   | 1      | 1932 | declaration_earliest | ok                   |
| 11736 | Po Kong Lane                        | 蒲崗里    | 1      | 1975 | declaration_earliest | ok                   |
| 11749 | Po On Road                          | 普安道    | 1      | 1934 | declaration_earliest | mismatch             |
| 11750 | Po Shan Road                        | 寶珊道    | 1      | 1928 | declaration_earliest | ok                   |
| 11751 | Po Shin Street                      | 普善街    | 1      | 1930 | declaration_earliest | ok                   |
| 11762 | Po Yee Street                       | 普義街    | 1      | 1935 | declaration_earliest | ok                   |
| 11767 | Pokfulam Reservoir Road             | 薄扶林水塘道 | 1      | 1937 | declaration_earliest | mismatch             |
| 11776 | Poplar Street                       | 白楊街    | 1      | 1927 | declaration_earliest | ok                   |
| 11777 | Portland Street                     | 砵蘭街    | 1      | 1927 | declaration_earliest | ok                   |
| 11781 | Power Street                        | 大強街    | 1      | 1931 | declaration_earliest | ok                   |
| 11782 | Prat Avenue                         | 勃利亞街   | 1      | 1921 | declaration_earliest | mismatch             |
| 11783 | Pratas Street                       | 東沙島街   | 1      | 1934 | declaration_earliest | ok                   |
| 11787 | Prince Edward Road East             | 太子道東   | 3      | 1979 | declaration_earliest | ok                   |
| 11788 | Prince Edward Road                  | 太子道    | 2      | 1924 | current_name_since   | mismatch             |
| 11789 | Prince's Terrace                    | 太子台    | 1      | 1923 | declaration_earliest | ok                   |
| 11791 | Princess Margaret Road              | 公主道    | 1      | 1966 | declaration_earliest | ok                   |
| 11804 | Nakameiji-dori                      | 中明治通   | 5      | 1874 | declaration_earliest | mismatch             |
| 11805 | Higashimeiji-dori                   | 東明治通   | 5      | 1874 | declaration_earliest | mismatch,chain-break |
| 11806 | Nishimeiji-dori                     | 西明治通   | 4      | 1877 | declaration_earliest | mismatch             |
| 11807 | Queensway                           | 金鐘道    | 3      | 1968 | declaration_earliest | ok                   |
| 11810 | Reclamation Street                  | 新填地街   | 1      | 1930 | declaration_earliest | ok                   |
| 11815 | Repulse Bay Road                    | 淺水灣道   | 1      | 1932 | declaration_earliest | ok                   |
| 11818 | Rock Hill Street                    | 石山街    | 1      | 1920 | declaration_earliest | ok                   |
| 11827 | Rumsey Street                       | 林士街    | 1      | 1905 | declaration_earliest | ok                   |
| 11829 | Rutland Quadrant                    | 律倫街    | 1      | 1929 | declaration_earliest | ok                   |
| 11831 | Sa Po Road                          | 沙埔道    | 1      | 1926 | declaration_earliest | mismatch             |
| 11840 | Sai Kung Road                       | 西貢路    | 1      | 1922 | declaration_earliest | mismatch             |
| 11852 | Sai Street                          | 西街     | 1      | 1909 | current_name_since   | ok                   |
| 11853 | Sai Tai Street                      | 西堤街    | 1      | 1935 | declaration_earliest | ok                   |
| 11856 | Sai Wan Ho Street                   | 西灣河街   | 1      | 1926 | declaration_earliest | ok                   |
| 11861 | Sai Yee Street                      | 洗衣街    | 1      | 1924 | declaration_earliest | ok                   |
| 11868 | Saigon Street                       | 西貢街    | 1      | 1909 | current_name_since   | ok                   |
| 11881 | San Francisco Path                  | 舊金山徑   | 1      | 1925 | declaration_earliest | ok                   |
| 11896 | San Lau Street                      | 新柳街    | 2      | 1926 | declaration_earliest | ok                   |
| 11907 | San Shan Road                       | 新山道    | 1      | 1926 | declaration_earliest | ok                   |
| 11908 | San Shi Street                      | 新市街    | 1      | 1932 | declaration_earliest | ok                   |
| 11916 | San Wai Street                      | 新圍街    | 1      | 1926 | declaration_earliest | ok                   |
| 11923 | Sassoon Road                        | 沙宣道    | 1      | 1924 | declaration_earliest | ok                   |
| 11924 | Sau Chuk Yuen Road                  | 秀竹園道   | 1      | 1935 | declaration_earliest | ok                   |
| 11934 | Scenic Villa Drive                  | 美景徑    | 1      | 1974 | declaration_earliest | ok                   |
| 11937 | Schooner Street                     | 帆船街    | 1      | 1916 | declaration_earliest | mismatch             |
| 11951 | Severn Road                         | 施勳道    | 1      | 1921 | declaration_earliest | ok                   |
| 11978 | Shan Kwong Road                     | 山光道    | 1      | 1930 | declaration_earliest | ok                   |
| 11981 | Shan Ming Street                    | 山明街    | 1      | 1932 | declaration_earliest | ok                   |
| 11984 | Shanghai Street                     | 上海街    | 1      | 1909 | current_name_since   | ok                   |
| 11985 | Shansi Street                       | 山西街    | 1      | 1935 | declaration_earliest | ok                   |
| 11986 | Shantung Street                     | 山東街    | 1      | 1909 | current_name_since   | ok                   |
| 11991 | Shaukiwan Road                      | 筲箕灣道   | 1      | 1940 | current_name_since   | mismatch             |
| 11995 | Shek Kip Mei Street                 | 石硤尾街   | 1      | 1926 | declaration_earliest | ok                   |
| 11996 | Shek Ku Lung Road                   | 石古壟道   | 1      | 1926 | declaration_earliest | mismatch             |
| 12003 | Shek Man Path                       | 石文徑    | 1      | 1974 | declaration_earliest | ok                   |
| 12006 | Shek O Road                         | 石澳道    | 1      | 1935 | declaration_earliest | ok                   |
| 12015 | Shek Tong Street                    | 石塘街    | 1      | 1926 | declaration_earliest | ok                   |
| 12020 | Shek Ying Path                      | 石英徑    | 1      | 1974 | declaration_earliest | ok                   |
| 12025 | Sheung Foo Street                   | 常富街    | 1      | 1967 | declaration_earliest | ok                   |
| 12029 | Sheung Heung Road                   | 上鄉道    | 2      | 1926 | declaration_earliest | ok                   |
| 12045 | Shing Fong Street                   | 盛芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 12046 | Shing Fuk Street                    | 盛福街    | 1      | 1974 | declaration_earliest | ok                   |
| 12055 | Shing Ping Street                   | 昇平街    | 1      | 1930 | declaration_earliest | ok                   |
| 12068 | Siu Wo Street                       | 兆和街    | 1      | 1940 | declaration_earliest | mismatch             |
| 12069 | Short Street                        | 述德街    | 1      | 1935 | declaration_earliest | ok                   |
| 12071 | Shouson Hill Road East              | 壽臣山道東  | 1      | 1940 | declaration_earliest | ok                   |
| 12072 | Shouson Hill Road West              | 壽臣山道西  | 1      | 1940 | declaration_earliest | ok                   |
| 12074 | Shu Kuk Street                      | 書局街    | 1      | 1937 | declaration_earliest | ok                   |
| 12083 | Shum Wan Road                       | 深灣道    | 1      | 1969 | declaration_earliest | ok                   |
| 12086 | Shun Fong Street                    | 信芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 12093 | Shun Ning Road                      | 順寧道    | 1      | 1934 | declaration_earliest | ok                   |
| 12102 | Shung Tak Street                    | 崇德街    | 1      | 1930 | declaration_earliest | ok                   |
| 12104 | Shung Wah Street                    | 崇華街    | 1      | 2000 | declaration_earliest | ok                   |
| 12106 | Shung Yan Road                      | 崇仁道    | 1      | 1935 | declaration_earliest | mismatch             |
| 12107 | Shung Yiu Street                    | 崇耀街    | 1      | 1980 | declaration_earliest | ok                   |
| 12111 | Sin Fat Road                        | 茜發道    | 1      | 1989 | declaration_earliest | ok                   |
| 12115 | Siu Cheung Fong                     | 兆祥坊    | 1      | 1924 | declaration_earliest | ok                   |
| 12123 | Soares Avenue                       | 梭椏道    | 1      | 1925 | declaration_earliest | ok                   |
| 12127 | Somerset Road                       | 森麻實道   | 1      | 1929 | declaration_earliest | ok                   |
| 12129 | South Bay Road                      | 南灣道    | 1      | 1935 | declaration_earliest | ok                   |
| 12132 | South Wall Road                     | 城南道    | 1      | 1932 | declaration_earliest | ok                   |
| 12134 | Sports Road                         | 體育路    | 1      | 1939 | declaration_earliest | mismatch             |
| 12145 | Stafford Road                       | 施他佛道   | 1      | 1929 | declaration_earliest | ok                   |
| 12147 | Stanley Beach Road                  | 赤柱灘道   | 1      | 1933 | declaration_earliest | ok                   |
| 12156 | Stanley Village Road                | 赤柱村道   | 1      | 1933 | declaration_earliest | ok                   |
| 12161 | Stewart Road                        | 史釗域道   | 1      | 1929 | declaration_earliest | ok                   |
| 12163 | Stirling Road                       | 士他令道   | 1      | 1933 | declaration_earliest | ok                   |
| 12165 | Stubbs Road                         | 司徒拔道   | 1      | 1923 | declaration_earliest | ok                   |
| 12166 | Suffolk Road                        | 沙福道    | 1      | 1929 | declaration_earliest | ok                   |
| 12167 | Sugar Street                        | 糖街     | 1      | 1931 | declaration_earliest | ok                   |
| 12172 | Sui On Street                       | 瑞安街    | 1      | 1930 | declaration_earliest | ok                   |
| 12180 | Sun Wui Road                        | 新會路    | 1      | 1933 | declaration_earliest | mismatch             |
| 12181 | Sun Yip Street                      | 新業街    | 1      | 1974 | declaration_earliest | ok                   |
| 12189 | Sung Wong Toi Road                  | 宋皇臺道   | 2      | 1926 | declaration_earliest | ok                   |
| 12193 | Surrey Lane                         | 舒梨里    | 1      | 1929 | declaration_earliest | mismatch             |
| 12199 | Sze Chuen Street                    | 四川街    | 1      | 1935 | declaration_earliest | ok                   |
| 12200 | Sze Mei Street                      | 四美街    | 1      | 1961 | declaration_earliest | ok                   |
| 12204 | Tai Cheong Street                   | 太祥街    | 1      | 1909 | declaration_earliest | ok                   |
| 12205 | Tai Ching Street                    | 大政街    | 1      | 1974 | declaration_earliest | ok                   |
| 12210 | Tai Foo Street                      | 太富街    | 1      | 1909 | declaration_earliest | ok                   |
| 12212 | Tai Fung Street                     | 泰豐街    | 1      | 1935 | declaration_earliest | ok                   |
| 12216 | Tai Hang Road                       | 大坑道    | 1      | 1931 | declaration_earliest | ok                   |
| 12221 | Tai Ho Road                         | 大河道    | 1      | 1987 | declaration_earliest | ok                   |
| 12223 | Tai Hong Street                     | 太康街    | 1      | 1909 | declaration_earliest | ok                   |
| 12225 | Tai Kok Tsui Road                   | 大角咀道   | 1      | 1923 | declaration_earliest | ok                   |
| 12239 | Tai Nan Street                      | 大南街    | 1      | 1927 | declaration_earliest | ok                   |
| 12241 | Tai Ning Street                     | 太寧街    | 1      | 1909 | declaration_earliest | ok                   |
| 12246 | Tai On Street                       | 太安街    | 1      | 1909 | declaration_earliest | ok                   |
| 12249 | Tai Pak Terrace                     | 太白台    | 1      | 1925 | declaration_earliest | ok                   |
| 12254 | Tai Po Road                         | 大埔道    | 2      | 1927 | declaration_earliest | ok                   |
| 12267 | Tai San Street                      | 大新街    | 1      | 1935 | declaration_earliest | ok                   |
| 12269 | Tai Shek Street                     | 大石街    | 1      | 1924 | declaration_earliest | ok                   |
| 12273 | Tai Tak Street                      | 大德街    | 1      | 1931 | declaration_earliest | ok                   |
| 12278 | Tai Tsun Street                     | 大全街    | 1      | 1974 | declaration_earliest | ok                   |
| 12282 | Tai Wan Road                        | 大灣道    | 1      | 1922 | declaration_earliest | mismatch             |
| 12296 | Tai Yuen Street                     | 太原街    | 1      | 1909 | current_name_since   | ok                   |
| 12305 | Tak Hing Street                     | 德興街    | 1      | 1933 | declaration_earliest | ok                   |
| 12308 | Tak Ku Ling Road                    | 打鼓嶺道   | 1      | 1926 | declaration_earliest | ok                   |
| 12315 | Tak Shing Street                    | 德成街    | 1      | 1931 | declaration_earliest | ok                   |
| 12326 | Taku Street                         | 大沽街    | 2      | 1909 | current_name_since   | ok                   |
| 12330 | Tam Kung Road                       | 譚公道    | 1      | 1926 | declaration_earliest | ok                   |
| 12335 | Tang Lung Street                    | 登龍街    | 1      | 1926 | declaration_earliest | ok                   |
| 12343 | Temple Street                       | 廟街     | 1      | 1921 | declaration_earliest | ok                   |
| 12348 | Theatre Lane                        | 戲院里    | 1      | 1936 | declaration_earliest | ok                   |
| 12354 | Thomson Road                        | 譚臣道    | 1      | 1931 | declaration_earliest | ok                   |
| 12357 | Tin Chiu Street                     | 電照街    | 1      | 1939 | declaration_earliest | ok                   |
| 12359 | Tin Ha Road                         | 田廈路    | 1      | 1974 | declaration_earliest | ok                   |
| 12361 | Tin Hau Temple Road                 | 天后廟道   | 1      | 1930 | declaration_earliest | ok                   |
| 12363 | Tin Kwong Road                      | 天光道    | 1      | 1933 | declaration_earliest | ok                   |
| 12370 | Tin Wan Street                      | 田灣街    | 1      | 1956 | declaration_earliest | ok                   |
| 12383 | To Kwa Wan Road                     | 土瓜灣道   | 1      | 1926 | declaration_earliest | ok                   |
| 12384 | To Li Terrace                       | 桃李台    | 1      | 1926 | declaration_earliest | mismatch             |
| 12390 | Tong Mi Road                        | 塘尾道    | 1      | 1923 | declaration_earliest | ok                   |
| 12391 | Tong Shui Road                      | 糖水路    | 1      | 1933 | declaration_earliest | mismatch             |
| 12394 | Tonkin Street                       | 東京街    | 1      | 1934 | declaration_earliest | ok                   |
| 12395 | Tonnochy Road                       | 謝斐道    | 1      | 1929 | declaration_earliest | mismatch             |
| 12399 | Tregunter Path                      | 地利根德道  | 1      | 1920 | declaration_earliest | mismatch             |
| 12404 | Tsap Fai Street                     | 集輝街    | 1      | 1935 | declaration_earliest | ok                   |
| 12405 | Tsap Tseung Street                  | 集祥街    | 1      | 1930 | declaration_earliest | ok                   |
| 12407 | Tsat Tse Mui Road                   | 七姊妹道   | 1      | 1939 | declaration_earliest | mismatch             |
| 12413 | Tsing Chau Street                   | 青洲街    | 1      | 1931 | declaration_earliest | mismatch             |
| 12419 | Tsing Fung Street                   | 清風街    | 1      | 1926 | declaration_earliest | ok                   |
| 12454 | Tsing Yuen Street                   | 靖遠街    | 1      | 1930 | declaration_earliest | ok                   |
| 12458 | Tsoi Tak Street                     | 載德街    | 1      | 1930 | declaration_earliest | ok                   |
| 12478 | Tsui Man Street                     | 聚文街    | 1      | 1930 | declaration_earliest | ok                   |
| 12487 | Tsun Yuen Street                    | 晉源街    | 1      | 1930 | declaration_earliest | ok                   |
| 12509 | Tung Chau Street                    | 通州街    | 1      | 1927 | declaration_earliest | ok                   |
| 12513 | Tung Choi Street                    | 通菜街    | 1      | 1924 | declaration_earliest | ok                   |
| 12517 | Tung Fong Street                    | 東方街    | 1      | 1924 | declaration_earliest | ok                   |
| 12525 | Tung Lo Wan Road                    | 銅鑼灣道   | 1      | 1935 | declaration_earliest | ok                   |
| 12532 | Tung On Street                      | 東安街    | 1      | 1926 | declaration_earliest | ok                   |
| 12537 | Tung Street                         | 東街     | 1      | 1909 | current_name_since   | ok                   |
| 12543 | Tung Tau Wan Road                   | 東頭灣道   | 1      | 1933 | declaration_earliest | ok                   |
| 12556 | Un Chau Street                      | 元州街    | 1      | 1923 | declaration_earliest | ok                   |
| 12566 | Valley Road                         | 山谷道    | 1      | 1933 | declaration_earliest | ok                   |
| 12567 | Ventris Road                        | 雲地利道   | 1      | 1926 | declaration_earliest | ok                   |
| 12572 | Village Road                        | 山村道    | 2      | 1925 | declaration_earliest | ok                   |
| 12578 | Wa Fung Street                      | 華豐街    | 1      | 1923 | declaration_earliest | ok                   |
| 12597 | Wah Sing Street                     | 華星街    | 1      | 1974 | declaration_earliest | ok                   |
| 12602 | Wai Ching Street                    | 偉晴街    | 1      | 1924 | declaration_earliest | ok                   |
| 12603 | Wai Fung Street                     | 惠風街    | 1      | 1932 | declaration_earliest | ok                   |
| 12620 | Wai Wai Road                        | 懷惠道    | 1      | 1934 | declaration_earliest | ok                   |
| 12621 | Wai Yan Street                      | 懷仁街    | 1      | 1930 | declaration_earliest | ok                   |
| 12622 | Wai Yi Street                       | 懷義街    | 1      | 1930 | declaration_earliest | ok                   |
| 12640 | Wan Shing Street                    | 運盛街    | 1      | 1974 | declaration_earliest | ok                   |
| 12654 | Wang Fat Path                       | 宏發徑    | 1      | 1984 | declaration_earliest | ok                   |
| 12671 | Wang Tak Street                     | 宏德街    | 1      | 1930 | declaration_earliest | ok                   |
| 12672 | Wang Tat Road                       | 宏達路    | 1      | 1984 | declaration_earliest | ok                   |
| 12690 | Waterloo Road                       | 窩打老道   | 2      | 1929 | declaration_earliest | ok                   |
| 12712 | Wing Cheung Street                  | 永祥街    | 1      | 1939 | declaration_earliest | ok                   |
| 12718 | Wing Fong Road                      | 榮芳路    | 1      | 1974 | declaration_earliest | ok                   |
| 12719 | Wing Fook Street                    | 永福街    | 1      | 1974 | declaration_earliest | ok                   |
| 12724 | Wing Hong Street                    | 永康街    | 1      | 1934 | declaration_earliest | ok                   |
| 12734 | Wing Lung Street                    | 永隆街    | 1      | 1934 | declaration_earliest | ok                   |
| 12737 | Wing Ning Street                    | 永寧街    | 1      | 1939 | declaration_earliest | ok                   |
| 12747 | Wing Tung Street                    | 永東街    | 1      | 1983 | declaration_earliest | ok                   |
| 12750 | Wing Wo Street                      | 永和街    | 1      | 1905 | declaration_earliest | ok                   |
| 12752 | Wing Yip Street                     | 永業街    | 1      | 1974 | declaration_earliest | ok                   |
| 12754 | Winslow Street                      | 溫思勞街   | 1      | 1923 | declaration_earliest | ok                   |
| 12775 | Wong Chuk Hang Path                 | 黃竹坑徑   | 1      | 1937 | declaration_earliest | ok                   |
| 12777 | Wong Chuk Street                    | 黃竹街    | 1      | 1927 | declaration_earliest | ok                   |
| 12781 | Wong Ma Kok Road                    | 黃蔴角道   | 1      | 1937 | declaration_earliest | mismatch             |
| 12782 | Wong Nei Cheong Gap Road            | 黃泥涌峽道  | 1      | 1932 | declaration_earliest | mismatch             |
| 12785 | Wong Tai Street                     | 旺堤街    | 1      | 1974 | declaration_earliest | ok                   |
| 12791 | Woosung Street                      | 吳松街    | 1      | 1909 | current_name_since   | ok                   |
| 12799 | Wuhu Street                         | 蕪湖街    | 1      | 1909 | current_name_since   | ok                   |
| 12800 | Wun Sha Street                      | 浣紗街    | 1      | 1932 | declaration_earliest | ok                   |
| 12805 | Yacht Street                        | 帆船街    | 1      | 1926 | declaration_earliest | ok                   |
| 12808 | Yan Fong Street                     | 仁芳街    | 1      | 1974 | declaration_earliest | ok                   |
| 12810 | Yan Hing Street                     | 仁興街    | 1      | 1930 | declaration_earliest | ok                   |
| 12825 | Yat San Street                      | 日新街    | 1      | 1935 | declaration_earliest | ok                   |
| 12833 | Yau San Street                      | 又新街    | 1      | 1935 | declaration_earliest | ok                   |
| 12838 | Yau Wing Street                     | 友榮街    | 1      | 1985 | declaration_earliest | ok                   |
| 12844 | Yee Kuk Street                      | 醫局街    | 1      | 1927 | declaration_earliest | ok                   |
| 12858 | Yi Lun Street                       | 彝倫街    | 1      | 1961 | declaration_earliest | ok                   |
| 12862 | Yik Kwan Avenue                     | 益群道    | 1      | 1931 | declaration_earliest | ok                   |
| 12863 | Yik Yam Street                      | 奕蔭街    | 1      | 1930 | declaration_earliest | ok                   |
| 12865 | Yim Po Fong Street                  | 染布房街   | 1      | 1924 | declaration_earliest | ok                   |
| 12870 | Ying Choi Path                      | 英才徑    | 1      | 1974 | declaration_earliest | ok                   |
| 12882 | Yiu Tung Street                     | 耀東街    | 1      | 1935 | declaration_earliest | ok                   |
| 12887 | York Road                           | 約道     | 1      | 1929 | declaration_earliest | ok                   |
| 12888 | Yu Chow Street                      | 汝州街    | 1      | 1927 | declaration_earliest | mismatch             |
| 12891 | Yu King Square                      | 裕景坊    | 1      | 1983 | declaration_earliest | ok                   |
| 12894 | Yu On Street                        | 漁安街    | 1      | 1987 | declaration_earliest | ok                   |
| 12919 | Yuen Long Pau Cheung Square         | 元朗炮仗坊  | 1      | 1977 | declaration_earliest | ok                   |
| 12931 | Yuen Yuen Street                    | 源遠街    | 1      | 1930 | declaration_earliest | ok                   |
| 12940 | Yuk Sau Street                      | 毓秀街    | 1      | 1930 | declaration_earliest | ok                   |
| 12949 | Yunnan Lane                         | 雲南里    | 1      | 1909 | current_name_since   | ok                   |
| 12962 | Hoi Kwai Road                       | 海貴路    | 1      | 1990 | declaration_earliest | ok                   |
| 12992 | Tsz Tin Road                        | 紫田路    | 1      | 1990 | declaration_earliest | shadow               |
| 12993 | Tong Hang Road                      | 塘亨路    | 1      | 1990 | declaration_earliest | shadow               |
| 13020 | Fu Tei Road                         | 富地路    | 1      | 1991 | declaration_earliest | ok                   |
| 13041 | Luk Mei Tsuen Road                  | 鹿尾村路   | 1      | 1991 | declaration_earliest | ok                   |
| 13052 | Shui Pin Wai Interchange            | 水邊圍交匯處 | 1      | 1991 | declaration_earliest | ok                   |
| 13055 | Kung Um Road                        | 公庵路    | 1      | 1991 | declaration_earliest | ok                   |
| 13056 | Ma Tong Road                        | 馬棠路    | 1      | 1991 | declaration_earliest | ok                   |
| 13124 | Choi Yuen Road                      | 彩園路    | 1      | 1992 | declaration_earliest | ok                   |
| 13141 | Tai Hom Road                        | 大磡道    | 1      | 1991 | declaration_earliest | ok                   |
| 13148 | Tin Kwai Road                       | 天葵路    | 1      | 2000 | declaration_earliest | ok                   |
| 13151 | Tin Shui Road                       | 天瑞路    | 1      | 2000 | declaration_earliest | ok                   |
| 13158 | Tin Yan Road                        | 天恩路    | 1      | 1992 | declaration_earliest | ok                   |
| 13174 | Tseung Kwan O Road                  | 將軍澳道   | 1      | 1992 | declaration_earliest | ok                   |
| 13517 | Hing Kwai Street                    | 興貴街    | 1      | 1992 | declaration_earliest | shadow               |
| 13527 | Yau Tin West Road                   | 攸田西路   | 1      | 1992 | declaration_earliest | ok                   |
| 13565 | Fu Chung Lane                       | 富忠里    | 1      | 1993 | declaration_earliest | ok                   |
| 13707 | Lung Ma Road                        | 龍馬路    | 1      | 1995 | declaration_earliest | ok                   |
| 13798 | Airport Road                        | 機場路    | 1      | 1998 | declaration_earliest | ok                   |
| 13799 | Cheong Hong Road                    | 暢航路    | 1      | 1998 | declaration_earliest | ok                   |
| 13801 | Cheong Hing Road                    | 暢興路    | 1      | 2005 | declaration_earliest | ok                   |
| 13805 | East Coast Road                     | 東岸路    | 1      | 2007 | declaration_earliest | ok                   |
| 13810 | Cheong Tat Road                     | 暢達路    | 1      | 2005 | declaration_earliest | ok                   |
| 13824 | Kwo Lo Wan Road                     | 過路灣路   | 1      | 1998 | declaration_earliest | ok                   |
| 13884 | Nga Cheung Road                     | 雅翔道    | 1      | 1998 | declaration_earliest | shadow               |
| 13885 | West Kowloon Highway                | 西九龍公路  | 1      | 1998 | declaration_earliest | ok                   |
| 13888 | Chui Yu Road                        | 聚魚道    | 1      | 1998 | declaration_earliest | ok                   |
| 13917 | Tung Fai Road                       | 東輝路    | 1      | 1998 | declaration_earliest | ok                   |
| 13922 | Lin Cheung Road                     | 連翔道    | 1      | 1998 | declaration_earliest | ok                   |
| 13925 | Wui Cheung Road                     | 匯翔道    | 1      | 1998 | declaration_earliest | ok                   |
| 13926 | Austin Road West                    | 柯士甸道西  | 1      | 1998 | declaration_earliest | ok                   |
| 13951 | Lai Po Road                         | 荔寶路    | 1      | 1999 | declaration_earliest | shadow               |
| 13956 | Hung Lai Road                       | 紅荔道    | 1      | 1999 | declaration_earliest | ok                   |
| 13995 | Ying Hei Road                       | 迎禧路    | 1      | 1999 | declaration_earliest | ok                   |
| 13996 | Chui Kwan Drive                     | 翠群徑    | 1      | 1999 | declaration_earliest | shadow               |
| 13997 | Tung Cheung Street                  | 東昌街    | 1      | 1936 | declaration_earliest | mismatch             |
| 14020 | Yuen Lung Street                    | 元龍街    | 1      | 2000 | declaration_earliest | ok                   |
| 14021 | Yuen Ching Road                     | 元政路    | 1      | 2000 | declaration_earliest | ok                   |
| 14022 | Wai Lok Street                      | 偉樂街    | 1      | 2000 | declaration_earliest | ok                   |
| 14023 | King's Park Hill Road               | 京士柏山道  | 1      | 2000 | declaration_earliest | ok                   |
| 14024 | Po Chiu Road                        | 普照路    | 1      | 2000 | declaration_earliest | ok                   |
| 14025 | Kai Wo Road                         | 啟和路    | 1      | 2000 | declaration_earliest | ok                   |
| 14026 | Fuk Wo Road                         | 福和路    | 1      | 2000 | declaration_earliest | ok                   |
| 14027 | Wetland Park Road                   | 濕地公園路  | 1      | 2000 | declaration_earliest | ok                   |
| 14028 | Tin Yip Road                        | 天業路    | 1      | 2000 | declaration_earliest | ok                   |
| 14029 | Tin Sau Road                        | 天秀路    | 1      | 2000 | declaration_earliest | ok                   |
| 14030 | Tin Fai Road                        | 天暉路    | 1      | 2000 | declaration_earliest | ok                   |
| 14031 | Kwong Wing Lane                     | 廣榮里    | 1      | 2000 | declaration_earliest | ok                   |
| 14032 | Ko Chiu Path                        | 高超徑    | 1      | 2000 | declaration_earliest | ok                   |
| 14033 | Choi Hei Road                       | 彩禧路    | 1      | 2000 | declaration_earliest | ok                   |
| 14034 | Kam Tsin Path                       | 金錢徑    | 1      | 2000 | declaration_earliest | ok                   |
| 14035 | Wa Mei Path                         | 畫眉徑    | 1      | 2000 | declaration_earliest | ok                   |
| 14036 | Yat Tai Street                      | 逸泰街    | 1      | 2000 | declaration_earliest | ok                   |
| 14037 | Marina Drive                        | 遊艇徑    | 1      | 2000 | declaration_earliest | ok                   |
| 14038 | Bijou Drive                         | 璧如徑    | 1      | 2000 | declaration_earliest | ok                   |
| 14039 | Costa Avenue                        | 海堤徑    | 1      | 2000 | declaration_earliest | ok                   |
| 14070 | Lung Hong Street                    | 龍康街    | 1      | 2001 | declaration_earliest | ok                   |
| 14124 | Pok Wai South Road                  | 壆圍南路   | 1      | 2002 | declaration_earliest | ok                   |
| 14143 | Wan O Road                          | 環澳路    | 1      | 2003 | declaration_earliest | ok                   |
| 14155 | Nam Hing West Road                  | 南慶西路   | 1      | 2003 | declaration_earliest | ok                   |
| 14164 | Ching Hiu Road                      | 清曉路    | 1      | 2003 | declaration_earliest | ok                   |
| 14165 | Ching Shing Road                    | 清城路    | 1      | 2003 | declaration_earliest | ok                   |
| 14170 | Pak Fa Lam Road                     | 百花林路   | 1      | 2003 | declaration_earliest | ok                   |
| 14199 | Penny's Bay Highway                 | 竹篙灣公路  | 1      | 2004 | declaration_earliest | ok                   |
| 14200 | Sunny Bay Road                      | 欣澳道    | 1      | 2004 | declaration_earliest | ok                   |
| 14201 | Magic Road                          | 神奇道    | 1      | 2004 | declaration_earliest | ok                   |
| 14202 | Inspiration Drive                   | 迪欣路    | 1      | 2004 | declaration_earliest | ok                   |
| 14203 | Fantasy Road                        | 幻想道    | 1      | 2004 | declaration_earliest | ok                   |
| 14204 | Wing Yan Road                       | 榮欣路    | 1      | 2004 | declaration_earliest | ok                   |
| 14205 | Chak Yan Road                       | 澤欣路    | 1      | 2004 | declaration_earliest | ok                   |
| 14206 | Long Yan Road                       | 朗欣路    | 1      | 2004 | declaration_earliest | ok                   |
| 14207 | Sea Point Road                      | 海鳴路    | 1      | 2004 | declaration_earliest | ok                   |
| 14208 | Park Promenade                      | 迎樂路    | 1      | 2004 | declaration_earliest | ok                   |
| 14209 | KAM TIN BYPASS                      | 錦田繞道   | 1      | 2004 | declaration_earliest | ok                   |
| 14230 | Chong San Road                      | 創新路    | 1      | 2005 | declaration_earliest | ok                   |
| 14231 | Fo Chun Road                        | 科進路    | 2      | 2010 | current_name_since   | ok                   |
| 14232 | Fo Shing Road                       | 科城路    | 1      | 2005 | declaration_earliest | ok                   |
| 14233 | Fo Yin Road                         | 科研路    | 1      | 2005 | declaration_earliest | ok                   |
| 14240 | Sky City Road                       | 航天城路   | 1      | 2005 | declaration_earliest | ok                   |
| 14242 | Sky City Road East                  | 航天城東路  | 1      | 2005 | declaration_earliest | ok                   |
| 14304 | Lam Tsuen Heung Kung Sho Road       | 林村鄉公所路 | 1      | 2008 | declaration_earliest | ok                   |
| 14359 | Muk Chui Street                     | 沐翠街    | 1      | 2012 | declaration_earliest | ok                   |
| 14360 | Muk Chun Street                     | 沐縉街    | 1      | 2012 | declaration_earliest | ok                   |
| 14361 | Muk Hung Street                     | 沐虹街    | 1      | 2012 | declaration_earliest | ok                   |
| 14362 | Muk On Street                       | 沐安街    | 1      | 2012 | declaration_earliest | ok                   |
| 14363 | Shing Kai Road                      | 承啟道    | 1      | 2012 | declaration_earliest | shadow               |
| 14364 | Shing Cheong Road                   | 承昌道    | 1      | 2012 | declaration_earliest | ok                   |
| 14365 | Shing Fung Road                     | 承豐道    | 1      | 2012 | declaration_earliest | ok                   |
| 14367 | Yiu Sing Street                     | 耀星街    | 1      | 2012 | declaration_earliest | ok                   |
| 14377 | Pok Yin Road                        | 博研路    | 1      | 2013 | declaration_earliest | ok                   |
| 14385 | Cheung Tai Road                     | 樟大路    | 1      | 2013 | declaration_earliest | ok                   |
| 14386 | Ka King Lane                        | 嘉敬里    | 1      | 2013 | declaration_earliest | ok                   |
| 14409 | On Chui Street                      | 安翠街    | 1      | 2015 | declaration_earliest | ok                   |
| 14410 | On Yan Street                       | 安茵街    | 1      | 2015 | declaration_earliest | ok                   |
| 14449 | Yau Ma Tei Interchange              | 油麻地交匯處 | 1      | 2017 | declaration_earliest | shadow               |
| 14516 | Cultural Drive                      | 文化道    | 1      | 2021 | declaration_earliest | ok                   |
| 14555 | Innovation and Technology Park Road | 創科園路   | 1      | 2025 | declaration_earliest | mismatch             |
| 14567 | Central Kowloon Bypass              | 中九龍繞道  | 1      | 2025 | declaration_earliest | ok                   |


---

## Appendix B: Name-only timelines (298)

Not linked by `street_code`. `shadow-duplicate` = redundant copy of a coded timeline.


| key                                                          | EN                                                | ZH         | events | year | derivation           | flags            |
| ------------------------------------------------------------ | ------------------------------------------------- | ---------- | ------ | ---- | -------------------- | ---------------- |
| |下灣村東路                                                       |                                                   | 下灣村東路      | 1      | 2015 | declaration_earliest | non-map-linked   |
| |下灣村路                                                        |                                                   | 下灣村路       | 1      | 2015 | declaration_earliest | non-map-linked   |
| |仁東里                                                         |                                                   | 仁東里        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |兆東街                                                         |                                                   | 兆東街        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |古洞北路                                                        |                                                   | 古洞北路       | 1      | 2026 | declaration_earliest | non-map-linked   |
| |古雋街                                                         |                                                   | 古雋街        | 1      | 2026 | declaration_earliest | non-map-linked   |
| |善東里                                                         |                                                   | 善東里        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |嘉健里                                                         |                                                   | 嘉健里        | 1      | 2015 | declaration_earliest | non-map-linked   |
| |嘉敬里                                                         |                                                   | 嘉敬里        | 1      | 2013 | declaration_earliest | non-map-linked   |
| |大老山公路                                                       |                                                   | 大老山公路      | 1      | 1992 | declaration_earliest | non-map-linked   |
| |孝東街                                                         |                                                   | 孝東街        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |安健道                                                         |                                                   | 安健道        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |安愉徑                                                         |                                                   | 安愉徑        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |安愉道                                                         |                                                   | 安愉道        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |安禧街                                                         |                                                   | 安禧街        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |安茵街                                                         |                                                   | 安茵街        | 1      | 2015 | declaration_earliest | non-map-linked   |
| |尾逢路                                                         |                                                   | 尾逢路        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |屯門赤鱲角隧道公路                                                   |                                                   | 屯門赤鱲角隧道公路  | 1      | 2020 | declaration_earliest | non-map-linked   |
| |彩東里                                                         |                                                   | 彩東里        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |承富里                                                         |                                                   | 承富里        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |承景街                                                         |                                                   | 承景街        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |承裕里                                                         |                                                   | 承裕里        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |啟德交匯處                                                       |                                                   | 啟德交匯處      | 1      | 2025 | declaration_earliest | non-map-linked   |
| |啟德橋道                                                        |                                                   | 啟德橋道       | 1      | 2021 | declaration_earliest | non-map-linked   |
| |曉東路                                                         |                                                   | 曉東路        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |朗東路                                                         |                                                   | 朗東路        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |柏壽路                                                         |                                                   | 柏壽路        | 1      | 2022 | declaration_earliest | non-map-linked   |
| |梁盛路                                                         |                                                   | 梁盛路        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |榕樹灣廣場路                                                      |                                                   | 榕樹灣廣場路     | 1      | 2014 | declaration_earliest | non-map-linked   |
| |水尾路                                                         |                                                   | 水尾路        | 1      | 2021 | declaration_earliest | non-map-linked   |
| |江埔路                                                         |                                                   | 江埔路        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |浩和街                                                         |                                                   | 浩和街        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |浩逸街                                                         |                                                   | 浩逸街        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |清攸徑                                                         |                                                   | 清攸徑        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |牛皮沙街                                                        |                                                   | 牛皮沙街       | 1      | 2000 | declaration_earliest | non-map-linked   |
| |石上路                                                         |                                                   | 石上路        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |米埔南路                                                        |                                                   | 米埔南路       | 1      | 2020 | declaration_earliest | non-map-linked   |
| |蓮竹路                                                         |                                                   | 蓮竹路        | 1      | 2023 | declaration_earliest | non-map-linked   |
| |貴東路                                                         |                                                   | 貴東路        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |迎康街                                                         |                                                   | 迎康街        | 1      | 2014 | declaration_earliest | non-map-linked   |
| |迎東路                                                         |                                                   | 迎東路        | 1      | 2014 | declaration_earliest | non-map-linked   |
| |鄉梓路                                                         |                                                   | 鄉梓路        | 1      | 2022 | declaration_earliest | non-map-linked   |
| |錦東街                                                         |                                                   | 錦東街        | 1      | 2025 | declaration_earliest | non-map-linked   |
| |香蓮路                                                         |                                                   | 香蓮路        | 1      | 2023 | declaration_earliest | non-map-linked   |
| |馬鞍山路                                                        |                                                   | 馬鞍山路       | 1      | 1992 | declaration_earliest | non-map-linked   |
| |高上路                                                         |                                                   | 高上路        | 1      | 2020 | declaration_earliest | non-map-linked   |
| |麥園圍路青亦路                                                     |                                                   | 麥園圍路青亦路    | 1      | 2014 | declaration_earliest | non-map-linked   |
| |龍田街                                                         |                                                   | 龍田街        | 1      | 2014 | declaration_earliest | non-map-linked   |
| Bel-Air Peak Avenue|貝沙山道                                     | Bel-Air Peak Avenue                               | 貝沙山道       | 1      | 2009 | declaration_earliest | non-map-linked   |
| Cargo Circuit|貨運道                                            | Cargo Circuit                                     | 貨運道        | 1      | 1981 | declaration_earliest | non-map-linked   |
| Chai Kek Road|寨乪路                                            | Chai Kek Road                                     | 寨乪路        | 1      | 2011 | declaration_earliest | non-map-linked   |
| Chek Lap Kok Road|赤鱲角路                                       | Chek Lap Kok Road                                 | 赤鱲角路       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Cheong Lin Path|暢連徑                                          | Cheong Lin Path                                   | 暢連徑        | 1      | 2002 | declaration_earliest | non-map-linked   |
| Cheung Chau Electric Path|長洲電廠徑                              | Cheung Chau Electric Path                         | 長洲電廠徑      | 1      | 2008 | declaration_earliest | non-map-linked   |
| Cheung Sha Wan Road|                                         | Cheung Sha Wan Road                               |            | 1      | 1927 | declaration_earliest | shadow-duplicate |
| Cheung Tsing Highway|長青公路                                    | Cheung Tsing Highway                              | 長青公路       | 1      | 2009 | declaration_earliest | non-map-linked   |
| Chi Li T P At H|誌烈徑                                          | Chi Li T P At H                                   | 誌烈徑        | 1      | 2022 | declaration_earliest | non-map-linked   |
| Chi Tin Street|智田街                                           | Chi Tin Street                                    | 智田街        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Ching Lai Road|澄麗路                                           | Ching Lai Road                                    | 澄麗路        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Ching Road|青道                                                | Ching Road                                        | 青道         | 1      | 1957 | declaration_earliest | non-map-linked   |
| Ching Yu Path|菁裕徑                                            | Ching Yu Path                                     | 菁裕徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Choi Lung Street|彩隆街                                         | Choi Lung Street                                  | 彩隆街        | 1      | 2025 | declaration_earliest | non-map-linked   |
| Choi Shing Lane|彩盛里                                          | Choi Shing Lane                                   | 彩盛里        | 1      | 2018 | declaration_earliest | non-map-linked   |
| Choi Tip Street|彩蝶街                                          | Choi Tip Street                                   | 彩蝶街        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Choi Wing Lane|彩榮里                                           | Choi Wing Lane                                    | 彩榮里        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Chui Fuk Road|翠福路                                            | Chui Fuk Road                                     | 翠福路        | 1      | 2018 | declaration_earliest | non-map-linked   |
| Chui Kwan Drive|翠群徑                                          | Chui Kwan Drive                                   | 翠群徑        | 2      | 2024 | declaration_earliest | shadow-duplicate |
| Chun Chi Lane North|振翅里北                                     | Chun Chi Lane North                               | 振翅里北       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Chun Chi Lane South|振翅里南                                     | Chun Chi Lane South                               | 振翅里南       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Church Lane|教堂里                                              | Church Lane                                       | 教堂里        | 1      | 1958 | declaration_earliest | non-map-linked   |
| Concorde Road|協調道                                            | Concorde Road                                     | 協調道        | 1      | 1981 | declaration_earliest | non-map-linked   |
| Discovery Peak Road|愉峰道                                      | Discovery Peak Road                               | 愉峰道        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Edinburgh Place|愛丁堡廣場                                        | Edinburgh Place                                   | 愛丁堡廣場      | 1      | 2009 | declaration_earliest | non-map-linked   |
| F A Nling Bypass|粉嶺繞道                                        | F A Nling Bypass                                  | 粉嶺繞道       | 1      | 2026 | declaration_earliest | non-map-linked   |
| Fat Kwong Street Flyover|佛光街天橋                               | Fat Kwong Street Flyover                          | 佛光街天橋      | 1      | 2009 | declaration_earliest | non-map-linked   |
| Fi R S T Sky Street|航天城第一街                                   | Fi R S T Sky Street                               | 航天城第一街     | 1      | 2021 | declaration_earliest | non-map-linked   |
| Fleming Road|菲林明道                                            | Fleming Road                                      | 菲林明道       | 1      |      | no_declaration_found | shadow-duplicate |
| Fo Hing Street|科興街                                           | Fo Hing Street                                    | 科興街        | 1      | 2008 | declaration_earliest | non-map-linked   |
| Fook Lai Road|復禮道                                            | Fook Lai Road                                     | 復禮道        | 1      | 1957 | declaration_earliest | non-map-linked   |
| Fu Fuk Road|富福路                                              | Fu Fuk Road                                       | 富福路        | 1      | 2018 | declaration_earliest | non-map-linked   |
| Fu Mei Street West|富美西街                                      | Fu Mei Street West                                | 富美西街       | 1      | 1967 | declaration_earliest | non-map-linked   |
| Fuk Man Road|福民路                                             | Fuk Man Road                                      | 福民路        | 1      | 1985 | declaration_earliest | non-map-linked   |
| Fung Cheung Path|鳳翔徑                                         | Fung Cheung Path                                  | 鳳翔徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Fung Kwan Path|鳳群徑                                           | Fung Kwan Path                                    | 鳳群徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Fung L Am R O A D|鳳林路                                        | Fung L Am R O A D                                 | 鳳林路        | 1      | 2026 | declaration_earliest | non-map-linked   |
| Fung Ling R O A D|鳳嶺路                                        | Fung Ling R O A D                                 | 鳳嶺路        | 1      | 2026 | declaration_earliest | non-map-linked   |
| Fung Yau Path|鳳攸徑                                            | Fung Yau Path                                     | 鳳攸徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Fung Ying Path|豐盈徑                                           | Fung Ying Path                                    | 豐盈徑        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Fung Yu Road|豐裕路                                             | Fung Yu Road                                      | 豐裕路        | 1      | 2016 | declaration_earliest | non-map-linked   |
| Gascoigne Road Flyover|                                      | Gascoigne Road Flyover                            |            | 1      |      | no_declaration_found | non-map-linked   |
| Gascoigne Road Fylover|加士居道天橋                                | Gascoigne Road Fylover                            | 加士居道天橋     | 1      |      | excluded_manual      | non-map-linked   |
| Golden Beach Path|黃金泳灘徑                                      | Golden Beach Path                                 | 黃金泳灘徑      | 1      | 2011 | declaration_earliest | non-map-linked   |
| Ha Mei Road|廈尾路                                              | Ha Mei Road                                       | 廈尾路        | 1      | 2013 | declaration_earliest | non-map-linked   |
| Hammer Hill Road|斧山道                                         | Hammer Hill Road                                  | 斧山道        | 3      | 2017 | declaration_earliest | non-map-linked   |
| Hang Kai Lane|坑溪里                                            | Hang Kai Lane                                     | 坑溪里        | 1      | 2015 | declaration_earliest | non-map-linked   |
| Heung Yip Path|香葉徑                                           | Heung Yip Path                                    | 香葉徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Heung Yuen Wai Highway|香園圍公路                                 | Heung Yuen Wai Highway                            | 香園圍公路      | 1      | 2019 | declaration_earliest | non-map-linked   |
| Hing Kwai Street|                                            | Hing Kwai Street                                  |            | 1      | 1992 | declaration_earliest | shadow-duplicate |
| Ho Chung North Road|蠔涌北路                                     | Ho Chung North Road                               | 蠔涌北路       | 1      | 2020 | declaration_earliest | non-map-linked   |
| Hoi Long Path|海浪徑                                            | Hoi Long Path                                     | 海浪徑        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Hoi Sha Path|海沙徑                                             | Hoi Sha Path                                      | 海沙徑        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Hoi Shin L A N E|海善里                                         | Hoi Shin L A N E                                  | 海善里        | 1      | 2022 | declaration_earliest | non-map-linked   |
| Hoi Tai Street|海堤街                                           | Hoi Tai Street                                    | 海堤街        | 1      | 1960 | declaration_earliest | non-map-linked   |
| Hoi Tat Street|海達街                                           | Hoi Tat Street                                    | 海達街        | 1      | 2022 | declaration_earliest | non-map-linked   |
| Hoi Ying R O A D|海映路                                         | Hoi Ying R O A D                                  | 海映路        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Hong Kong-Zhuhai-Macao Bridge Hong Kong Link Road|港珠澳大橋香港連接路 | Hong Kong-Zhuhai-Macao Bridge Hong Kong Link Road | 港珠澳大橋香港連接路 | 1      | 2017 | declaration_earliest | non-map-linked   |
| Hung Hom Bypass|紅磡繞道                                         | Hung Hom Bypass                                   | 紅磡繞道       | 1      | 2019 | declaration_earliest | non-map-linked   |
| Hung Leng North Road|孔嶺北路                                    | Hung Leng North Road                              | 孔嶺北路       | 1      | 2019 | declaration_earliest | non-map-linked   |
| Hung Pak Road|洪柏路                                            | Hung Pak Road                                     | 洪柏路        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Innov At Ion A Nd Te Chnology P Ar K R O A D|創科園路            | Innov At Ion A Nd Te Chnology P Ar K R O A D      | 創科園路       | 1      | 2025 | declaration_earliest | non-map-linked   |
| Jordan Valley South Road|佐頓谷南道                               | Jordan Valley South Road                          | 佐頓谷南道      | 1      | 1966 | declaration_earliest | non-map-linked   |
| Kai Pak Ling Road|雞伯嶺路                                       | Kai Pak Ling Road                                 | 雞伯嶺路       | 1      | 2011 | declaration_earliest | non-map-linked   |
| Kai San Road|啟新道                                             | Kai San Road                                      | 啟新道        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Kai Tak Interchange|啟德交匯處                                    | Kai Tak Interchange                               | 啟德交匯處      | 1      | 2025 | declaration_earliest | non-map-linked   |
| Kai Yung Lane|啟融里                                            | Kai Yung Lane                                     | 啟融里        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Kam Kong Road|錦江路                                            | Kam Kong Road                                     | 錦江路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Kam Pok Road East|錦壆路東                                       | Kam Pok Road East                                 | 錦壆路東       | 1      | 2013 | declaration_earliest | non-map-linked   |
| Kam Pok Road West|錦壆路西                                       | Kam Pok Road West                                 | 錦壆路西       | 1      | 2013 | declaration_earliest | non-map-linked   |
| Kam Yee Road|錦義路                                             | Kam Yee Road                                      | 錦義路        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Kin Cheung Street|建翔街                                        | Kin Cheung Street                                 | 建翔街        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Kin Yip Path|建業徑                                             | Kin Yip Path                                      | 建業徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Kiu Sau Path|橋壽徑                                             | Kiu Sau Path                                      | 橋壽徑        | 1      | 2013 | declaration_earliest | non-map-linked   |
| Kiu Tak Path|橋德徑                                             | Kiu Tak Path                                      | 橋德徑        | 1      | 2013 | declaration_earliest | non-map-linked   |
| Ko Fei Lane North|高飛里北                                       | Ko Fei Lane North                                 | 高飛里北       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Ko Fei Lane South|高飛里南                                       | Ko Fei Lane South                                 | 高飛里南       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Ko Ling Road|高嶺道                                             | Ko Ling Road                                      | 高嶺道        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Ko Long Road|高朗道                                             | Ko Long Road                                      | 高朗道        | 1      | 1967 | declaration_earliest | non-map-linked   |
| Ko Nga Lane|高雅里                                              | Ko Nga Lane                                       | 高雅里        | 1      | 2022 | declaration_earliest | non-map-linked   |
| Ko Po Path|高埔徑                                               | Ko Po Path                                        | 高埔徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Kwun Sh A P At H|觀沙徑                                         | Kwun Sh A P At H                                  | 觀沙徑        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Kwun Tong Bypass|觀塘繞道                                        | Kwun Tong Bypass                                  | 觀塘繞道       | 1      | 2020 | declaration_earliest | non-map-linked   |
| L Am T In In Ter Ch A Ng E|藍田交匯處                             | L Am T In In Ter Ch A Ng E                        | 藍田交匯處      | 1      | 2022 | declaration_earliest | non-map-linked   |
| Lai Chui Path|麗翠徑                                            | Lai Chui Path                                     | 麗翠徑        | 1      | 2020 | declaration_earliest | non-map-linked   |
| Lai Ping Road|麗坪路                                            | Lai Ping Road                                     | 麗坪路        | 1      | 1984 | declaration_earliest | non-map-linked   |
| Lai Po Road|荔寶路                                              | Lai Po Road                                       | 荔寶路        | 1      |      | no_declaration_found | shadow-duplicate |
| Lai Ying Street|荔盈街                                          | Lai Ying Street                                   | 荔盈街        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Lam Yu Road|欖裕路                                              | Lam Yu Road                                       | 欖裕路        | 1      | 2008 | declaration_earliest | non-map-linked   |
| Lau Yip Street|流業街                                           | Lau Yip Street                                    | 流業街        | 1      | 2015 | declaration_earliest | non-map-linked   |
| Legislative Council Road|立法會道                                | Legislative Council Road                          | 立法會道       | 1      | 2011 | declaration_earliest | non-map-linked   |
| Liu Pok Road|料壆路                                             | Liu Pok Road                                      | 料壆路        | 1      | 2010 | declaration_earliest | non-map-linked   |
| LOHAS Park Road|康城路                                          | LOHAS Park Road                                   | 康城路        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Lok Ma Chau Road|落馬洲路                                        | Lok Ma Chau Road                                  | 落馬洲路       | 1      | 2015 | declaration_earliest | non-map-linked   |
| Long Fung Street|朗風街                                         | Long Fung Street                                  | 朗風街        | 1      | 2025 | declaration_earliest | non-map-linked   |
| Long Ngai Path|朗藝徑                                           | Long Ngai Path                                    | 朗藝徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Lung Chak Road|龍澤路                                           | Lung Chak Road                                    | 龍澤路        | 1      | 2013 | declaration_earliest | non-map-linked   |
| Lung Chun Road|龍峻路                                           | Lung Chun Road                                    | 龍峻路        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Lung Hop Street|龍合街                                          | Lung Hop Street                                   | 龍合街        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Lung Kui Road|龍駒道                                            | Lung Kui Road                                     | 龍駒道        | 1      | 2016 | declaration_earliest | non-map-linked   |
| Lung Shan Road|龍山道                                           | Lung Shan Road                                    | 龍山道        | 1      | 1957 | declaration_earliest | non-map-linked   |
| Lung T Ing L A N E|龍庭里                                       | Lung T Ing L A N E                                | 龍庭里        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Lung Tat P At H|龍達徑                                          | Lung Tat P At H                                   | 龍達徑        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Lung Wah Street|龍華街                                          | Lung Wah Street                                   | 龍華街        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Lung Wo Road|龍和道                                             | Lung Wo Road                                      | 龍和道        | 2      | 2009 | declaration_earliest | non-map-linked   |
| Lung Wui Road|龍匯道                                            | Lung Wui Road                                     | 龍匯道        | 1      | 1997 | declaration_earliest | non-map-linked   |
| Lung Yuet Road|龍悅道                                           | Lung Yuet Road                                    | 龍悅道        | 1      | 2016 | declaration_earliest | non-map-linked   |
| M Oon T In L A N E|滿田里                                       | M Oon T In L A N E                                | 滿田里        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Ma Fuk R O A D|馬福路                                           | Ma Fuk R O A D                                    | 馬福路        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Ma Shing Path|馬成徑                                            | Ma Shing Path                                     | 馬成徑        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Ma Ta K R O A D|馬得路                                          | Ma Ta K R O A D                                   | 馬得路        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Man Chat Road|文質路                                            | Man Chat Road                                     | 文質路        | 1      | 2015 | declaration_earliest | non-map-linked   |
| Mei Fai Street|美輝街                                           | Mei Fai Street                                    | 美輝街        | 1      | 2011 | declaration_earliest | non-map-linked   |
| Ming Tak Street|明德街                                          | Ming Tak Street                                   | 明德街        | 1      | 1963 | declaration_earliest | non-map-linked   |
| Muk Lai Street|沐禮街                                           | Muk Lai Street                                    | 沐禮街        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Muk Long Street|沐朗街                                          | Muk Long Street                                   | 沐朗街        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Muk Ning Street|沐寧街                                          | Muk Ning Street                                   | 沐寧街        | 1      | 2014 | declaration_earliest | non-map-linked   |
| Muk Tai Street|沐泰街                                           | Muk Tai Street                                    | 沐泰街        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Muk Wo Street|沐和街                                            | Muk Wo Street                                     | 沐和街        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Muk Yuen Street|沐元街                                          | Muk Yuen Street                                   | 沐元街        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Museum Drive|博物館道                                            | Museum Drive                                      | 博物館道       | 1      | 2019 | declaration_earliest | non-map-linked   |
| Nation Street|禮信街                                            | Nation Street                                     | 禮信街        | 1      | 1960 | declaration_earliest | non-map-linked   |
| Nga Cheung Road|雅翔道                                          | Nga Cheung Road                                   | 雅翔道        | 1      |      | no_declaration_found | shadow-duplicate |
| Ngau Tau Kok Fifth Street|牛頭角第五街                             | Ngau Tau Kok Fifth Street                         | 牛頭角第五街     | 1      | 1970 | declaration_earliest | non-map-linked   |
| Ngau Tau Kok Fourth Street|牛頭角第四街                            | Ngau Tau Kok Fourth Street                        | 牛頭角第四街     | 1      | 1970 | declaration_earliest | non-map-linked   |
| Ngau Tau Kok Second Street|牛頭角第二街                            | Ngau Tau Kok Second Street                        | 牛頭角第二街     | 1      | 1970 | declaration_earliest | non-map-linked   |
| Ngau Tau Kok Third Street|牛頭角第三街                             | Ngau Tau Kok Third Street                         | 牛頭角第三街     | 1      | 1970 | declaration_earliest | non-map-linked   |
| Nightingale Road|南丁格爾路                                       | Nightingale Road                                  | 南丁格爾路      | 1      | 2008 | declaration_earliest | non-map-linked   |
| Ocean Drive|海洋徑                                              | Ocean Drive                                       | 海洋徑        | 1      | 2021 | declaration_earliest | non-map-linked   |
| On Lai Street|安麗街                                            | On Lai Street                                     | 安麗街        | 1      | 2003 | declaration_earliest | non-map-linked   |
| On Pik Road|安碧道                                              | On Pik Road                                       | 安碧道        | 1      | 2021 | declaration_earliest | non-map-linked   |
| On Sau Road|安秀道                                              | On Sau Road                                       | 安秀道        | 1      | 2014 | declaration_earliest | non-map-linked   |
| On Shun Path|安信徑                                             | On Shun Path                                      | 安信徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Pak Sha Wan Street|白沙灣街                                      | Pak Sha Wan Street                                | 白沙灣街       | 1      | 2018 | declaration_earliest | non-map-linked   |
| Pak Shing Kok Road|百勝角路                                      | Pak Shing Kok Road                                | 百勝角路       | 2      | 2015 | declaration_earliest | non-map-linked   |
| Peng Chau Ho King Street|坪洲好景街                               | Peng Chau Ho King Street                          | 坪洲好景街      | 1      | 2016 | declaration_earliest | non-map-linked   |
| Ping Ha Path|屏廈徑                                             | Ping Ha Path                                      | 屏廈徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Ping Kin Lane|屏健里                                            | Ping Kin Lane                                     | 屏健里        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Ping Shek Lane|坪石里                                           | Ping Shek Lane                                    | 坪石里        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Ping Yip Street|屏業街                                          | Ping Yip Street                                   | 屏業街        | 1      | 2026 | declaration_earliest | non-map-linked   |
| Po Min Path|坡面徑                                              | Po Min Path                                       | 坡面徑        | 1      | 2018 | declaration_earliest | non-map-linked   |
| Pok Chuen Path|博泉徑                                           | Pok Chuen Path                                    | 博泉徑        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Pok Chuen Street|博泉街                                         | Pok Chuen Street                                  | 博泉街        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Queen Elizabeth Hospital Path|伊利沙伯醫院徑                        | Queen Elizabeth Hospital Path                     | 伊利沙伯醫院徑    | 1      | 2008 | declaration_earliest | non-map-linked   |
| Queen Elizabeth Hospital Road|伊利沙伯醫院路                        | Queen Elizabeth Hospital Road                     | 伊利沙伯醫院路    | 1      | 2008 | declaration_earliest | non-map-linked   |
| Re S Ear Ch R O A D|研發路                                      | Re S Ear Ch R O A D                               | 研發路        | 1      | 2025 | declaration_earliest | non-map-linked   |
| S E Cond Sky Street|航天城第二街                                   | S E Cond Sky Street                               | 航天城第二街     | 1      | 2021 | declaration_earliest | non-map-linked   |
| Sai Ching Path|西菁徑                                           | Sai Ching Path                                    | 西菁徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Sai Kung Rural Committee Lane|西貢鄉事會里                         | Sai Kung Rural Committee Lane                     | 西貢鄉事會里     | 1      | 1992 | declaration_earliest | non-map-linked   |
| Sai Kwo Road|世歌路                                             | Sai Kwo Road                                      | 世歌路        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Sai Yu Path|西裕徑                                              | Sai Yu Path                                       | 西裕徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Sam Wo Road|三和路                                              | Sam Wo Road                                       | 三和路        | 1      | 2015 | declaration_earliest | non-map-linked   |
| San Chuk Street|新竹街                                          | San Chuk Street                                   | 新竹街        | 1      | 1998 | declaration_earliest | non-map-linked   |
| Sau Lai Street|秀麗街                                           | Sau Lai Street                                    | 秀麗街        | 1      | 1967 | declaration_earliest | non-map-linked   |
| Sau Mau Path|秀茂徑                                             | Sau Mau Path                                      | 秀茂徑        | 1      | 1967 | declaration_earliest | non-map-linked   |
| Sau Po Street|秀圃街                                            | Sau Po Street                                     | 秀圃街        | 1      | 1967 | declaration_earliest | non-map-linked   |
| School Road|學校路                                              | School Road                                       | 學校路        | 1      | 2011 | declaration_earliest | non-map-linked   |
| Sh E Ung Ho R O A D|上河路                                      | Sh E Ung Ho R O A D                               | 上河路        | 1      | 2026 | declaration_earliest | non-map-linked   |
| Shan Liu Road|山寮路                                            | Shan Liu Road                                     | 山寮路        | 1      | 1970 | declaration_earliest | non-map-linked   |
| Shek Po East Road|石埗東路                                       | Shek Po East Road                                 | 石埗東路       | 1      | 2020 | declaration_earliest | non-map-linked   |
| Shek Tin Road|石田路                                            | Shek Tin Road                                     | 石田路        | 1      | 2014 | declaration_earliest | non-map-linked   |
| Sheung Kin Street|常健街                                        | Sheung Kin Street                                 | 常健街        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Sheung Kok Shan Road|上角山路                                    | Sheung Kok Shan Road                              | 上角山路       | 1      | 2010 | declaration_earliest | non-map-linked   |
| Sheung Shing Lane|常盛里                                        | Sheung Shing Lane                                 | 常盛里        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Sheung Tak Street|尚德街                                        | Sheung Tak Street                                 | 尚德街        | 1      | 1963 | declaration_earliest | non-map-linked   |
| Sheung Yip Street|尚業街                                        | Sheung Yip Street                                 | 尚業街        | 1      | 2026 | declaration_earliest | non-map-linked   |
| Shin Lun Lane|善鄰里                                            | Shin Lun Lane                                     | 善鄰里        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shing Fung L A N E|承豐里                                       | Shing Fung L A N E                                | 承豐里        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Shing Kai Road|承啟道                                           | Shing Kai Road                                    | 承啟道        | 1      | 2017 | declaration_earliest | shadow-duplicate |
| Shing Shun Road|誠信路                                          | Shing Shun Road                                   | 誠信路        | 1      | 1970 | declaration_earliest | non-map-linked   |
| Shing Y A Us Treet|承佑街                                       | Shing Y A Us Treet                                | 承佑街        | 1      | 2023 | declaration_earliest | non-map-linked   |
| Shing Yan Lane|承恩里                                           | Shing Yan Lane                                    | 承恩里        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Shui Che Kwun Lane|水車館里                                      | Shui Che Kwun Lane                                | 水車館里       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shui Fu Road|水庫路                                             | Shui Fu Road                                      | 水庫路        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Shun Chit Road|順捷路                                           | Shun Chit Road                                    | 順捷路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Fai Road|順暉路                                            | Shun Fai Road                                     | 順暉路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Hang Road|順行路                                           | Shun Hang Road                                    | 順行路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Lin Road|順連路                                            | Shun Lin Road                                     | 順連路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Long Road|順朗路                                           | Shun Long Road                                    | 順朗路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Lui Road|順旅路                                            | Shun Lui Road                                     | 順旅路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Ming Road|順明路                                           | Shun Ming Road                                    | 順明路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Ngon Road|順岸路                                           | Shun Ngon Road                                    | 順岸路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Wan Road|順環路                                            | Shun Wan Road                                     | 順環路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shun Wui Road|順匯路                                            | Shun Wui Road                                     | 順匯路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Shung Shan Street|崇山街                                        | Shung Shan Street                                 | 崇山街        | 1      | 2018 | declaration_earliest | non-map-linked   |
| T Hi R D Sky Street|航天城第三街                                   | T Hi R D Sky Street                               | 航天城第三街     | 1      | 2021 | declaration_earliest | non-map-linked   |
| T In Wo R O A D|田禾路                                          | T In Wo R O A D                                   | 田禾路        | 1      | 2022 | declaration_earliest | non-map-linked   |
| T S E Ung L Am Highw A Y|將藍公路                                | T S E Ung L Am Highw A Y                          | 將藍公路       | 1      | 2022 | declaration_earliest | non-map-linked   |
| T Sz Lun R O A D|紫麟路                                         | T Sz Lun R O A D                                  | 紫麟路        | 1      | 2024 | declaration_earliest | non-map-linked   |
| T U E N Lok L A N E|屯樂里                                      | T U E N Lok L A N E                               | 屯樂里        | 1      | 2021 | declaration_earliest | non-map-linked   |
| Tai Ching Cheung Road|大蒸場路                                   | Tai Ching Cheung Road                             | 大蒸場路       | 1      | 2014 | declaration_earliest | non-map-linked   |
| Tai San Back Street|大新後街                                     | Tai San Back Street                               | 大新後街       | 1      | 2011 | declaration_earliest | non-map-linked   |
| Tai Shu Ha Road West|大樹下西路                                   | Tai Shu Ha Road West                              | 大樹下西路      | 1      | 2017 | declaration_earliest | non-map-linked   |
| Tai Tsoi Yuen Road|大菜園路                                      | Tai Tsoi Yuen Road                                | 大菜園路       | 1      | 2011 | declaration_earliest | non-map-linked   |
| Tak Wo Street|德和街                                            | Tak Wo Street                                     | 德和街        | 1      | 1967 | declaration_earliest | non-map-linked   |
| Tan Kwai Tsuen Lane|丹桂村里                                     | Tan Kwai Tsuen Lane                               | 丹桂村里       | 1      | 2015 | declaration_earliest | non-map-linked   |
| Tan Lai Street|丹荔街                                           | Tan Lai Street                                    | 丹荔街        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Tat Fuk Road|達福路                                             | Tat Fuk Road                                      | 達福路        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Tat Mei Road|達美路                                             | Tat Mei Road                                      | 達美路        | 1      | 2011 | declaration_earliest | non-map-linked   |
| Tin Chai Lane East|天際里東                                      | Tin Chai Lane East                                | 天際里東       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Tin Chai Lane West|天際里西                                      | Tin Chai Lane West                                | 天際里西       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Tin Shui Path|天瑞徑                                            | Tin Shui Path                                     | 天瑞徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Tin Wah Road|天華路                                             | Tin Wah Road                                      | 天華路        | 1      | 2013 | declaration_earliest | non-map-linked   |
| Tin Ying Path|天影徑                                            | Tin Ying Path                                     | 天影徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Ting Kok Road|汀角路                                            | Ting Kok Road                                     | 汀角路        | 1      | 1970 | declaration_earliest | non-map-linked   |
| Ting Yat Road|汀逸路                                            | Ting Yat Road                                     | 汀逸路        | 1      | 2010 | declaration_earliest | non-map-linked   |
| To Shek Path|多石徑                                             | To Shek Path                                      | 多石徑        | 1      | 2010 | declaration_earliest | non-map-linked   |
| To Shek Street|多石街                                           | To Shek Street                                    | 多石街        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Tong Hang Road|                                              | Tong Hang Road                                    |            | 1      | 1990 | declaration_earliest | shadow-duplicate |
| Toscana Drive|意濤徑                                            | Toscana Drive                                     | 意濤徑        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Tramway Lane|纜車里                                             | Tramway Lane                                      | 纜車里        | 1      | 2015 | declaration_earliest | non-map-linked   |
| Tsing Tin Interchange|青田交匯處                                  | Tsing Tin Interchange                             | 青田交匯處      | 1      | 2020 | declaration_earliest | non-map-linked   |
| Tsz Tin Road|                                                | Tsz Tin Road                                      |            | 1      | 1990 | declaration_earliest | shadow-duplicate |
| Tung Cheong Street|東昌街                                       | Tung Cheong Street                                | 東昌街        | 1      | 2020 | declaration_earliest | non-map-linked   |
| Tung Chung Road|東涌道                                          | Tung Chung Road                                   | 東涌道        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Tung Fuk Road|同福路                                            | Tung Fuk Road                                     | 同福路        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Tung Lei Path|東籬徑                                            | Tung Lei Path                                     | 東籬徑        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Tung Tsz Road|洞梓路                                            | Tung Tsz Road                                     | 洞梓路        | 1      | 1970 | declaration_earliest | non-map-linked   |
| Tung Wing Road|東榮路                                           | Tung Wing Road                                    | 東榮路        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Tung Yiu Road|東耀路                                            | Tung Yiu Road                                     | 東耀路        | 1      | 2019 | declaration_earliest | non-map-linked   |
| U Lam Terrace|儒林臺                                            | U Lam Terrace                                     | 儒林臺        | 2      | 2016 | declaration_earliest | non-map-linked   |
| Universal Gate Road|普門路                                      | Universal Gate Road                               | 普門路        | 1      | 2013 | declaration_earliest | non-map-linked   |
| Wai Yin Path|薈然徑                                             | Wai Yin Path                                      | 薈然徑        | 1      | 2015 | declaration_earliest | non-map-linked   |
| Wan King Street|環景街                                          | Wan King Street                                   | 環景街        | 1      | 1959 | declaration_earliest | non-map-linked   |
| Wan Lei Street|環利街                                           | Wan Lei Street                                    | 環利街        | 1      | 1959 | declaration_earliest | non-map-linked   |
| Wan Shun Street|環順街                                          | Wan Shun Street                                   | 環順街        | 1      | 1959 | declaration_earliest | non-map-linked   |
| Wang Ping Shan South Road|橫平山南路                              | Wang Ping Shan South Road                         | 橫平山南路      | 1      | 2010 | declaration_earliest | non-map-linked   |
| Wholesale Market Street|批發市場街                                | Wholesale Market Street                           | 批發市場街      | 1      | 2011 | declaration_earliest | non-map-linked   |
| Wo Lok L A N E|和樂里                                           | Wo Lok L A N E                                    | 和樂里        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Wong Kong Wai Road|黃崗圍路                                      | Wong Kong Wai Road                                | 黃崗圍路       | 1      | 2010 | declaration_earliest | non-map-linked   |
| Wui Man Road|匯民道                                             | Wui Man Road                                      | 匯民道        | 2      | 2009 | declaration_earliest | non-map-linked   |
| Wui T Ung Street|匯東街                                         | Wui T Ung Street                                  | 匯東街        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Wun Yiu Road|碗窰路                                             | Wun Yiu Road                                      | 碗窰路        | 1      | 2011 | declaration_earliest | non-map-linked   |
| Y A U M Ong L A N E|油旺里                                      | Y A U M Ong L A N E                               | 油旺里        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Yan Po Road|欣寶路                                              | Yan Po Road                                       | 欣寶路        | 1      | 2020 | declaration_earliest | non-map-linked   |
| Yau Ma Tei Interchange|油麻地交匯處                                | Yau Ma Tei Interchange                            | 油麻地交匯處     | 1      | 2017 | declaration_earliest | shadow-duplicate |
| Yee Ming Path|怡明徑                                            | Yee Ming Path                                     | 怡明徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Yeung Fan Lane North|揚帆里北                                    | Yeung Fan Lane North                              | 揚帆里北       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Yeung Fan Lane South|揚帆里南                                    | Yeung Fan Lane South                              | 揚帆里南       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Yi Tung Road|怡東路                                             | Yi Tung Road                                      | 怡東路        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Yin Kong Road|燕崗路                                            | Yin Kong Road                                     | 燕崗路        | 1      | 2010 | declaration_earliest | non-map-linked   |
| Ying Tung Road|迎東路                                           | Ying Tung Road                                    | 迎東路        | 2      | 2016 | declaration_earliest | non-map-linked   |
| Ying Wan Lane|迎運里                                            | Ying Wan Lane                                     | 迎運里        | 1      | 2011 | declaration_earliest | non-map-linked   |
| Yip Wong Road|業旺路                                            | Yip Wong Road                                     | 業旺路        | 1      | 2009 | declaration_earliest | non-map-linked   |
| Yiu Sha Road|耀沙路                                             | Yiu Sha Road                                      | 耀沙路        | 1      | 2019 | declaration_earliest | non-map-linked   |
| Yu Wing Path|裕榮徑                                             | Yu Wing Path                                      | 裕榮徑        | 1      | 2017 | declaration_earliest | non-map-linked   |
| Yuen Yeung Lane North|遠洋里北                                   | Yuen Yeung Lane North                             | 遠洋里北       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Yuen Yeung Lane South|遠洋里南                                   | Yuen Yeung Lane South                             | 遠洋里南       | 1      | 2017 | declaration_earliest | non-map-linked   |
| Yuk Tong Path|沃塘徑                                            | Yuk Tong Path                                     | 沃塘徑        | 1      | 2024 | declaration_earliest | non-map-linked   |
| Yung Ping Path|雍坪徑                                           | Yung Ping Path                                    | 雍坪徑        | 1      | 1984 | declaration_earliest | non-map-linked   |


