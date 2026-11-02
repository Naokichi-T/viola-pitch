// 基準の音の最初の設定と、使える値に直す関数を読み込む
import { DEFAULT_REFERENCE_FREQUENCY, normalizeReferenceFrequency } from "./reference.svelte.js";

// 音律の一覧と、最初の設定を読み込む
import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID } from "./tuning.js";

// 音が登録できる音域に入っているかを調べる関数を読み込む（保存された楽譜の確認に使う）
import { isInRange } from "./score.js";

// 判定のレベルの一覧と、最初の設定を読み込む
import { LEVELS, DEFAULT_LEVEL_ID } from "./level.js";

// ===== ブラウザに設定を保存するための設定値 =====

// 音律を保存するときの名前（localStorage の中で、この名前を付けて保存する）
// ほかのサイトやアプリの保存データと区別できるように、先頭にアプリの名前を付けている
const TEMPERAMENT_STORAGE_KEY = "viola-pitch:temperament";

// 「音を入れたとき・選んだときに音を鳴らすかどうか」を保存するときの名前
const SOUND_ENABLED_STORAGE_KEY = "viola-pitch:sound-enabled";

// 作業中の楽譜（調・テンポ・音の並び）を保存するときの名前
const CURRENT_SCORE_STORAGE_KEY = "viola-pitch:current-score";

// 「練習で音を通過したときに、合図の音を鳴らすかどうか」を保存するときの名前
const CHIME_ENABLED_STORAGE_KEY = "viola-pitch:chime-enabled";

// 判定のレベル（ノーマル・イージー）を保存するときの名前
const LEVEL_STORAGE_KEY = "viola-pitch:level";

// 「じっくり」で音程を外したとき、弾き終わりに正しい音（目標の音）を鳴らすかどうかを保存するときの名前（外したら正しい音を鳴らす）
const MISS_TONE_ENABLED_STORAGE_KEY = "viola-pitch:miss-tone-enabled";

/**
 * 最後に選んだ音律の id を、ブラウザから読み込む関数
 * 保存されていないときや、読み込めないときは、最初の設定（DEFAULT_TEMPERAMENT_ID）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {string} 音律の id（'just'・'pythagorean'・'equal'）
 */
export function loadTemperamentId() {
  try {
    // 保存されている値を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(TEMPERAMENT_STORAGE_KEY);

    // 保存されていた値が、今の音律の一覧にあるものかを確認する
    // （一覧にない値がそのまま使われてしまうのを防ぐため）
    const isValid = TEMPERAMENTS.some((temperament) => temperament.id === saved);
    if (isValid) {
      return saved;
    }
  } catch (error) {
    // ブラウザの設定によっては、保存領域を使えずにエラーになることがある
    // そのときは何もせず、下で最初の設定を返す
  }

  // 保存されていないとき、正しくない値のとき、読み込めなかったとき
  return DEFAULT_TEMPERAMENT_ID;
}

/**
 * 選んだ音律の id を、ブラウザに保存する関数
 * 保存しておくと、次にページを開いたときも同じ音律から始められる。
 * @param {string} id - 音律の id（'just'・'pythagorean'・'equal'）
 */
