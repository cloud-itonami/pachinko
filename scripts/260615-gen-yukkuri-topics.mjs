#!/usr/bin/env node
// 260615: ゆっくりパチンコch 向けトピックカタログ生成
//
// pachinko 機種DB (resources/machines.jsonld) + 新台リスト (new-machines-ptown-extra.json)
// を種に、yukkuri.gftd.ai が消費する「構造化トピックカタログ」を生成する。
//
// 1 機種 = 1 primary topic (angle は機種プロファイルから決定的に選ぶ) + 月次ランキング topic。
// 各 topic は priorityScore と analytics メタを持ち、後段で
//   topicId ↔ video_id ↔ youtube_video_id ↔ 再生数
// を突き合わせて「どのお題が伸びたか」を分析できる形にする。
//
// Usage:
//   node scripts/260615-gen-yukkuri-topics.mjs [--today YYYY-MM-DD] [--limit N]
// Output:
//   data/topics/yukkuri-pachinko-topics.jsonld

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- args ----
const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const TODAY = argVal("--today", "2026-06-15");
const LIMIT = parseInt(argVal("--limit", "0"), 10); // 0 = no cap
const todayMs = new Date(`${TODAY}T00:00:00+09:00`).getTime();

// ---- load sources ----
const machinesPath = path.join(ROOT, "resources/machines.jsonld");
const machines = JSON.parse(fs.readFileSync(machinesPath, "utf8")).itemListElement.map(
  (e) => e.item,
);

// ---- angle templates ----
// 1 機種につき主アングルを 1 つ決定的に選ぶ (analyzable 1:1)。
const ANGLES = {
  "new-machine-intro": {
    label: "新台紹介",
    titleTpl: (m) => `【新台】${m.name} を3分でゆっくり解説｜スペック・ボーダー・狙い目`,
    topicTpl: (m) =>
      `パチンコ新台「${m.name}」(${m.maker})の紹介。タイプ=${m.type}, 大当り確率=1/${m.probabilityNormal}, ` +
      `RUSH突入率=${m.rushRate}%, 継続率=${m.rushContinueRate}%, 等価ボーダー=${m.borderEqual}回転/千円。` +
      `導入日=${m.releaseDate}。初見プレイヤーに「どんな機種か・どこが面白いか・甘いか辛いか」をゆっくり解説する。`,
    outlineTpl: (m) =>
      `導入: ${m.name}ってどんな台? / スペック: 確率・RUSH・継続率 / ボーダー: 等価${m.borderEqual} の意味 / ` +
      `立ち回り: 狙い目とやめどき / まとめ: ${m.difficulty}向け・${m.articleProfile?.theme ?? "総合"}`,
  },
  "border-guide": {
    label: "ボーダー解説",
    titleTpl: (m) => `【ボーダー解説】${m.name} 等価${m.borderEqual}回転の期待値をゆっくり計算`,
    topicTpl: (m) =>
      `「${m.name}」のボーダーライン解説。等価ボーダー=${m.borderEqual}回転/千円, 3.57円交換=${m.border357}。` +
      `回転数とボーダーの関係、期待値の出し方、1日打った時の期待収支(EV/千円≒${m.articleProfile?.scoreSummary?.expectedEVPer1000 ?? "?"}円)を` +
      `ゆっくり2人が初心者にも分かるよう計算しながら解説する。`,
    outlineTpl: (m) =>
      `導入: ボーダーって何? / 計算: 等価${m.borderEqual}の根拠 / 実戦: 回転数を数える / 期待値: プラスになる条件 / まとめ`,
  },
  "spec-review": {
    label: "スペック解説",
    titleTpl: (m) => `【スペック解説】${m.name} 大当り確率・RUSH・継続率をゆっくり丸わかり`,
    topicTpl: (m) =>
      `「${m.name}」(${m.maker})のスペック徹底解説。大当り確率=1/${m.probabilityNormal}, ` +
      `RUSH突入率=${m.rushRate}%, RUSH継続率=${m.rushContinueRate}%, 平均出玉=${m.avgPayoutRush}発。` +
      `スペックの読み方とこの台の強み・弱みをゆっくり解説する。リスク度=${m.riskScore}/100。`,
    outlineTpl: (m) =>
      `導入: スペック表の見方 / 確率: 1/${m.probabilityNormal}とは / RUSH: 突入と継続 / 出玉: 期待できる量 / まとめ: ${m.difficulty}`,
  },
  beginner: {
    label: "初心者向け",
    titleTpl: (m) => `【初心者向け】${m.name} で甘デジ入門｜低リスクで遊ぶコツをゆっくり解説`,
    topicTpl: (m) =>
      `パチンコ初心者向けに「${m.name}」(${m.maker})の遊び方を解説。${m.difficulty}・リスク度${m.riskScore}/100の` +
      `遊びやすい台で、予算管理・やめどき・無理しない立ち回りをゆっくり2人がやさしく解説する。`,
    outlineTpl: (m) =>
      `導入: 初心者でも大丈夫? / 台選び: なぜ${m.name} / 予算: 無理しない金額 / 立ち回り: やめどき / まとめ: 楽しむのが一番`,
  },
};

