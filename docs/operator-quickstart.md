# operator quickstart — pachinko

この repo で**実際に踏める**手順。下の出力はすべて
commit `42e6199` に対して 2026-09-03 に実行した実測値で、
`nbb` は Node 上の ClojureScript script host（このワークスペースの標準）。

すべてリポジトリのルートで実行する。**依存の導入は要らない** ——
`nbb` 以外に必要なものは無く、`npm install` する `package.json` も無い。

---

## 1. 何が入っているかを見る

```bash
git ls-files
```

```
.gitignore
README.md
README.md.edn
data/topics/yukkuri-pachinko-topics.jsonld
docs/operator-quickstart.md
edn-datomize.bb
schema.edn
scripts/verify-catalog.cljs
```

`data/topics/*.jsonld` が正本で、残りは来歴・検査・変換器。

## 2. カタログの形を検査する（この repo の gate）

```bash
nbb scripts/verify-catalog.cljs > /tmp/pachinko-verify.out; echo "EXIT=$?"; cat /tmp/pachinko-verify.out
```

```
EXIT=1
SCANNED	576	data/topics/yukkuri-pachinko-topics.jsonld
FINDING	topicId-not-unique	45 件の topicId が重複 （行 576 / 相異なる 531）: yk-pcn-p-daiku-gentaro-light-new-machine-intro, yk-pcn-p-eureka-ao-border-guide, yk-pcn-p-garo-gekkou-border-guide … 他 42 件
FINDING	angle-not-declared	angles に無い angle が使われている: ranking
FINDINGS	2
```

**いま赤いのが正しい状態**（README の「既知の欠陥」）。

終了値は 3 値で、`0` = 検査して違反 0、`1` = 検査して違反あり、
`2` = **REFUSED（検査を実行できなかった）**。2 を 0 や 1 と混ぜないのは、
「測れなかった」が「測って問題が無かった」と同じ顔をしないようにするため。

> ⚠ 上のように**先にファイルへ落としてから `$?` を採る**。
> `nbb … | tail` と書くと `$?` は `tail` の終了値になり、検査の結果を一度も見ない。

## 3. 検査が両方向に振れることを自分で確かめる

落ちない検査も、緑にならない検査も、同じだけ無内容なので、
初めて使うときに 1 度だけこれを踏む。

```bash
# (a) 重複を落として ranking を宣言した写しを作る（正本には触らない）
nbb -e '
(ns f (:require ["fs" :as fs]))
(def m (js->clj (js/JSON.parse (fs/readFileSync "data/topics/yukkuri-pachinko-topics.jsonld" "utf8")) :keywordize-keys true))
(def seen (atom #{}))
(def kept (vec (keep (fn [e] (let [id (get-in e [:item :topicId])]
                               (when-not (@seen id) (swap! seen conj id) e))) (:itemListElement m))))
(fs/writeFileSync "/tmp/catalog-clean.jsonld"
  (js/JSON.stringify (clj->js (-> m
                                  (assoc :angles (assoc (:angles m) :ranking "新台ランキング"))
                                  (assoc :itemListElement (vec (map-indexed (fn [i e] (assoc e :position (inc i))) kept)))
                                  (assoc :topicCount (count kept)))) nil 2))
(println "wrote" (count kept) "rows")'

# (b) その写しに当てる → 緑
nbb scripts/verify-catalog.cljs /tmp/catalog-clean.jsonld > /tmp/a.out; echo "EXIT=$?"; cat /tmp/a.out

# (c) 無いファイルに当てる → REFUSED
nbb scripts/verify-catalog.cljs /tmp/does-not-exist.jsonld > /tmp/b.out; echo "EXIT=$?"; cat /tmp/b.out
```

```
wrote 531 rows
EXIT=0
SCANNED	531	/tmp/catalog-clean.jsonld
FINDINGS	0
EXIT=2
REFUSED	/tmp/does-not-exist.jsonld が読めない: ENOENT: no such file or directory, open '/tmp/does-not-exist.jsonld'
```

## 4. カタログの見出しを読む

```bash
nbb -e '
(ns a (:require ["fs" :as fs]))
(def j (js->clj (js/JSON.parse (fs/readFileSync "data/topics/yukkuri-pachinko-topics.jsonld" "utf8")) :keywordize-keys true))
(doseq [k [:name :channel :channelId :generatedAt :sourceMachineCount :topicCount]]
  (println (str (name k) "\t" (pr-str (get j k)))))'
```

