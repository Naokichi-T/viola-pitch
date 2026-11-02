// 今の基準音（ラ4）の周波数を返す関数を読み込む
import { getReferenceFrequency } from "./reference.svelte.js";

// ===== 音名の計算のための設定値 =====

// 基準音（ラ4）の音番号。
// 音番号は、半音ごとに1ずつ増える通し番号のこと（ド4が60、ラ4が69と決まっている）
const REFERENCE_NOTE_NUMBER = 69;

// 1オクターブの中の12個の音名（ドから半音ずつ順に並べたもの）
const NOTE_NAMES = ["ド", "ド♯", "レ", "レ♯", "ミ", "ファ", "ファ♯", "ソ", "ソ♯", "ラ", "ラ♯", "シ"];

/**
 * 周波数から、一番近い音名とズレ（セント）を計算する関数
 * 基準音（ラ4＝442Hz）から半音いくつ分離れているかを求めて、音名とズレを決める。
 * ズレは平均律を基準に計算する。
 * @param {number} frequency - 周波数（Hz）
 * @returns {{name: string, octave: number, cents: number}}
 *   name：音名（例：'ラ'）、octave：オクターブ（例：4）、
 *   cents：一番近い音からのズレ（-50 〜 +50。プラスは高い、マイナスは低い）
 */
export function frequencyToNote(frequency) {
  // 基準音から半音いくつ分離れているかを計算する（小数になる）
  // 周波数が2倍になると1オクターブ（半音12個分）上がるので、log2 を使う
  const semitonesFromReference = 12 * Math.log2(frequency / getReferenceFrequency());

  // 一番近い整数に丸める（これが「一番近い音」までの半音の数になる）
  const nearestSemitones = Math.round(semitonesFromReference);

  // 丸める前と後の差を100倍すると、ズレ（セント）になる（半音1個分が100セント）
  const cents = (semitonesFromReference - nearestSemitones) * 100;

  // 一番近い音の音番号を求める
  const noteNumber = REFERENCE_NOTE_NUMBER + nearestSemitones;

  // 音番号を12で割った余りから、音名を決める（0がド、9がラ）
  // 余りがマイナスにならないように、12を足してからもう一度余りを取る
  const nameIndex = ((noteNumber % 12) + 12) % 12;

  // 音番号を12で割った商から、オクターブを決める（音番号60〜71がオクターブ4）
  const octave = Math.floor(noteNumber / 12) - 1;

  return {
    name: NOTE_NAMES[nameIndex],
    octave: octave,
    cents: cents,
  };
}

/**
 * ズレ（セント）を、表示用の文字列に変換する関数
 * 整数に丸めて、プラスのときは「+」、マイナスのときは「−」を付ける。
 * @param {number} cents - ズレ（セント）
 * @returns {string} 表示用の文字列（例：'+3'、'−8'、'±0'）
 */
export function formatCents(cents) {
  // 小数点以下を四捨五入して整数にする
  const rounded = Math.round(cents);

  if (rounded > 0) {
    // 高いとき：先頭に「+」を付ける
    return "+" + rounded;
  } else if (rounded < 0) {
    // 低いとき：先頭に「−」を付ける（Math.abs でマイナスを外した数字にしてから付ける）
    return "−" + Math.abs(rounded);
  } else {
    // ぴったりのとき
    return "±0";
  }
}
