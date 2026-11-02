// 基準の音（ラ4）の高さを、アプリ全体で共有するためのファイル
// ファイル名の最後を「.svelte.js」にすると、ふつうの .js ファイルの中でも $state が使える。
// $state に入れた値は、変わったときに、その値を使って計算している画面の表示が自動で更新される。

// ===== 基準の音に関する設定値 =====

// 選べる範囲の、一番低い値と一番高い値（Hz）
export const REFERENCE_FREQUENCY_MIN = 436;
export const REFERENCE_FREQUENCY_MAX = 446;

// 最初の設定（Hz）
export const DEFAULT_REFERENCE_FREQUENCY = 442;

// 今の基準の音（ラ4）の周波数（Hz）
// 入れ物（オブジェクト）の中に入れてあるのは、ほかのファイルから読んでも、値の変化が画面に伝わるようにするため
const reference = $state({ frequency: DEFAULT_REFERENCE_FREQUENCY });

/**
 * 基準の音として使える値に直す関数
 * 整数に丸めて、選べる範囲からはみ出しているときは、端の値にする。
 * 数ではないもの（保存した内容が壊れていたときなど）は、最初の設定にする。
 * @param {number} frequency - 直したい周波数（Hz）
 * @returns {number} 基準の音として使える周波数（Hz）
 */
export function normalizeReferenceFrequency(frequency) {
  // Number.isFinite は、ふつうの数のときだけ true になる（文字や NaN のときは false）
  if (!Number.isFinite(frequency)) {
    return DEFAULT_REFERENCE_FREQUENCY;
  }

  // 整数に丸めてから、範囲の中に収める
  const rounded = Math.round(frequency);
  return Math.min(REFERENCE_FREQUENCY_MAX, Math.max(REFERENCE_FREQUENCY_MIN, rounded));
}

/**
 * 今の基準の音（ラ4）の周波数を返す関数
 * 音の高さを計算するところは、すべてこの関数から基準の音を受け取る。
 * @returns {number} 基準の音の周波数（Hz）
 */
export function getReferenceFrequency() {
  return reference.frequency;
}

/**
 * 基準の音（ラ4）の周波数を変える関数
 * 変えると、この値を使って計算している画面の表示が、自動で更新される。
 * @param {number} frequency - 新しい周波数（Hz）。使えない値は、使える値に直してから入れる
 */
export function setReferenceFrequency(frequency) {
  reference.frequency = normalizeReferenceFrequency(frequency);
}
