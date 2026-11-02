// 指板（ビオラの弦を押さえる板）の上で、音がどこにあるかを計算するファイル
// 第1ポジション（ファーストポジション）から第7ポジションまでを扱う。
// ポジションは、左手を指板のどこに置くかのこと。数字が大きいほど、ナットから離れた（音の高い）場所になる。

// 音番号を計算する関数、音名の一覧、変化記号を文字にする関数を読み込む
import { getNoteNumber, STEP_NAMES, accidentalToText } from "./score.js";

// 調号から、各音名に付く変化記号を求める関数を読み込む
import { getSignatureAccidentals } from "./key.js";

// ===== 指板に関する設定値 =====

// 4本の弦。指板の図では、左から C線・G線・D線・A線 の順に並べる
//   id       ：弦を区別するための名前（図の上に表示する）
//   openNote ：開放弦（指で押さえないとき）の音のデータ
// （バイオリン版は G・D・A・E。ビオラは5度低く、C・G・D・A）
export const STRINGS = [
  { id: "C", openNote: { step: 0, accidental: 0, octave: 3 } },
  { id: "G", openNote: { step: 4, accidental: 0, octave: 3 } },
  { id: "D", openNote: { step: 1, accidental: 0, octave: 4 } },
  { id: "A", openNote: { step: 5, accidental: 0, octave: 4 } },
];

// 選べるポジションの一覧
//   id   ：ポジションの番号（1〜7）
//   name ：画面に表示する名前
export const POSITIONS = [
  { id: 1, name: "第１ポジション" },
  { id: 2, name: "第２ポジション" },
  { id: 3, name: "第３ポジション" },
  { id: 4, name: "第４ポジション" },
  { id: 5, name: "第５ポジション" },
  { id: 6, name: "第６ポジション" },
  { id: 7, name: "第７ポジション" },
];

// 最初に選ばれているポジションの番号
export const DEFAULT_POSITION_ID = 1;

// 開放弦の音名から、音名でいくつ上か（0〜10）ごとの、開放弦からの半音の数（長音階で数えたとき）
// 例：音名で3つ上（C線ならファ）は、半音5つ分上
// ポジションごとの、表示する範囲を決めるために使う
const SEMITONES_BY_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];

// 音を探すオクターブの範囲（この図で扱う音は、この中に全部入る）
// 2 も入れているのは、C線の開放弦（ド3）が、嬰ハ長調などでは「シ♯2」と呼ばれるため
const SEARCH_OCTAVES = [2, 3, 4, 5, 6, 7];

/**
 * ポジションごとの、指板の図に表示する範囲を求める関数
 * 範囲は「開放弦から半音いくつ分上か」で表す。
 * - 下の端：1の指のふつうの場所（開放弦の音名から、ポジションの番号だけ上の音）より、半音1つ下
 *   （1の指をナットのほうへ引いて押さえる音まで入れるため）
 * - 上の端：4の指のふつうの場所（1の指の音名から、3つ上の音）
 * 例：第1ポジションは 1〜7、第3ポジションは 4〜11
 * @param {number} position - ポジションの番号（1〜7）
 * @returns {{low: number, high: number}} 表示する範囲（low：下の端、high：上の端）
 */
export function getPositionRange(position) {
  return {
    low: SEMITONES_BY_STEPS[position] - 1,
    high: SEMITONES_BY_STEPS[position + 3],
  };
}

/**
 * 指番号を決める関数（このファイルの中だけで使う）
 * 第1ポジションでは、開放弦の音名から数えて、1つ上の音名が1の指、2つ上が2の指…となる。
 * 例：C線（ド）なら、レが1、ミが2、ファが3、ソが4。♯や♭が付いても、音名が同じなら同じ指。
 * ポジションが1つ上がるごとに、同じ指で押さえる音名が、1つずつ上にずれる。
 * 例：第3ポジションの C線なら、ファが1、ソが2、ラが3、シが4。
 * @param {{step: number, accidental: number, octave: number}} note - 押さえる音のデータ
 * @param {{step: number, accidental: number, octave: number}} openNote - その弦の開放弦の音のデータ
 * @param {number} semitones - 開放弦から半音いくつ分上か
 * @param {number} position - ポジションの番号（1〜7）
 * @returns {number} 指番号（0 は開放弦、1〜4 は指）
 */
function getFinger(note, openNote, semitones, position) {
  // 開放弦そのもの
  if (semitones === 0) {
    return 0;
  }

  // 開放弦の音名から、音名でいくつ上か（オクターブをまたいでも数えられるように、オクターブ×7 を足して比べる）
  const stepsAbove = note.octave * 7 + note.step - (openNote.octave * 7 + openNote.step);

  // そのポジションでの指番号（第1ポジションなら、音名で1つ上が1の指）
  const finger = stepsAbove - (position - 1);

  // 1より小さくなる音（例：第1ポジションの C線のド♯）は、1の指をナットのほうへ引いて押さえる
  // 4より大きくなる音（♭ の多い調の、A線のファ♭など）は、指は4本なので、4の指にする
  return Math.min(Math.max(finger, 1), 4);
}

// 音階にない音の、♯ を使った呼び方。半音の番号（ド＝0、ド♯＝1、…、シ＝11）の順に並べてある
// ♯ の付く調と、調号のない調で使う
const SHARP_SPELLINGS = [
  { step: 0, accidental: 0 }, // ド
  { step: 0, accidental: 1 }, // ド♯
  { step: 1, accidental: 0 }, // レ
  { step: 1, accidental: 1 }, // レ♯
  { step: 2, accidental: 0 }, // ミ
  { step: 3, accidental: 0 }, // ファ
  { step: 3, accidental: 1 }, // ファ♯
  { step: 4, accidental: 0 }, // ソ
  { step: 4, accidental: 1 }, // ソ♯
  { step: 5, accidental: 0 }, // ラ
  { step: 5, accidental: 1 }, // ラ♯
  { step: 6, accidental: 0 }, // シ
];