export function saveTemperamentId(id) {
  try {
    localStorage.setItem(TEMPERAMENT_STORAGE_KEY, id);
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 「音を入れたとき・選んだときに音を鳴らすかどうか」を、ブラウザから読み込む関数
 * 保存されていないときや、読み込めないときは、「鳴らす」（true）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {boolean} 鳴らすなら true、鳴らさないなら false
 */
export function loadSoundEnabled() {
  try {
    // 保存されている値を取り出す（保存されていないときは null が入る）
    // localStorage には文字しか保存できないので、'true' か 'false' という文字で入っている
    const saved = localStorage.getItem(SOUND_ENABLED_STORAGE_KEY);

    // 'false' と保存されているときだけ「鳴らさない」にする
    if (saved === "false") {
      return false;
    }
  } catch (error) {
    // 保存領域を使えないときは何もせず、下で「鳴らす」を返す
  }

  // 保存されていないとき、'true' のとき、読み込めなかったとき
  return true;
}

/**
 * 「音を入れたとき・選んだときに音を鳴らすかどうか」を、ブラウザに保存する関数
 * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
 */
export function saveSoundEnabled(enabled) {
  try {
    // true・false を、'true'・'false' という文字に直して保存する
    localStorage.setItem(SOUND_ENABLED_STORAGE_KEY, String(enabled));
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 作業中の楽譜を、ブラウザに保存する関数
 * 保存しておくと、ページを再読み込みしたときや、練習ページを開いたときに、同じ楽譜を使える。
 * @param {{keyId: string, tempo: number, notes: Array, savedId: string|null, name: string}} score - 楽譜のデータ
 *   keyId：調の id、tempo：テンポ、notes：音のデータの配列、
 *   savedId：保存した楽譜のどれを開いているか（その id。まだ名前を付けて保存していないときは null）、
 *   name：楽譜の名前（まだ名前を付けて保存していないときは空の文字）
 */
export function saveCurrentScore(score) {
  try {
    // localStorage には文字しか保存できないので、楽譜のデータを JSON という形式の文字に直す
    // 例：{"keyId":"A-dur","tempo":60,"notes":[{"step":5,"accidental":0,"octave":4}]}
    localStorage.setItem(CURRENT_SCORE_STORAGE_KEY, JSON.stringify(score));
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 保存されたデータが、正しい音のデータかどうかを調べる関数
 * 保存領域の中身が壊れていた場合に、おかしなデータを楽譜に入れてしまうのを防ぐ。
 * @param {any} note - 調べるデータ
 * @returns {boolean} 正しい音のデータなら true
 */
function isValidNote(note) {
  // オブジェクトでないもの（null、数字、文字など）は、音のデータではない
  if (typeof note !== "object" || note === null) {
    return false;
  }

  // 音名の番号は 0〜6 の整数、変化記号は -1・0・1 のどれか、オクターブは整数であること
  const isStepValid = Number.isInteger(note.step) && note.step >= 0 && note.step <= 6;
  const isAccidentalValid = note.accidental === -1 || note.accidental === 0 || note.accidental === 1;
  const isOctaveValid = Number.isInteger(note.octave);
  if (!isStepValid || !isAccidentalValid || !isOctaveValid) {
    return false;
  }

  // 登録できる音域（ド3〜ミ6）に入っていること
  return isInRange(note);
}

/**
 * 作業中の楽譜を、ブラウザから読み込む関数
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {{keyId: string, tempo: number, notes: Array, savedId: string|null, name: string}|null}
 *   楽譜のデータ。保存されていないときや、読み込めないときは null
 */
export function loadCurrentScore() {
  try {
    // 保存されている文字を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(CURRENT_SCORE_STORAGE_KEY);
    if (saved === null) {
      return null;
    }

    // JSON の文字を、元のデータの形に戻す
    const score = JSON.parse(saved);

    // 楽譜のデータとして形が正しいかを確認する
    const isShapeValid = typeof score === "object" && score !== null && typeof score.keyId === "string" && typeof score.tempo === "number" && Array.isArray(score.notes);
    if (!isShapeValid) {
      return null;
    }

    // 正しい音のデータだけを残して返す
    // それぞれの音は、必要な3つの値だけを取り出した新しいデータにする
    return {
      keyId: score.keyId,
      tempo: score.tempo,
      notes: score.notes.filter(isValidNote).map((note) => ({
        step: note.step,
        accidental: note.accidental,
        octave: note.octave,
      })),
      // 保存した楽譜のどれを開いているか（文字で入っていないときは、まだ保存していないものとして null にする）
      savedId: typeof score.savedId === "string" ? score.savedId : null,
      // 楽譜の名前（文字で入っていないときは、空の文字にする）
      name: typeof score.name === "string" ? score.name : "",
    };
  } catch (error) {
    // 保存領域を使えないときや、保存された文字が壊れていて戻せないとき
    return null;
  }
}

/**
 * 「練習で音を通過したときに、合図の音を鳴らすかどうか」を、ブラウザから読み込む関数
 * 保存されていないときや、読み込めないときは、「鳴らす」（true）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {boolean} 鳴らすなら true、鳴らさないなら false
 */
export function loadChimeEnabled() {
  try {
    // 保存されている値を取り出す（'true' か 'false' という文字で入っている）
    const saved = localStorage.getItem(CHIME_ENABLED_STORAGE_KEY);

    // 'false' と保存されているときだけ「鳴らさない」にする
    if (saved === "false") {
      return false;
    }
  } catch (error) {
    // 保存領域を使えないときは何もせず、下で「鳴らす」を返す
  }

  // 保存されていないとき、'true' のとき、読み込めなかったとき
  return true;
}

/**
 * 「練習で音を通過したときに、合図の音を鳴らすかどうか」を、ブラウザに保存する関数
 * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
 */
export function saveChimeEnabled(enabled) {
  try {
    // true・false を、'true'・'false' という文字に直して保存する
    localStorage.setItem(CHIME_ENABLED_STORAGE_KEY, String(enabled));
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 「じっくり」で音程を外したとき、弾き終わりに正しい音（目標の音）を鳴らすかどうかを、ブラウザから読み込む関数（外したら正しい音を鳴らす）
 * 保存されていないときや、読み込めないときは、「鳴らす」（true）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {boolean} 鳴らすなら true、鳴らさないなら false
 */
export function loadMissToneEnabled() {
  try {
    // 保存されている値を取り出す（'true' か 'false' という文字で入っている）
    const saved = localStorage.getItem(MISS_TONE_ENABLED_STORAGE_KEY);

    // 'false' と保存されているときだけ「鳴らさない」にする
    if (saved === "false") {
      return false;
    }
  } catch (error) {
    // 保存領域を使えないときは何もせず、下で「鳴らす」を返す
  }

  // 保存されていないとき、'true' のとき、読み込めなかったとき
  return true;
}

/**
 * 「じっくり」で音程を外したとき、弾き終わりに正しい音を鳴らすかどうかを、ブラウザに保存する関数（外したら正しい音を鳴らす）
 * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
 */
export function saveMissToneEnabled(enabled) {
  try {
    // true・false を、'true'・'false' という文字に直して保存する
    localStorage.setItem(MISS_TONE_ENABLED_STORAGE_KEY, String(enabled));
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

/**
 * 最後に選んだ判定のレベルの id を、ブラウザから読み込む関数
 * 保存されていないときや、読み込めないときは、最初の設定（DEFAULT_LEVEL_ID）を返す。
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {string} レベルの id（'normal'・'easy'）
 */
export function loadLevelId() {
  try {
    // 保存されている値を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(LEVEL_STORAGE_KEY);

    // 保存されていた値が、今のレベルの一覧にあるものかを確認する
    const isValid = LEVELS.some((level) => level.id === saved);
    if (isValid) {
      return saved;
    }
  } catch (error) {
    // 保存領域を使えないときは何もせず、下で最初の設定を返す
  }

  // 保存されていないとき、正しくない値のとき、読み込めなかったとき
  return DEFAULT_LEVEL_ID;
}

/**
 * 選んだ判定のレベルの id を、ブラウザに保存する関数
 * @param {string} id - レベルの id（'normal'・'easy'）
 */
export function saveLevelId(id) {
  try {
    localStorage.setItem(LEVEL_STORAGE_KEY, id);
  } catch (error) {
    // 保存領域を使えないときは、保存をあきらめる（アプリはそのまま使える）
  }
}

// ===== 「通し」モードのカウントの拍の数 =====

// カウントの拍の数を保存するときの名前（キー）
const COUNT_IN_BEATS_KEY = "viola-pitch:countInBeats";

/**
 * 保存しておいたカウントの拍の数を読み込む関数
 * @returns {number|null} 保存してあった拍の数。保存していないとき・数字として読めないときは null
 */
export function loadCountInBeats() {
  // ブラウザの保存場所から、文字として取り出す（保存していないときは null が返る）
  const text = localStorage.getItem(COUNT_IN_BEATS_KEY);

  // 保存していないときは null を返す
  if (text === null) {
    return null;
  }

  // 文字を数字に変える
  const value = Number(text);

  // 整数として読めないとき（保存した内容がおかしいとき）は null を返す
  if (!Number.isInteger(value)) {
    return null;
  }

  return value;
}

/**
 * カウントの拍の数をブラウザに保存する関数
 * @param {number} value - カウントの拍の数
 */
export function saveCountInBeats(value) {
  // ブラウザの保存場所には文字しか入れられないので、数字を文字に変えて保存する
  localStorage.setItem(COUNT_IN_BEATS_KEY, String(value));
}

// ===== 「開放弦の高さで弾いた音もOKにする」設定 =====

// 開放弦の設定を保存するときの名前（キー）
const OPEN_STRING_ENABLED_KEY = "viola-pitch:openStringEnabled";

/**
 * 保存しておいた「開放弦の高さで弾いた音もOKにする」設定を読み込む関数
 * @returns {boolean} true：OKにする、false：しない。保存していないときは true（最初はオン）
 */
export function loadOpenStringEnabled() {
  // ブラウザの保存場所から、文字として取り出す（保存していないときは null が返る）
  const text = localStorage.getItem(OPEN_STRING_ENABLED_KEY);

  // 「false」と保存してあるときだけオフにする。保存していないときや、それ以外の内容のときはオン
  return text !== "false";
}

/**
 * 「開放弦の高さで弾いた音もOKにする」設定をブラウザに保存する関数
 * @param {boolean} enabled - true：OKにする、false：しない
 */
export function saveOpenStringEnabled(enabled) {
  // ブラウザの保存場所には文字しか入れられないので、「true」か「false」の文字に変えて保存する
  localStorage.setItem(OPEN_STRING_ENABLED_KEY, String(enabled));
}

// ===== 練習のモード（じっくり・通し） =====

// 練習のモードを保存するときの名前（キー）
const MODE_ID_KEY = "viola-pitch:modeId";

/**
 * 保存しておいた練習のモードを読み込む関数
 * @returns {string} モードの id（'step'：じっくり、'run'：通し）。保存していないとき・知らない値のときは 'step'
 */
export function loadModeId() {
  // ブラウザの保存場所から、文字として取り出す（保存していないときは null が返る）
  const text = localStorage.getItem(MODE_ID_KEY);

  // 「通し」と保存してあるときだけ「通し」にする。それ以外は「じっくり」
  return text === "run" ? "run" : "step";
}

/**
 * 練習のモードをブラウザに保存する関数
 * @param {string} id - モードの id（'step'：じっくり、'run'：通し）
 */
export function saveModeId(id) {
  localStorage.setItem(MODE_ID_KEY, id);
}

// ===== 基準の音（ラ4 の高さ） =====

// 基準の音を保存するときの名前（キー）
const REFERENCE_FREQUENCY_KEY = "viola-pitch:referenceFrequency";

/**
 * 保存しておいた基準の音（ラ4 の周波数）を読み込む関数
 * @returns {number} 周波数（Hz）。保存していないとき・使えない値のときは、最初の設定（442）
 */
export function loadReferenceFrequency() {
  // ブラウザの保存場所から、文字として取り出す（保存していないときは null が返る）
  const text = localStorage.getItem(REFERENCE_FREQUENCY_KEY);

  // 保存していないときは、最初の設定にする
  if (text === null) {
    return DEFAULT_REFERENCE_FREQUENCY;
  }

  // 文字を数に変えて、使える値（範囲の中の整数）に直す
  return normalizeReferenceFrequency(Number(text));
}

/**
 * 基準の音（ラ4 の周波数）をブラウザに保存する関数
 * @param {number} frequency - 周波数（Hz）
 */
export function saveReferenceFrequency(frequency) {
  // ブラウザの保存場所には文字しか入れられないので、文字に変えて保存する
  localStorage.setItem(REFERENCE_FREQUENCY_KEY, String(frequency));
}

// ===== メトロノームのテンポと拍子 =====

// メトロノームのテンポを保存するときの名前（キー）
const METRONOME_TEMPO_KEY = "viola-pitch:metronomeTempo";

/**
 * 保存しておいたメトロノームのテンポを読み込む関数
 * @param {number} min - 使えるテンポの一番遅い値
 * @param {number} max - 使えるテンポの一番速い値
 * @param {number} defaultTempo - 保存していないとき・使えない値のときに返すテンポ
 * @returns {number} テンポ（1分間の拍の数）
 */
export function loadMetronomeTempo(min, max, defaultTempo) {
  // ブラウザの保存場所から、文字として取り出す（保存していないときは null が返る）
  const text = localStorage.getItem(METRONOME_TEMPO_KEY);

  // 保存していないとき
  if (text === null) {
    return defaultTempo;
  }

  // 文字を数に変える
  const tempo = Number(text);

  // 整数でないときや、範囲からはみ出しているときは、使わない
  if (!Number.isInteger(tempo) || tempo < min || tempo > max) {
    return defaultTempo;
  }

  return tempo;
}

/**
 * メトロノームのテンポをブラウザに保存する関数
 * @param {number} tempo - テンポ（1分間の拍の数）
 */
export function saveMetronomeTempo(tempo) {
  // ブラウザの保存場所には文字しか入れられないので、文字に変えて保存する
  localStorage.setItem(METRONOME_TEMPO_KEY, String(tempo));
}

// メトロノームの拍子を保存するときの名前（キー）
const METRONOME_BEATS_KEY = "viola-pitch:metronomeBeats";

/**
 * 保存しておいたメトロノームの拍子を読み込む関数
 * 選べる拍子かどうかは、使う側（メトロノームのページ）で確かめる。
 * @returns {number|null} 1小節の拍の数（0 は「なし」）。保存していないとき・整数でないときは null
 */
export function loadMetronomeBeats() {
  // ブラウザの保存場所から、文字として取り出す（保存していないときは null が返る）
  const text = localStorage.getItem(METRONOME_BEATS_KEY);

  // 保存していないとき
  if (text === null) {
    return null;
  }

  // 文字を数に変えて、整数のときだけ返す
  const beats = Number(text);
  return Number.isInteger(beats) ? beats : null;
}

/**
 * メトロノームの拍子をブラウザに保存する関数
 * @param {number} beats - 1小節の拍の数（0 は「なし」）
 */
export function saveMetronomeBeats(beats) {
  localStorage.setItem(METRONOME_BEATS_KEY, String(beats));
}

// ===== 読み込んだ楽譜の「通し」のリズムのヒント（流れる縦線・メトロノーム）（ステップC-2） =====

// 流れる縦線の入・切を保存するときの名前（キー）
const RUN_CURSOR_ENABLED_KEY = "viola-pitch:runCursorEnabled";

// メトロノームの入・切を保存するときの名前（キー）
const RUN_METRONOME_ENABLED_KEY = "viola-pitch:runMetronomeEnabled";

/**
 * 保存しておいた「流れる縦線」の入・切を読み込む関数（ステップC-2）
 * @returns {boolean} true：入、false：切。保存していないときは true（最初は入）
 */
export function loadRunCursorEnabled() {
  try {
    // 「false」と保存してあるときだけ切にする。保存していないときや、それ以外の内容のときは入
    return localStorage.getItem(RUN_CURSOR_ENABLED_KEY) !== "false";
  } catch (error) {
    // 保存領域を使えないときは、最初の設定（入）
    return true;
  }
}

/**
 * 「流れる縦線」の入・切をブラウザに保存する関数（ステップC-2）
 * @param {boolean} enabled - true：入、false：切
 */
export function saveRunCursorEnabled(enabled) {
  try {
    localStorage.setItem(RUN_CURSOR_ENABLED_KEY, String(enabled));
  } catch (error) {
    // 保存領域を使えないときは、何もしない（次に開いたときは最初の設定になる）
  }
}

/**
 * 保存しておいた「メトロノーム」の入・切を読み込む関数（ステップC-2）
 * @returns {boolean} true：入、false：切。保存していないときは false（最初は切）
 */
export function loadRunMetronomeEnabled() {
  try {
    // 「true」と保存してあるときだけ入にする。保存していないときや、それ以外の内容のときは切
    return localStorage.getItem(RUN_METRONOME_ENABLED_KEY) === "true";
  } catch (error) {
    // 保存領域を使えないときは、最初の設定（切）
    return false;
  }
}

/**
 * 「メトロノーム」の入・切をブラウザに保存する関数（ステップC-2）
 * @param {boolean} enabled - true：入、false：切
 */
export function saveRunMetronomeEnabled(enabled) {
  try {
    localStorage.setItem(RUN_METRONOME_ENABLED_KEY, String(enabled));
  } catch (error) {
    // 保存領域を使えないときは、何もしない
  }
}

// ===== 読み込んだ楽譜の、弓の記号と指番号の表示（ステップE-1） =====
// （保持線：保持線（指を押さえたままにする線）も、この設定でいっしょに表示する・しないを切り替えるようにした。
//   保存の名前（キー）は前と同じにしてあるので、今までの入・切の設定はそのまま使われる）

// 弓の記号・指番号・指の保持線を表示するかどうかを保存するときの名前（キー）
const IMPORTED_SYMBOLS_VISIBLE_KEY = "viola-pitch:importedSymbolsVisible";

/**
 * 保存しておいた「弓の記号・指番号・指の保持線を表示する」の入・切を読み込む関数（ステップE-1）
 * @returns {boolean} true：表示する、false：表示しない。保存していないときは true（最初は表示する）
 */
export function loadImportedSymbolsVisible() {
  try {
    // 「false」と保存してあるときだけ表示しない。保存していないときや、それ以外の内容のときは表示する
    return localStorage.getItem(IMPORTED_SYMBOLS_VISIBLE_KEY) !== "false";
  } catch (error) {
    // 保存領域を使えないときは、最初の設定（表示する）
    return true;
  }
}

/**
 * 「弓の記号・指番号・指の保持線を表示する」の入・切をブラウザに保存する関数（ステップE-1）
 * @param {boolean} visible - true：表示する、false：表示しない
 */
export function saveImportedSymbolsVisible(visible) {
  try {
    localStorage.setItem(IMPORTED_SYMBOLS_VISIBLE_KEY, String(visible));
  } catch (error) {
    // 保存領域を使えないときは、何もしない（次に開いたときは最初の設定になる）
  }
}

// ===== 読み込んだ楽譜の「通し」の、楽譜の見せ方（ステップE-2） =====

// 楽譜の見せ方（"normal"：ふつう、"flow"：流れる）を保存するときの名前（キー）
const RUN_VIEW_MODE_KEY = "viola-pitch:runViewMode";

/**
 * 保存しておいた「通し」の楽譜の見せ方を読み込む関数（ステップE-2）
 * @returns {string} "normal"（ふつう）か "flow"（流れる）。保存していないときは "normal"
 */
export function loadRunViewMode() {
  try {
    // 「flow」と保存してあるときだけ流れる。それ以外はふつう
    return localStorage.getItem(RUN_VIEW_MODE_KEY) === "flow" ? "flow" : "normal";
  } catch (error) {
    // 保存領域を使えないときは、最初の設定（ふつう）
    return "normal";
  }
}

/**
 * 「通し」の楽譜の見せ方をブラウザに保存する関数（ステップE-2）
 * @param {string} mode - "normal"（ふつう）か "flow"（流れる）
 */
export function saveRunViewMode(mode) {
  try {
    localStorage.setItem(RUN_VIEW_MODE_KEY, mode);
  } catch (error) {
    // 保存領域を使えないときは、何もしない
  }
}
