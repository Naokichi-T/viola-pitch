// 調号から、各音名に付く変化記号を求める関数を読み込む
import { getSignatureAccidentals } from "./key.js";

// ===== 五線譜を描くための設定値 =====
// 単位はすべて、SVGの中での長さ（画面の幅に合わせて全体が拡大・縮小される）

// 五線の線と線の間隔
export const STAFF_SPACE = 10;

// 五線譜1段ぶんの横幅
export const STAFF_WIDTH = 448;

// 五線譜1段ぶんの高さ（五線の上下に、はみ出す音符のための余白を含む）
export const ROW_HEIGHT = 155;

// ビオラ版では、ト音記号ではなく、ビオラの楽譜でふつうに使う「ハ音記号（アルト記号）」で描く。
// アルト記号は、真ん中の線（第3線）がド4（ハ）になる記号。
// （バイオリン版のト音記号と比べると、同じ線の上の音が、音名で6つ分（7度）低くなる。例：いちばん下の線は、ト音記号ではミ4、アルト記号ではファ3）

// 一番下の線（ファ3）の縦の位置
// 上に余白を多く取っているのは、高い音（ミ6まで）が五線の上に大きくはみ出すため
// （ミ6 は加線6本。♭が付いても上が切れないように、バイオリン版の 110 より少し下げた）
const BOTTOM_LINE_Y = 118;

// 一番下の線（ファ3）の通し番号
// 通し番号は「オクターブ × 7 ＋ 音名の番号」で求める、音の高さの順番を表す番号
// 例：ファ3 は 3 × 7 + 3 = 24
const BOTTOM_LINE_POSITION = 24;

// 五線の5本の線の通し番号（下から順に、ファ3・ラ3・ド4・ミ4・ソ4）
export const LINE_POSITIONS = [24, 26, 28, 30, 32];

// アルト記号を置く線の通し番号（ド4。真ん中の線）
// アルト記号の「くびれ」の真ん中が、この線に重なる
export const C_LINE_POSITION = 28;

// 真ん中の線（ド4）の通し番号。棒の向きを決めるときの境目になる
const MIDDLE_LINE_POSITION = 28;

// 五線の下に加線が必要になる、一番高い通し番号（レ3。これ以下の音には加線が付く）
const LEDGER_BELOW_POSITION = 22;

// 五線の上に加線が必要になる、一番低い通し番号（シ4。これ以上の音には加線が付く）
const LEDGER_ABOVE_POSITION = 34;

// アルト記号の横の位置（左端からの距離）
export const CLEF_X = 8;

// 1段に並べる音符の数
export const NOTES_PER_ROW = 8;

// 調号の最初の記号の横の位置（アルト記号のすぐ右）
const KEY_SIGNATURE_X = 40;

// 調号の記号と記号の横の間隔
const KEY_SIGNATURE_SPACING = 10;

// 調号の右端から、最初の音符（玉の中心）までの間隔
const KEY_SIGNATURE_TO_NOTE_GAP = 30;

// 段の中で最後（8番目）の音符の横の位置（玉の中心）
const LAST_NOTE_X = 423;

// 調号の♯を置く位置の通し番号（♯が付いていく順に、ファ4・ド4・ソ4・レ4・ラ3・ミ4・シ3）
// アルト記号の調号は、ト音記号の調号と五線の上で同じ形になるので、ト音記号の位置から7（1オクターブ）引いた値になる
const SHARP_SIGNATURE_POSITIONS = [31, 28, 32, 29, 26, 30, 27];

// 調号の♭を置く位置の通し番号（♭が付いていく順に、シ3・ミ4・ラ3・レ4・ソ3・ド4・ファ3）
const FLAT_SIGNATURE_POSITIONS = [27, 30, 26, 29, 25, 28, 24];

// 音符の玉の横幅（Bravura の玉は、線と線の間隔の1.18倍の幅で作られている）
const NOTEHEAD_WIDTH = STAFF_SPACE * 1.18;

// 棒の長さ（線と線の間隔の3.5倍が、楽譜の一般的な長さ）
const STEM_LENGTH = STAFF_SPACE * 3.5;

// 棒の太さ
export const STEM_WIDTH = 1.2;

// 棒の付け根を、玉の中心から上下にどれだけずらすか
// （玉は斜めの楕円なので、中心の高さから少しずらすと、玉のふちにきれいにつながる）
const STEM_OFFSET_Y = STAFF_SPACE * 0.17;

// 加線が、玉の左右にどれだけはみ出すか
const LEDGER_EXTENSION = 4;

// 変化記号と玉の間のすき間
const ACCIDENTAL_GAP = 3;

// 楽譜用フォントの文字の大きさ
// Bravura は「文字の大きさ ＝ 線と線の間隔の4倍」にすると、五線にぴったり合うように作られている
export const GLYPH_FONT_SIZE = STAFF_SPACE * 4;

// 楽譜用フォントの中での、各記号の文字コード
// （楽譜用フォントの共通規格 SMuFL で決められている番号）
export const GLYPHS = {
  cClef: "\uE05C", // ハ音記号（アルト記号として、真ん中の線に置く）
  notehead: "\uE0A4", // 音符の玉（黒く塗りつぶしたもの）
  sharp: "\uE262", // ♯
  flat: "\uE260", // ♭
  natural: "\uE261", // ♮（ナチュラル）
};