// ---- pick primary angle per machine (deterministic) ----
function pickAngle(m) {
  if (m.isNewMachine) return "new-machine-intro";
  if (m.difficulty === "初級") return "beginner";
  if (typeof m.borderEqual === "number" && m.borderEqual > 0) return "border-guide";
  return "spec-review";
}

// ---- priority score (0-100ish) ----
function recencyBonus(releaseDate) {
  if (!releaseDate) return 0;
  // releaseDate may be "2026-03-10" or "2026-05"
  const norm = releaseDate.length === 7 ? `${releaseDate}-01` : releaseDate;
  const t = new Date(`${norm}T00:00:00+09:00`).getTime();
  if (Number.isNaN(t)) return 0;
  const days = (todayMs - t) / 86400000;
  if (days < 0) return 40; // 未導入(予約)も話題性高
  if (days > 180) return 0;
  return Math.round(40 * (1 - days / 180));
}
function priorityScore(m) {
  const base = typeof m.recommendScore === "number" ? m.recommendScore : 50;
  const newBonus = m.isNewMachine ? 30 : 0;
  const rec = recencyBonus(m.releaseDate);
  return Math.min(100, Math.round(base * 0.5 + newBonus + rec * 0.5));
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- build per-machine topics ----
const topics = [];
for (const m of machines) {
  const angle = pickAngle(m);
  const tpl = ANGLES[angle];
  const machineSlug = m.slug || slugify(m.id || m.name);
  topics.push({
    "@type": "CreativeWork",
    topicId: `yk-pcn-${machineSlug}-${angle}`,
    status: "pending", // pending | composed | rendered | published
    angle,
    angleLabel: tpl.label,
    machineId: m.id,
    machineName: m.name,
    maker: m.maker,
    machineType: m.type,
    title: tpl.titleTpl(m),
    topic: tpl.topicTpl(m),
    outline: tpl.outlineTpl(m),
    tags: [
      "ゆっくり実況",
      "パチンコ",
      m.name,
      m.maker,
      tpl.label,
      ...(Array.isArray(m.tags) ? m.tags.slice(0, 4) : []),
    ],
    youtube: {
      categoryId: "20", // Gaming
      defaultLanguage: "ja",
      tags: [m.name, m.maker, "パチンコ", "ゆっくり解説", tpl.label],
    },
    analytics: {
      priorityScore: priorityScore(m),
      isNewMachine: !!m.isNewMachine,
      releaseDate: m.releaseDate ?? null,
      category: m.category ?? null,
      difficulty: m.difficulty ?? null,
      borderEqual: m.borderEqual ?? null,
      riskScore: m.riskScore ?? null,
      recommendScore: m.recommendScore ?? null,
      expectedEVPer1000: m.articleProfile?.scoreSummary?.expectedEVPer1000 ?? null,
      theme: m.articleProfile?.theme ?? null,
      targetKeyword: `${m.name} ${tpl.label}`,
      sourceUrl: m.sourceUrl ?? null,
    },
    // 後段で埋める (分析突き合わせ用キー)
    videoId: null,
    youtubeVideoId: null,
    publishedAt: null,
  });
}

// ---- monthly ranking topics (cross-machine) ----
const newMachines = machines
  .filter((m) => m.isNewMachine)
  .sort((a, b) => (b.recommendScore ?? 0) - (a.recommendScore ?? 0));
const top10 = newMachines.slice(0, 10);
if (top10.length >= 3) {
  const month = TODAY.slice(0, 7);
  topics.push({
    "@type": "CreativeWork",
    topicId: `yk-pcn-ranking-${month}`,
    status: "pending",
    angle: "ranking",
    angleLabel: "新台ランキング",
    machineId: null,
    machineName: null,
    maker: null,
    machineType: "mixed",
    title: `【${month}】パチンコ・パチスロ新台おすすめランキングTOP10をゆっくり解説`,
    topic:
      `${month}の注目新台ランキングTOP10をゆっくり2人が紹介。対象機種: ` +
      top10.map((m, i) => `${i + 1}位 ${m.name}(${m.maker})`).join(", ") +
      `。各台のスペック・ボーダー・狙い目を簡潔に比較し、タイプ別おすすめを最後にまとめる。`,
    outline:
      `導入: 今月の新台事情 / 10位〜4位を駆け足 / 3位〜1位をじっくり / タイプ別おすすめ(一撃/バランス/安定/初心者) / まとめ`,
    tags: ["ゆっくり実況", "パチンコ", "新台", "ランキング", month],
    youtube: {
      categoryId: "20",
      defaultLanguage: "ja",
      tags: ["パチンコ", "新台", "ランキング", "ゆっくり解説", month],
    },
    analytics: {
      priorityScore: 95, // ランキングは常に高優先
      isNewMachine: true,
      releaseDate: TODAY,
      category: "ranking",
      difficulty: null,
      machineIds: top10.map((m) => m.id),
      targetKeyword: `パチンコ 新台 ランキング ${month}`,
    },
    videoId: null,
    youtubeVideoId: null,
    publishedAt: null,
  });
}

// ---- sort by priority desc, optional cap ----
topics.sort((a, b) => (b.analytics.priorityScore ?? 0) - (a.analytics.priorityScore ?? 0));
const finalTopics = LIMIT > 0 ? topics.slice(0, LIMIT) : topics;

// ---- write catalog ----
const catalog = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Yukkuri Pachinko Topic Catalog",
  description:
    "ゆっくりパチンコch 向け動画お題カタログ。pachinko 機種DBから生成。topicId↔videoId↔youtubeVideoId で性能分析可能。",
  channel: "@ゆっくりパチンコch",
  channelId: "UCby4cwshBD3WBGIzHS_woSA",
  generatedAt: `${TODAY}T12:00:00+09:00`,
  sourceMachineCount: machines.length,
  topicCount: finalTopics.length,
  angles: Object.fromEntries(Object.entries(ANGLES).map(([k, v]) => [k, v.label])),
  itemListElement: finalTopics.map((t, i) => ({
    "@type": "ListItem",
    position: i + 1,
    item: t,
  })),
};

const outDir = path.join(ROOT, "data/topics");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "yukkuri-pachinko-topics.jsonld");
fs.writeFileSync(outPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

console.log(`✅ wrote ${finalTopics.length} topics → ${path.relative(ROOT, outPath)}`);
const byAngle = {};
for (const t of finalTopics) byAngle[t.angle] = (byAngle[t.angle] ?? 0) + 1;
console.log("   by angle:", JSON.stringify(byAngle));
console.log("   top 5 by priority:");
for (const t of finalTopics.slice(0, 5)) {
  console.log(`     [${t.analytics.priorityScore}] ${t.topicId}  ${t.title}`);
}