// 音階にない音の、♭ を使った呼び方。♭ の付く調で使う
const FLAT_SPELLINGS = [
  { step: 0, accidental: 0 }, // ド
  { step: 1, accidental: -1 }, // レ♭
  { step: 1, accidental: 0 }, // レ
  { step: 2, accidental: -1 }, // ミ♭
  { step: 2, accidental: 0 }, // ミ
  { step: 3, accidental: 0 }, // ファ
  { step: 4, accidental: -1 }, // ソ♭
  { step: 4, accidental: 0 }, // ソ
  { step: 5, accidental: -1 }, // ラ♭
  { step: 5, accidental: 0 }, // ラ
  { step: 6, accidental: -1 }, // シ♭
  { step: 6, accidental: 0 }, // シ
];

/**
 * 音名と変化記号から、指定した音番号になる音のデータを作る関数（このファイルの中だけで使う）
 * オクターブを順に試して、音番号が合うものを探す。
 * @param {number} step - 音名の番号（0〜6）
 * @param {number} accidental - 変化記号（1 が♯、-1 が♭、0 がなし）
 * @param {number} number - 作りたい音の音番号
 * @returns {{step: number, accidental: number, octave: number}|null} 音のデータ。合うオクターブがないときは null
 */
function createNoteByNumber(step, accidental, number) {
  for (const octave of SEARCH_OCTAVES) {
    const note = { step: step, accidental: accidental, octave: octave };
    if (getNoteNumber(note) === number) {
      return note;
    }
  }
  return null;
}

/**
 * 選んだポジションの指板の、押せる場所を全部調べる関数
 * 4本の弦それぞれについて、開放弦と、そのポジションの範囲（getPositionRange）の場所を調べる。
 * その場所の音が、選んだ調の音階の音かどうかも調べる。
 * 音階にない音は、♯ の付く調と調号のない調では ♯ で、♭ の付く調では ♭ で呼ぶ。
 * @param {object} key - 調のデータ
 * @param {number} position - ポジションの番号（1〜7）
 * @returns {Array} 印を付ける場所の配列。1つの印は次の形
 *   stringIndex：何番目の弦か（0 が C線、3 が A線）
 *   semitones  ：開放弦から半音いくつ分上か（0 は開放弦）
 *   note       ：音のデータ（{ step, accidental, octave }）
 *   name       ：音名の文字（例：'ファ♯'）
 *   finger     ：指番号（0 は開放弦、1〜4 は指）
 *   inScale    ：選んだ調の音階の音かどうか
 *   isTonic    ：主音（音階の最初の音）かどうか
 */
export function getFingerboardMarkers(key, position) {
  // 調号で、7つの音名それぞれに付く変化記号（1 が♯、-1 が♭、0 がなし）
  const accidentals = getSignatureAccidentals(key.signature);

  // 音階にない音の呼び方の表（♭ の付く調は ♭、それ以外は ♯）
  const spellings = key.signature < 0 ? FLAT_SPELLINGS : SHARP_SPELLINGS;

  // このポジションで表示する範囲（開放弦から半音いくつ分上か）
  const range = getPositionRange(position);

  // 調べる場所の一覧：開放弦（0）と、範囲の下の端から上の端まで
  const semitonesList = [0];
  for (let semitones = range.low; semitones <= range.high; semitones += 1) {
    semitonesList.push(semitones);
  }

  const markers = [];

  // 弦を1本ずつ調べる
  STRINGS.forEach((string, stringIndex) => {
    // 開放弦の音番号（半音ごとに1ずつ増える通し番号）
    const openNumber = getNoteNumber(string.openNote);

    // 調べる場所を、順に調べる
    for (const semitones of semitonesList) {
      // この場所の音番号
      const number = openNumber + semitones;

      // まず、音階の7つの音の中に、この音番号になるものがあるかを探す
      let note = null;
      let inScale = false;
      for (let step = 0; step < 7; step += 1) {
        const scaleNote = createNoteByNumber(step, accidentals[step], number);
        if (scaleNote !== null) {
          note = scaleNote;
          inScale = true;
          break;
        }
      }

      // 音階になかったとき：呼び方の表から、音名と変化記号を決める
      // number % 12 は、12で割った余り（ド＝0、ド♯＝1、…、シ＝11 の番号になる）
      if (note === null) {
        const spelling = spellings[number % 12];
        note = createNoteByNumber(spelling.step, spelling.accidental, number);
      }

      markers.push({
        stringIndex: stringIndex,
        semitones: semitones,
        note: note,
        name: STEP_NAMES[note.step] + accidentalToText(note.accidental),
        finger: getFinger(note, string.openNote, semitones, position),
        inScale: inScale,
        isTonic: inScale && note.step === key.tonicStep,
      });
    }
  });

  return markers;
}

/**
 * 印を区別するための id を作る関数
 * 「何番目の弦か」と「半音いくつ分上か」をつなげた文字にする（例：C線の半音2つ上なら "0-2"）。
 * 図の中で印を見分けるときと、選択中の印を覚えておくときに使う。
 * @param {object} marker - 印のデータ（getFingerboardMarkers が返すもの）
 * @returns {string} 印の id
 */
export function getMarkerId(marker) {
  return marker.stringIndex + "-" + marker.semitones;
}