/**
 * 通し番号から、縦の位置（y座標）を計算する関数
 * 通し番号が1つ増えるごとに、線と線の間隔の半分だけ上に移動する。
 * SVGでは下に行くほど y が大きくなるので、上に移動するときは引き算になる。
 * @param {number} position - 通し番号（例：ファ3 は 24、ド4 は 28）
 * @returns {number} 縦の位置（y座標）
 */
export function positionToY(position) {
  // 一番下の線から、通し番号いくつ分上にあるか
  const stepsFromBottomLine = position - BOTTOM_LINE_POSITION;

  // 一番下の線の位置から、その分だけ上に移動する
  return BOTTOM_LINE_Y - stepsFromBottomLine * (STAFF_SPACE / 2);
}

/**
 * 音のデータから、通し番号を計算する関数
 * ♯や♭が付いても五線譜の上での高さは変わらないので、変化記号は計算に使わない。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @returns {number} 通し番号（例：ド4 は 28、ド3 は 21）
 */
export function getStaffPosition(note) {
  return note.octave * 7 + note.step;
}

/**
 * 音の並びを、1段ぶんずつに分ける関数
 * 例：10音あるとき、[8音, 2音] の2段に分ける。
 * 音が1つもないときも、空の五線を1段表示したいので、空の段を1つ返す。
 * @param {Array} notes - 音のデータの配列
 * @returns {Array<Array>} 段ごとに分けた配列（配列の中に、段ごとの配列が入る）
 */
export function splitIntoRows(notes) {
  // 段ごとの配列を入れていく入れ物
  const rows = [];

  // NOTES_PER_ROW 個ずつ切り出して、1段として追加していく
  for (let start = 0; start < notes.length; start += NOTES_PER_ROW) {
    rows.push(notes.slice(start, start + NOTES_PER_ROW));
  }

  // 音が1つもないときは、空の段を1つ入れる
  if (rows.length === 0) {
    rows.push([]);
  }

  return rows;
}

/**
 * 調号の記号を描くために必要な位置を計算する関数
 * 調号の記号は、アルト記号の右に、決まった順番と高さで並べる。
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
 * @returns {Array<{glyph: string, x: number, y: number}>}
 *   記号1つごとの、文字（glyph）と位置（x は左端、y は縦の位置）の配列。調号なしのときは空の配列
 */
export function layoutKeySignature(signature) {
  // ♯の調か♭の調かで、使う記号と、置く位置の一覧を決める
  const glyph = signature > 0 ? GLYPHS.sharp : GLYPHS.flat;
  const positions = signature > 0 ? SHARP_SIGNATURE_POSITIONS : FLAT_SIGNATURE_POSITIONS;

  // 記号の数（signature がマイナスのときも、プラスの個数に直す）
  const count = Math.abs(signature);

  // 記号を1つずつ、左から順に並べていく
  const symbols = [];
  for (let i = 0; i < count; i++) {
    symbols.push({
      glyph: glyph,
      x: KEY_SIGNATURE_X + i * KEY_SIGNATURE_SPACING,
      y: positionToY(positions[i]),
    });
  }

  return symbols;
}

/**
 * 段の中で最初の音符の横の位置（玉の中心）を計算する関数
 * 調号の記号が多いほど、最初の音符を右にずらす。
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
 * @returns {number} 最初の音符の玉の中心の横の位置
 */
function getFirstNoteX(signature) {
  // 調号の右端の位置
  const signatureEndX = KEY_SIGNATURE_X + Math.abs(signature) * KEY_SIGNATURE_SPACING;

  // 調号の右端から、決まった間隔を空けた位置
  return signatureEndX + KEY_SIGNATURE_TO_NOTE_GAP;
}

/**
 * 音符どうしの横の間隔を計算する関数
 * 最初の音符から最後の音符までを、等間隔に分ける。
 * 最後の音符の位置は変えないので、調号の記号が多いほど間隔がせまくなる。
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
 * @returns {number} 音符どうしの横の間隔
 */
function getNoteSpacing(signature) {
  return (LAST_NOTE_X - getFirstNoteX(signature)) / (NOTES_PER_ROW - 1);
}

/**
 * 段の中での音符の横の位置（玉の中心）を計算する関数
 * @param {number} indexInRow - 段の中で何番目の音符か（0から始まる）
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
 * @returns {number} 玉の中心の横の位置
 */
function getNoteX(indexInRow, signature) {
  return getFirstNoteX(signature) + indexInRow * getNoteSpacing(signature);
}

/**
 * 加線を引く位置（通し番号）の一覧を求める関数
 * 加線は、五線からはみ出した音に付ける短い線のこと。
 * 五線の線と同じく、通し番号が偶数の位置に引く。
 * 例：ド3（21）のとき、レ3（22）の1本。ミ6（44）のとき、シ4（34）からミ6（44）までの6本
 * @param {number} position - 音の通し番号
 * @returns {number[]} 加線を引く位置の通し番号の配列（加線がいらないときは空の配列）
 */
