// 名前を付けて保存した楽譜の一覧を、ブラウザに保存したり読み込んだりするファイル
// 「作業中の楽譜」（settings.js）とは別に、いくつでも保存しておける。

// id から音部記号のデータを探す関数を読み込む（音部記号が入っていない古い楽譜を、アルト記号として扱うため）（ビオラ版）
import { getClef } from "./staff.js";

// ===== ブラウザに保存するための設定値 =====

// 保存した楽譜の一覧を保存するときの名前（localStorage の中で、この名前を付けて保存する）
const SAVED_SCORES_STORAGE_KEY = "viola-pitch:saved-scores";

/**
 * 保存した楽譜の一覧を、ブラウザから読み込む関数
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {Array} 保存した楽譜の配列。1つも保存されていないときや、読み込めないときは空の配列
 *   1つの楽譜は { id, name, keyId, clefId, tempo, temperamentId, notes, savedAt } の形
 *   id：楽譜を区別するための文字、name：名前、keyId：調の id、clefId：音部記号の id（ビオラ版）、tempo：テンポ、
 *   temperamentId：音律の id、notes：音のデータの配列、savedAt：保存した日時（ミリ秒の数字）
 */
export function loadSavedScores() {
  try {
    // 保存されている文字を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(SAVED_SCORES_STORAGE_KEY);
    if (saved === null) {
      return [];
    }

    // JSON の文字を、元のデータの形に戻す
    const scores = JSON.parse(saved);

    // 配列でないとき（保存された中身が壊れているとき）は、空の配列を返す
    if (!Array.isArray(scores)) {
      return [];
    }

    // 楽譜として最低限の形になっているものだけを残す（id と名前が文字で、音の並びが配列であること）
    return scores.filter((score) => typeof score === "object" && score !== null && typeof score.id === "string" && typeof score.name === "string" && Array.isArray(score.notes));
  } catch (error) {
    // 保存領域を使えないときや、保存された文字が壊れていて戻せないとき
    return [];
  }
}

/**
 * 保存した楽譜の一覧を、ブラウザに書き込む関数（このファイルの中だけで使う）
 * @param {Array} scores - 保存した楽譜の配列
 * @returns {boolean} 書き込めたら true、書き込めなかったら false
 */
function writeSavedScores(scores) {
  try {
    // localStorage には文字しか保存できないので、JSON という形式の文字に直して保存する
    localStorage.setItem(SAVED_SCORES_STORAGE_KEY, JSON.stringify(scores));
    return true;
  } catch (error) {
    // 保存領域を使えないときや、いっぱいのとき
    return false;
  }
}

/**
 * 楽譜を区別するための id を、新しく作る関数（このファイルの中だけで使う）
 * 今の時刻と、でたらめな文字を組み合わせて、ほかの楽譜と重ならない文字にする。
 * @returns {string} 新しい id（例：'m1x2y3z4-k8f3q2'）
 */
function createId() {
  // toString(36) は、数字を「0〜9 と a〜z」を使った短い文字に直す
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return timePart + "-" + randomPart;
}

/**
 * 同じ名前の楽譜が、すでに保存されているかどうかを調べる関数
 * @param {string} name - 調べる名前
 * @param {string|null} exceptId - この id の楽譜は調べない（自分自身を上書きするときに使う）。なければ null
 * @returns {boolean} 同じ名前の楽譜があれば true
 */
export function isNameUsed(name, exceptId) {
  return loadSavedScores().some((score) => score.name === name && score.id !== exceptId);
}

/**
 * 楽譜を、新しく保存する関数
 * @param {{name: string, keyId: string, clefId: string, tempo: number, temperamentId: string, notes: Array}} data - 保存する内容
 * @returns {object|null} 保存した楽譜（id と保存した日時が付いたもの）。保存できなかったときは null
 */