```
name	"Yukkuri Pachinko Topic Catalog"
channel	"@ゆっくりパチンコch"
channelId	"UCby4cwshBD3WBGIzHS_woSA"
generatedAt	"2026-06-15T12:00:00+09:00"
sourceMachineCount	575
topicCount	576
```

**全部カタログの自己申告**であって、裏付けはこの repo の中に無い
（機種 DB も生成器も入っていない）。`topicCount` は行数で、相異なるお題の数ではない。

## 5. 内訳を数える

```bash
nbb -e '
(ns a (:require ["fs" :as fs]))
(def items (mapv :item (:itemListElement (js->clj (js/JSON.parse (fs/readFileSync "data/topics/yukkuri-pachinko-topics.jsonld" "utf8")) :keywordize-keys true))))
(println "status" (pr-str (into (sorted-map) (frequencies (map :status items)))))
(println "angle" (pr-str (into (sorted-map) (frequencies (map :angle items)))))
(println "machineType" (pr-str (into (sorted-map) (frequencies (map :machineType items)))))
(println "distinct-machineId" (count (disj (set (map :machineId items)) nil)))
(println "distinct-maker" (count (disj (set (map :maker items)) nil)))'
```

```
status {"pending" 576}
angle {"beginner" 48, "border-guide" 33, "new-machine-intro" 410, "ranking" 1, "spec-review" 84}
machineType {"mixed" 1, "pachinko" 362, "pachislot" 213}
distinct-machineId 532
distinct-maker 56
```

## 6. 公開パイプラインの現在地を見る

```bash
nbb -e '
(ns a (:require ["fs" :as fs]))
(def items (mapv :item (:itemListElement (js->clj (js/JSON.parse (fs/readFileSync "data/topics/yukkuri-pachinko-topics.jsonld" "utf8")) :keywordize-keys true))))
(doseq [k [:videoId :youtubeVideoId :publishedAt]]
  (println (str (name k) " が埋まっている行\t" (count (remove nil? (map k items))) " / " (count items))))'
```

```
videoId が埋まっている行	0 / 576
youtubeVideoId が埋まっている行	0 / 576
publishedAt が埋まっている行	0 / 576
```

**1 本も公開されていない。** カタログの description は
「topicId↔videoId↔youtubeVideoId で性能分析可能」と書いているが、
右側 2 つが空なので、いま引ける join は無い。

## 7. datom 面が読めることを確かめる

```bash
nbb -e '
(ns a (:require ["fs" :as fs] [clojure.edn :as edn] [clojure.string :as str]))
(let [tx (edn/read-string (fs/readFileSync "README.md.edn" "utf8"))
      sc (edn/read-string (fs/readFileSync "schema.edn" "utf8"))]
  (println (str "README.md.edn\ttx-data=" (and (vector? tx) (every? #(contains? % :db/id) tx))
                "\tentities=" (count tx)))
  (println (str "schema.edn\tattr-defs=" (and (vector? sc) (every? #(contains? % :db/ident) sc))
                "\tattributes=" (count sc)))
  (println (str "attrs\t" (str/join " " (map (comp str :db/ident) sc))))
  (println (str "README entity\t" (pr-str (dissoc (first tx) :db/id)))))'
```

```
README.md.edn	tx-data=true	entities=1
schema.edn	attr-defs=true	attributes=3
attrs	:readme/name :readme/note :readme/source
README entity	#:readme{:name "ai-gftd-pachinko", :source "orgs/gftdcojp/ai-gftd-apps-gftdcojp/60-apps/ai-gftd-project-pachinko", :note "Split from ai-gftd-apps-gftdcojp for west-managed project ownership."}
```

`:readme/name` が `"ai-gftd-pachinko"` なのは split 前の名前で、
**現在の repo 名 `pachinko` と食い違っている**。

## 8. 片付ける

```bash
rm -f /tmp/catalog-clean.jsonld /tmp/pachinko-verify.out /tmp/a.out /tmp/b.out
```

---

## この手順が答えないこと

- **カタログの中身が正しいか**は答えない。検査するのは*形*（重複・連番・
  宣言と使用の一致・必須キー）だけで、「この機種のボーダーが正しいか」は見ていない。
- **生成器がどこに在るか**は答えない。`README.md.edn` が記録している出所は
  west に登録が無く、この checkout からは辿れない（未検証の provenance）。
- `edn-datomize.bb` の再実行手順は書いていない。babashka スクリプトで、
  このワークスペースは script host を nbb に寄せている（ADR-2607173000）ため、
  **新しい手順をこの `.bb` の上に積まない**。