function getLedgerPositions(position) {
  const ledgerPositions = [];

  // 五線より下の音：レ3（22）から下に向かって、音の高さまで1本おきに引く
  for (let p = LEDGER_BELOW_POSITION; p >= position; p -= 2) {
    ledgerPositions.push(p);
  }

  // 五線より上の音：シ4（34）から上に向かって、音の高さまで1本おきに引く
  for (let p = LEDGER_ABOVE_POSITION; p <= position; p += 2) {
    ledgerPositions.push(p);
  }

  return ledgerPositions;
}

/**
 * 音符1つを描くために必要な位置をまとめて計算する関数
 * 玉・棒・加線・変化記号の位置を計算して、1つのオブジェクトにして返す。
 * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
 * @param {number} indexInRow - 段の中で何番目の音符か（0から始まる）
 * @param {number} signature - 調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
 * @returns {{
 *   x: number, y: number,
 *   stemX: number, stemY1: number, stemY2: number,
 *   ledgerYs: number[], ledgerX1: number, ledgerX2: number,
 *   accidentalGlyph: string, accidentalX: number,
 *   hitX: number, hitWidth: number
 * }} 描画に使う位置の情報
 */
export function layoutNote(note, indexInRow, signature) {
  // ----- 玉の位置 -----
  // 通し番号を求める
  const position = getStaffPosition(note);

  // 玉の中心の横の位置：段の中での順番と、調号の数から求める
  const x = getNoteX(indexInRow, signature);

  // 玉の中心の縦の位置：通し番号から求める
  const y = positionToY(position);

  // ----- 棒の位置 -----
  // 真ん中の線の縦の位置
  const middleLineY = positionToY(MIDDLE_LINE_POSITION);

  // 棒の横の位置と、付け根（stemY1）・先端（stemY2）の縦の位置
  let stemX;
  let stemY1;
  let stemY2;

  if (position < MIDDLE_LINE_POSITION) {
    // 真ん中の線より下の音：棒は玉の右側から上に伸ばす
    stemX = x + NOTEHEAD_WIDTH / 2 - STEM_WIDTH / 2;
    stemY1 = y - STEM_OFFSET_Y;

    // 五線から遠く離れた低い音は、棒を真ん中の線まで伸ばす（楽譜の決まり）
    // Math.min を使うのは、SVGでは上に行くほど y が小さくなるため
    stemY2 = Math.min(y - STEM_LENGTH, middleLineY);
  } else {
    // 真ん中の線か、それより上の音：棒は玉の左側から下に伸ばす
    stemX = x - NOTEHEAD_WIDTH / 2 + STEM_WIDTH / 2;
    stemY1 = y + STEM_OFFSET_Y;

    // 五線から遠く離れた高い音は、棒を真ん中の線まで伸ばす（楽譜の決まり）
    stemY2 = Math.max(y + STEM_LENGTH, middleLineY);
  }

  // ----- 加線の位置 -----
  // 加線を引く位置（通し番号）を求めて、それぞれ縦の位置に変換する
  const ledgerYs = getLedgerPositions(position).map((p) => positionToY(p));

  // 加線の左端と右端（玉の左右に少しはみ出させる）
  const ledgerX1 = x - NOTEHEAD_WIDTH / 2 - LEDGER_EXTENSION;
  const ledgerX2 = x + NOTEHEAD_WIDTH / 2 + LEDGER_EXTENSION;

  // ----- 変化記号 -----
  // この調の調号で、この音名にもともと付いている変化記号（1 が♯、-1 が♭、0 がなし）
  const signatureAccidental = getSignatureAccidentals(signature)[note.step];

  // 表示する記号の文字（記号を表示しないときは空文字）
  // 調号と同じ音には記号を付けず、調号と違う音にだけ記号を付ける
  let accidentalGlyph = "";
  if (note.accidental !== signatureAccidental) {
    if (note.accidental === 1) {
      // ♯の音
      accidentalGlyph = GLYPHS.sharp;
    } else if (note.accidental === -1) {
      // ♭の音
      accidentalGlyph = GLYPHS.flat;
    } else {
      // 調号では♯か♭が付く音名なのに、何も付かない音：♮で調号を打ち消す
      accidentalGlyph = GLYPHS.natural;
    }
  }

  // 変化記号の右端の位置（玉の左端から、すき間ぶん左）
  const accidentalX = x - NOTEHEAD_WIDTH / 2 - ACCIDENTAL_GAP;

  // ----- タップできる範囲 -----
  // 玉を中心にした縦の帯。幅は音符どうしの間隔と同じにして、となりの帯とすき間なく並べる
  const hitWidth = getNoteSpacing(signature);

  // 帯の左端の位置（玉の中心から、幅の半分だけ左）
  const hitX = x - hitWidth / 2;

  return {
    x,
    y,
    stemX,
    stemY1,
    stemY2,
    ledgerYs,
    ledgerX1,
    ledgerX2,
    accidentalGlyph,
    accidentalX,
    hitX,
    hitWidth,
  };
}