export function addSavedScore(data) {
  // 今の一覧を読み込む
  const scores = loadSavedScores();

  // 保存する楽譜を作る（新しい id と、今の日時を付ける）
  const score = {
    id: createId(),
    name: data.name,
    keyId: data.keyId,
    clefId: data.clefId,
    tempo: data.tempo,
    temperamentId: data.temperamentId,
    notes: data.notes,
    savedAt: Date.now(),
  };

  // 一覧の最後に足して、書き込む
  scores.push(score);
  if (!writeSavedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 保存してある楽譜を、新しい内容で上書きする関数
 * 名前はそのままで、調・音部記号・テンポ・音律・音の並び・保存した日時を入れ替える。
 * @param {string} id - 上書きする楽譜の id
 * @param {{keyId: string, clefId: string, tempo: number, temperamentId: string, notes: Array}} data - 新しい内容
 * @returns {object|null} 上書きした後の楽譜。その id の楽譜がないときや、保存できなかったときは null
 */
export function updateSavedScore(id, data) {
  // 今の一覧を読み込んで、上書きする楽譜を探す
  const scores = loadSavedScores();
  const score = scores.find((item) => item.id === id);

  // 見つからないとき（一覧から削除されていたときなど）
  if (score === undefined) {
    return null;
  }

  // 調か音の並びが変わるときは、最高点を消す（別の内容になるので、前の点数とは比べられないため）
  // テンポや音律や音部記号だけが変わるときは、最高点を残す（音部記号は見た目だけで、弾く音は同じため）
  const isSameMusic = score.keyId === data.keyId && JSON.stringify(score.notes) === JSON.stringify(data.notes);
  if (!isSameMusic) {
    // delete は、データの中から、その項目そのものを取り除く命令
    delete score.bestScore;
  }

  // 内容を入れ替える（id と名前はそのまま）
  score.keyId = data.keyId;
  score.clefId = data.clefId;
  score.tempo = data.tempo;
  score.temperamentId = data.temperamentId;
  score.notes = data.notes;
  score.savedAt = Date.now();

  // 書き込む
  if (!writeSavedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 保存してある楽譜を、一覧から削除する関数
 * @param {string} id - 削除する楽譜の id
 * @returns {boolean} 削除できたら true。その id の楽譜がないときや、書き込めなかったときは false
 */
export function deleteSavedScore(id) {
  // 今の一覧を読み込む
  const scores = loadSavedScores();

  // 削除する楽譜を除いた、新しい一覧を作る
  const remaining = scores.filter((score) => score.id !== id);

  // 数が変わっていないときは、その id の楽譜がなかった
  if (remaining.length === scores.length) {
    return false;
  }

  // 書き込む
  return writeSavedScores(remaining);
}

/**
 * 楽譜の内容のうち、比べるのに使う部分だけを取り出して、文字にする関数（このファイルの中だけで使う）
 * 調・音部記号・テンポ・音律・音の並びを、決まった順番で並べた文字にするので、2つの楽譜を文字どうしで比べられる。
 * @param {{keyId: string, clefId: string, tempo: number, temperamentId: string, notes: Array}} score - 楽譜の内容
 * @returns {string} 比べるための文字
 */
function toComparableText(score) {
  return JSON.stringify({
    keyId: score.keyId,
    // 音部記号（入っていない古い楽譜は、アルト記号として比べる）（ビオラ版）
    clefId: getClef(score.clefId).id,
    tempo: score.tempo,
    temperamentId: score.temperamentId,
    // 音は、必要な3つの値だけを決まった順番で取り出す
    notes: score.notes.map((note) => ({ step: note.step, accidental: note.accidental, octave: note.octave })),
  });
}

/**
 * 作業中の楽譜に、保存していない変更があるかどうかを調べる関数
 * - まだ名前を付けて保存していない楽譜：音が1つでもあれば「変更あり」
 * - 保存した楽譜を開いている：保存してある内容と、調・音部記号・テンポ・音律・音の並びのどれかが違えば「変更あり」
 * @param {{savedId: string|null, keyId: string, clefId: string, tempo: number, temperamentId: string, notes: Array}} current - 作業中の楽譜
 * @returns {boolean} 保存していない変更があれば true
 */
export function hasUnsavedChanges(current) {
  // まだ名前を付けて保存していない楽譜のとき
  if (current.savedId === null) {
    return current.notes.length > 0;
  }

  // 開いているはずの、保存した楽譜を探す
  const saved = loadSavedScores().find((score) => score.id === current.savedId);

  // 見つからないとき（一覧から削除されていたときなど）は、まだ保存していない楽譜と同じ扱いにする
  if (saved === undefined) {
    return current.notes.length > 0;
  }

  // 保存してある内容と、文字にして比べる
  return toComparableText(current) !== toComparableText(saved);
}

/**
 * 保存した楽譜を、id で1つ探す関数
 * @param {string} id - 探す楽譜の id
 * @returns {object|null} 見つかった楽譜。見つからないときは null
 */
export function getSavedScore(id) {
  const score = loadSavedScores().find((item) => item.id === id);

  // find は、見つからないとき undefined を返すので、null に直して返す
  return score === undefined ? null : score;
}

/**
 * 「通し」の点数を、その楽譜の最高点と比べて、上回っていたら記録する関数
 * 最高点は、保存した楽譜の中に bestScore という名前で入れておく（まだ無いときは、項目そのものが無い）。
 * @param {string} id - 楽譜の id
 * @param {number} points - 今回の点数（0〜100）
 * @returns {{bestScore: number, isNewRecord: boolean}|null}
 *   bestScore：記録した後の最高点、isNewRecord：今回の点数で最高点を更新したかどうか。
 *   その id の楽譜がないときや、書き込めなかったときは null
 */
export function recordBestScore(id, points) {
  // 今の一覧を読み込んで、楽譜を探す
  const scores = loadSavedScores();
  const score = scores.find((item) => item.id === id);
  if (score === undefined) {
    return null;
  }

  // これまでの最高点（まだ無いときは null）
  const previousBest = typeof score.bestScore === "number" ? score.bestScore : null;

  // 最高点がまだ無いとき、または、今回の点数のほうが高いときは、更新する
  if (previousBest === null || points > previousBest) {
    score.bestScore = points;
    if (!writeSavedScores(scores)) {
      return null;
    }
    return { bestScore: points, isNewRecord: true };
  }

  // 更新しなかったとき：これまでの最高点をそのまま返す
  return { bestScore: previousBest, isNewRecord: false };
}
