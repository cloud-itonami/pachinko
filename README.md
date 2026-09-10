# pachinko — ゆっくりパチンコch のお題カタログ（データ repo）

**名乗り**: `pachinko` は主題名であって役割名ではない。ここに在るのは
**1 本の JSON-LD カタログ**で、YouTube チャンネル `@ゆっくりパチンコch` 向けの
「動画のお題（topic）」576 行を、パチンコ・パチスロの機種 DB から生成したもの。

**ここに無いもの**: 生成器・投稿パイプライン・actor・UI・テスト。
このカタログを**作った**コードも、これを**使う**コードも、この repo には入っていない。
`README.md.edn` が出所として
`orgs/gftdcojp/ai-gftd-apps-gftdcojp/60-apps/ai-gftd-project-pachinko` を記録しているが、
**その path はこの checkout からは辿れない**（west にこの名前の project は無い）。
つまりカタログの provenance は「記録は在るが未検証」である。

## 中身（commit 42e6199、実測 2026-09-03）

| path | 役割 | 備考 |
|---|---|---|
| `data/topics/yukkuri-pachinko-topics.jsonld` | **正本**。schema.org `ItemList` 形式のお題カタログ 576 行 | 1.3 MB |
| `README.md.edn` | この repo の来歴を datom 3 つで持つ | `edn-datomize.bb` の生成物 |
| `schema.edn` | `README.md.edn` の属性定義（`:readme/*` 3 件） | 同上・**手編集禁止** |
| `edn-datomize.bb` | EDN → tx-data 変換器 | babashka。下記「注意」参照 |
| `scripts/verify-catalog.kotoba` | カタログの形を検査する（nbb） | 0=clean / 1=違反 / 2=REFUSED |
| `docs/operator-quickstart.md` | 上を実際に踏む手順 | |

## カタログが言っていること — そして言っていないこと

- **576 行あるが、相異なる topicId は 531 しかない**（45 件が重複）。
  ヘッダの `topicCount: 576` は**行数**であって、お題の数ではない。
- **576 行すべてが `status: "pending"`**。`videoId` / `youtubeVideoId` /
  `publishedAt` は **1 行も埋まっていない**。
  → このカタログは**計画であって実績ではない**。ここから「N 本公開された」は読めない。
- 対象は 532 機種 / 56 メーカー、`pachinko` 362・`pachislot` 213・`mixed` 1。
- 切り口（`angle`）はヘッダで 4 つ宣言されているが、データは 5 つ使っている
  （`ranking` が未宣言）。

`generatedAt` は `2026-06-15T12:00:00+09:00`、`sourceMachineCount` は 575。
どちらも**カタログの自己申告**であって、この repo の中に裏付けとなる機種 DB は無い。

## 既知の欠陥（`scripts/verify-catalog.kotoba` が報告する）

1. `topicId-not-unique` — 45 件の topicId が 2 行ずつ在る（title も machineId も同一）。
   `topicId` を join key にする分析は、この 45 件を二重に数える。
2. `angle-not-declared` — `ranking` が `angles` に無い。

**どちらもここで手編集して塞がない。** カタログは生成物なので、
直すのは生成器の側で、ここを書き換えると次の再生成で戻る。
検査だけをここに置いて、状態が変わったら緑になるようにしてある。

## 使い方

`docs/operator-quickstart.md` に、この repo で実際に踏める 8 手順が在る
（すべて実行して出力を突き合わせてある）。

## 注意

- `schema.edn` と `README.md.edn` は `edn-datomize.bb` の生成物。手編集しない。
- `README.md.edn` の `:readme/name` は `"ai-gftd-pachinko"` のままで、
  **現在の repo 名 `pachinko` と食い違っている**（split 前の名前）。
- `edn-datomize.bb` は babashka スクリプト。このワークスペースは script host を
  nbb に寄せている（ADR-2607173000）ので、**新しいスクリプトは nbb で書く**。
  既存の `.bb` はその決定より前のもので、置き換えの予定は立っていない。
