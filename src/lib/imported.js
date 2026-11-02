// 読み込んだ楽譜（MusicXML から読み込んだ、練習専用の楽譜）を扱うファイル（ステップA-1a）
// （ステップA-1b：同じ名前を探す・名前に (2) を付ける・上書き・削除の関数を足した）
// （ステップA-2：id で1つ探す・五線譜に描く形にする・灰色にする音符の表を作る関数を足した）
// （ステップB：判定する音の並びを作る・区間を決める・くり返しがあるかを調べる関数を足した）
// （ステップC-1：「通し」の音程の最高点 bestPitchScore を記録する関数を足した。最高点は音程とリズムで別々に持つ）
// （ステップC-3：toPitchNote を、ほかのファイルからも使えるようにした）
// （ステップD：「通し」のリズムの最高点 bestRhythmScore を記録する関数を足した）
// （前打音の付いた音の判定：前打音の付いた音（主音）も判定するようにした。前打音（小さい音符）そのものは判定しない。
//   前打音の時間をよけて判定するのは importedTimeline.js（通し）。五線譜では、前打音だけを灰色にする（render.js））
// （「じっくり」の前打音：「じっくり」では、前打音も1つの目標の音として判定する。buildTargets に includeGrace を足した）
// 手で入力した楽譜（library.js）とは、保存する場所も形も別にしている。
//
// 【読み込んだ楽譜の形】
// 楽譜作成アプリ（string-score）と同じ形のまま、選んだパートだけを保存する
// （くり返しの展開やテンポの計算に、楽譜作成アプリの考え方をそのまま使えるようにするため）
// {
//   id:            楽譜を区別するための文字
//   name:          名前（例：'カノン（Viola）'）
//   title:         MusicXML のタイトル
//   partName:      選んだパートの名前（例：'Viola'）
//   instrument:    選んだパートの楽器（'violin'・'viola' など）
//   keyId:         調の id（例：'D-dur'。読み込むときに選んだ長調・短調）
//   temperamentId: 音律の id（読み込んだときに選ばれていた音律。練習ページで変えると、楽譜ごとに覚える）
//   tempo:         1小節目のテンポ（♩＝○○）
//   tempoText:     速度記号（'Allegro' など。なければ空の文字）
//   measures:      楽譜全体の小節の情報（拍子・調・途中のテンポ・rit.・くり返しなど。楽譜作成アプリと同じ形）
//   partMeasures:  選んだパートの小節（音符の並び。楽譜作成アプリと同じ形）
//   importedAt:    読み込んだ日時（ミリ秒の数字）
//   bestPitchScore：「通し」の音程の最高点（ステップC-1。まだ無いときは、項目そのものが無い）
//   bestRhythmScore：「通し」のリズムの最高点（ステップD。まだ無いときは、項目そのものが無い）
// }

// 楽譜作成アプリの計算の関数を読み込む（調・高さを数にする・重音の高さの並び・ハーモニクスのひし形）
import { keyAt, pitchNumber, notePitches, hasDiamond } from "#lib/musicxml/model.js";

// 調の一覧と、調の名前を作る関数を読み込む
import { KEYS } from "#lib/key.js";

// 今選ばれている音律を読み込む関数を読み込む
import { loadTemperamentId } from "#lib/settings.js";

// くり返しをたどった「鳴らす小節の順番」を作る関数を読み込む（楽譜作成アプリからコピーしたもの）（ステップB）
import { playOrder } from "#lib/musicxml/playback.js";

// ===== ブラウザに保存するための設定値 =====

// 読み込んだ楽譜の一覧を保存するときの名前（手で入力した楽譜の一覧とは別の名前にする）
const IMPORTED_SCORES_STORAGE_KEY = "viola-pitch:imported-scores";

// ===== 判定できる音域（score.js と同じ値。ド3〜ミ6） =====

// 判定できる一番低い音の音番号（ド3。ビオラのC線の開放弦）
const MIN_NOTE_NUMBER = 48;

// 判定できる一番高い音の音番号（ミ6）
const MAX_NOTE_NUMBER = 88;

// 判定から外す音符の色（灰色）（ステップA-2）
const EXCLUDED_COLOR = "#9e9e9e";

// ===== 判定から外す理由 =====
// 音符のどこを見て外すかと、知らせるときの名前
//   range     ：音域の外（重音なら、いちばん上の音で調べる）
//   ornament  ：トリル・プラルトリラー・モルデント・ターン（音がすばやく行き来するので、1つの高さに決まらない）
//   （前打音の付いた音の判定：前打音の付いた音（grace）は外さないようにした。前打音のあとの主音の高さで判定する）
//   tremolo   ：トレモロ（2音トレモロも。音を細かく刻む・行き来する）
//   glissando ：グリッサンド（高さがすべって変わる）
//   harmonic  ：ハーモニクスのひし形の玉がある音（書いた高さと、聞こえる高さが違う）
const EXCLUDE_LABELS = {
  range: "音域（ド3〜ミ6）の外の音",
  ornament: "トリルなどの装飾の付いた音",
  tremolo: "トレモロの音",
  glissando: "グリッサンドの付いた音",
  harmonic: "ハーモニクス（ひし形）の音",
};

/**
 * 読み込んだ楽譜の一覧を、ブラウザから読み込む関数
 * ブラウザの中でだけ使える機能なので、ページが画面に表示された後に呼ぶこと。
 * @returns {Array} 読み込んだ楽譜の配列。1つもないときや、読み込めないときは空の配列
 */
export function loadImportedScores() {
  try {
    // 保存されている文字を取り出す（保存されていないときは null が入る）
    const saved = localStorage.getItem(IMPORTED_SCORES_STORAGE_KEY);
    if (saved === null) {
      return [];
    }

    // JSON の文字を、元のデータの形に戻す
    const scores = JSON.parse(saved);

    // 配列でないとき（保存された中身が壊れているとき）は、空の配列を返す
    if (!Array.isArray(scores)) {
      return [];
    }

    // 楽譜として最低限の形になっているものだけを残す（id と名前が文字で、小節の並びが配列であること）
    return scores.filter(
      (score) => typeof score === "object" && score !== null && typeof score.id === "string" && typeof score.name === "string" && Array.isArray(score.measures) && Array.isArray(score.partMeasures),
    );
  } catch (error) {
    // 保存領域を使えないときや、保存された文字が壊れていて戻せないとき
    return [];
  }
}

/**
 * 読み込んだ楽譜の一覧を、ブラウザに書き込む関数（このファイルの中だけで使う）
 * @param {Array} scores - 読み込んだ楽譜の配列
 * @returns {boolean} 書き込めたら true、書き込めなかったら false
 */
function writeImportedScores(scores) {
  try {
    // localStorage には文字しか保存できないので、JSON という形式の文字に直して保存する
    localStorage.setItem(IMPORTED_SCORES_STORAGE_KEY, JSON.stringify(scores));
    return true;
  } catch (error) {
    // 保存領域を使えないときや、いっぱいのとき
    return false;
  }
}

/**
 * 楽譜を区別するための id を、新しく作る関数（このファイルの中だけで使う）
 * 今の時刻と、でたらめな文字を組み合わせて、ほかの楽譜と重ならない文字にする。
 * （手で入力した楽譜と見分けやすいように、頭に「x」を付ける）
 * @returns {string} 新しい id（例：'xm1x2y3z4-k8f3q2'）
 */
function createId() {
  // toString(36) は、数字を「0〜9 と a〜z」を使った短い文字に直す
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 8);
  return "x" + timePart + "-" + randomPart;
}

/**
 * 読み込んだ楽譜を、一覧に新しく足して保存する関数
 * @param {object} record - 保存する楽譜（buildImportedScore で作ったもの。id と日時はここで付ける）
 * @returns {object|null} 保存した楽譜。保存できなかったときは null
 */
export function addImportedScore(record) {
  // 今の一覧を読み込む
  const scores = loadImportedScores();

  // 新しい id と、今の日時を付ける
  const score = { ...record, id: createId(), importedAt: Date.now() };

  // 一覧の最後に足して、書き込む
  scores.push(score);
  if (!writeImportedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 同じ名前の、読み込んだ楽譜を探す関数（ステップA-1b）
 * 読み込むときに「上書きか、別に追加か」を聞くために使う。
 * @param {string} name - 探す名前
 * @returns {object|null} 見つかった楽譜（同じ名前が2つ以上あるときは、いちばん新しく読み込んだもの）。なければ null
 */
export function findImportedScoreByName(name) {
  // 同じ名前の楽譜を全部取り出して、読み込んだ日時の新しい順に並べる
  const sameName = loadImportedScores()
    .filter((score) => score.name === name)
    .sort((a, b) => b.importedAt - a.importedAt);

  // 1つもなければ null、あれば先頭（いちばん新しいもの）
  return sameName.length === 0 ? null : sameName[0];
}

/**
 * 同じ名前の楽譜があるとき、名前のうしろに「 (2)」「 (3)」…を付けて、まだ使っていない名前にする関数（ステップA-1b）
 * ［別に追加］を選んだときに使う。
 * @param {string} name - もとの名前（例：'カノン（Viola）'）
 * @returns {string} まだ使っていない名前（例：'カノン（Viola） (2)'）。同じ名前がなければ、もとの名前のまま
 */
export function getUniqueName(name) {
  // 今ある楽譜の名前を全部集める（Set は、同じものを1つにまとめて持てる入れ物。has で「入っているか」を調べられる）
  const usedNames = new Set(loadImportedScores().map((score) => score.name));

  // 同じ名前がなければ、そのまま使う
  if (!usedNames.has(name)) {
    return name;
  }

  // (2) から順に、まだ使っていない番号を探す
  let number = 2;
  while (usedNames.has(name + " (" + number + ")")) {
    number += 1;
  }
  return name + " (" + number + ")";
}

/**
 * 楽譜の中身（調・小節の情報・音符）を、比べるための文字にする関数（このファイルの中だけで使う）（ステップA-1b）
 * 上書きするときに、楽譜が変わったかどうか（最高点を消すかどうか）を決めるのに使う。
 * テンポ・音律・名前は比べない（変わっても、前の点数と比べられるので）。
 * @param {object} score - 読み込んだ楽譜
 * @returns {string} 比べるための文字
 */
function toComparableText(score) {
  return JSON.stringify({
    keyId: score.keyId,
    measures: score.measures,
    partMeasures: score.partMeasures,
  });
}

/**
 * 読み込んだ楽譜を、新しく読み込んだ内容で上書きする関数（ステップA-1b）
 * id はそのまま、中身と読み込んだ日時を入れ替える。
 * 楽譜の中身（調・小節・音符）が変わったときは、最高点を消す（前の点数とは比べられないため）。
 * @param {string} id - 上書きする楽譜の id
 * @param {object} record - 新しく読み込んだ楽譜の形（buildImportedScore で作ったもの）
 * @returns {object|null} 上書きした後の楽譜。その id の楽譜がないときや、保存できなかったときは null
 */
export function replaceImportedScore(id, record) {
  // 今の一覧を読み込んで、上書きする楽譜の場所を探す（findIndex は、見つからないとき -1 を返す）
  const scores = loadImportedScores();
  const index = scores.findIndex((score) => score.id === id);
  if (index === -1) {
    return null;
  }

  const old = scores[index];

  // 新しい楽譜を作る（id は前のまま、読み込んだ日時は今）
  const score = { ...record, id: old.id, importedAt: Date.now() };

  // 楽譜の中身が同じなら、前の最高点（音程・リズム）を引き継ぐ（ステップC-1：bestPitchScore、ステップD：bestRhythmScore）
  if (toComparableText(old) === toComparableText(record)) {
    if (typeof old.bestPitchScore === "number") {
      score.bestPitchScore = old.bestPitchScore;
    }
    if (typeof old.bestRhythmScore === "number") {
      score.bestRhythmScore = old.bestRhythmScore;
    }
  }

  // 一覧の同じ場所に入れ替えて、書き込む
  scores[index] = score;
  if (!writeImportedScores(scores)) {
    return null;
  }

  return score;
}

/**
 * 読み込んだ楽譜を、一覧から削除する関数（ステップA-1b）
 * @param {string} id - 削除する楽譜の id
 * @returns {boolean} 削除できたら true。その id の楽譜がないときや、書き込めなかったときは false
 */
export function deleteImportedScore(id) {
  // 今の一覧を読み込む
  const scores = loadImportedScores();

  // 削除する楽譜を除いた、新しい一覧を作る
  const remaining = scores.filter((score) => score.id !== id);

  // 数が変わっていないときは、その id の楽譜がなかった
  if (remaining.length === scores.length) {
    return false;
  }

  // 書き込む
  return writeImportedScores(remaining);
}

/**
 * 楽譜のパートの一覧を、選ぶメニュー用に作る関数
 * @param {object} score - 楽譜作成アプリの形の楽譜データ（musicXMLToScore で読み込んだもの）
 * @returns {{index: number, name: string}[]} パートの番号（0から）と名前の配列
 */
export function getPartChoices(score) {
  return score.parts.map((part, index) => ({ index: index, name: part.name }));
}

/**
 * 読み込む窓で、最初に選んでおくパートの番号を返す関数（ビオラ版で追加）
 * パートの楽器がビオラ（'viola'）のものがあれば、その中のいちばん上のパートを選ぶ。
 * ビオラのパートがないとき（バイオリンだけの楽譜など）は、いちばん上のパート（0）にする。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ（musicXMLToScore で読み込んだもの）
 * @returns {number} 最初に選んでおくパートの番号（0から）
 */
export function getDefaultPartIndex(score) {
  // findIndex は、条件に合うものが何番目にあるかを返す命令（見つからないときは -1）
  const violaIndex = score.parts.findIndex((part) => part.instrument === "viola");
  return violaIndex === -1 ? 0 : violaIndex;
}

/**
 * 楽譜の1小節目の調号から、候補になる調（長調と短調の2つ）を返す関数
 * MusicXML には長調・短調の区別が書かれていないことが多いので、読み込むときに選んでもらう。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @returns {object[]} [長調, 短調] の調のデータ（key.js の KEYS の中のもの）
 */
export function getKeyChoices(score) {
  // 1小節目の調号（♯の数がプラス、♭の数がマイナス）
  const signature = keyAt(score, 0);

  // 同じ調号の長調と短調を探す（KEYS には、どの調号にも長調と短調が1つずつある）
  const major = KEYS.find((key) => key.mode === "major" && key.signature === signature);
  const minor = KEYS.find((key) => key.mode === "minor" && key.signature === signature);
  return [major, minor];
}

/**
 * 読み込む楽譜の、最初の名前を作る関数
 * 「タイトル（パート名）」の形にする。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @param {number} partIndex - 選んだパートの番号（0から）
 * @returns {string} 名前（例：'カノン（Viola）'）
 */
export function getDefaultName(score, partIndex) {
  return score.title + "（" + score.parts[partIndex].name + "）";
}

/**
 * 音符を判定から外す理由を返す関数
 * あとのステップ（練習ページ）でも、灰色にする音を決めるのに使う。
 * @param {object} note - 楽譜作成アプリの形の音符（休符ではないもの）
 * @returns {string|null} 外す理由（EXCLUDE_LABELS の名前。'range' など）。判定できる音なら null
 */
export function getExcludeReason(note) {
  // 重音は、いちばん上の音で判定する（notePitches は低い順に並んでいるので、最後がいちばん上）
  const pitches = notePitches(note);
  const top = pitches[pitches.length - 1];
  const noteNumber = pitchNumber(top);

  // 上から順に調べて、最初に当てはまった理由を返す
  if (noteNumber < MIN_NOTE_NUMBER || noteNumber > MAX_NOTE_NUMBER) return "range";
  if (hasDiamond(note)) return "harmonic";
  if (note.ornament) return "ornament";
  // （前打音の付いた音の判定：前打音の付いた音は、ここでは外さない。前打音のあとの主音で判定する）
  if (note.tremolo) return "tremolo";
  if (note.glissando) return "glissando";
  return null;
}

/**
 * 選んだパートを調べて、読み込むときに知らせることを作る関数
 * タイでつながった後ろの音は、前の音と同じ1つの音として数える（数えない）。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @param {number} partIndex - 選んだパートの番号（0から）
 * @returns {{notices: string[], judgeableCount: number}}
 *   notices：知らせる文の配列、judgeableCount：判定できる音の数
 */
export function analyzePart(score, partIndex) {
  const part = score.parts[partIndex];

  // 数える入れ物
  let chordCount = 0; // 重音の数
  let graceCount = 0; // 前打音の付いた、判定できる音の数（前打音の付いた音の判定）
  let judgeableCount = 0; // 判定できる音の数
  const excluded = {}; // 外す理由ごとの音の数（例：{ range: 3 }）

  // 1つ前の音符・休符（小節をまたいでもよい。タイの続きかどうかを調べるのに使う）
  let previous = null;

  part.measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      // 前の音からタイでつながってきた音か（つながってきた音は、前の音と1つの音として数えるので、ここでは数えない）
      const isTiedFromPrevious = previous !== null && !previous.rest && previous.tie;
      previous = note;

      // 休符と、タイの続きの音は数えない
      if (note.rest || isTiedFromPrevious) {
        return;
      }

      // 重音の数
      if (note.chord && note.chord.length > 0) {
        chordCount += 1;
      }

      // 判定から外す音か、判定できる音か
      const reason = getExcludeReason(note);
      if (reason === null) {
        judgeableCount += 1;
        if (note.grace) graceCount += 1; // 前打音の付いた音（前打音の付いた音の判定）
      } else {
        // excluded[reason] がまだ無いときは 0 として、1つ足す
        excluded[reason] = (excluded[reason] ?? 0) + 1;
      }
    });
  });

  // 知らせる文を作る
  const notices = [];

  // 重音
  if (chordCount > 0) {
    notices.push("重音 " + chordCount + "か所は、いちばん上の音で判定します");
  }

  // 前打音の付いた音（前打音の付いた音の判定）
  if (graceCount > 0) {
    notices.push("前打音 " + graceCount + "か所は、「じっくり」では前打音も判定します（「通し」は、前打音（灰色で表示します）のあとの音で判定します）");
  }

  // 判定から外す音（理由ごとに「○○ 3音」の形でつなげる）
  const excludedTexts = Object.keys(EXCLUDE_LABELS)
    .filter((reason) => excluded[reason] > 0)
    .map((reason) => EXCLUDE_LABELS[reason] + " " + excluded[reason] + "音");
  if (excludedTexts.length > 0) {
    notices.push("判定から外す音（灰色で表示します）：" + excludedTexts.join("、"));
  }

  // 途中で調号が変わるか（1小節目より後ろに、1小節目と違う調号の小節があるか）
  const firstSignature = keyAt(score, 0);
  const keyChangeCount = score.measures.filter((info, i) => i > 0 && info.key !== undefined && info.key !== firstSignature).length;
  if (keyChangeCount > 0) {
    notices.push("途中で調号が変わる所が " + keyChangeCount + "か所あります。純正律の計算は、ここで選んだ調で行います");
  }

  return { notices: notices, judgeableCount: judgeableCount };
}

/**
 * 保存する「読み込んだ楽譜」の形を作る関数
 * 選んだパートの小節だけを取り出す。id と読み込んだ日時は、保存するとき（addImportedScore）に付ける。
 * @param {object} score - 楽譜作成アプリの形の楽譜データ
 * @param {number} partIndex - 選んだパートの番号（0から）
 * @param {string} keyId - 選んだ調の id（例：'D-dur'）
 * @param {string} name - 名前
 * @returns {object} 保存する楽譜（このファイルの先頭の説明の形。id・importedAt はまだ無い）
 */
export function buildImportedScore(score, partIndex, keyId, name) {
  const part = score.parts[partIndex];
  return {
    name: name,
    title: score.title,
    partName: part.name,
    instrument: part.instrument,
    keyId: keyId,
    temperamentId: loadTemperamentId(),
    tempo: score.tempo,
    tempoText: score.tempoText ?? "",
    measures: score.measures,
    partMeasures: part.measures,
  };
}

/**
 * 読み込んだ楽譜を、id で1つ探す関数（ステップA-2）
 * 練習ページで、URL の id から楽譜を開くのに使う。
 * @param {string} id - 探す楽譜の id
 * @returns {object|null} 見つかった楽譜。見つからないときは null
 */
export function getImportedScore(id) {
  const score = loadImportedScores().find((item) => item.id === id);

  // find は、見つからないとき undefined を返すので、null に直して返す
  return score === undefined ? null : score;
}

/**
 * 読み込んだ楽譜を、五線譜に描くための形（楽譜作成アプリの楽譜データの形）に直す関数（ステップA-2）
 * 選んだパートを、1つだけのパートとして入れる。
 * タイトルと作曲者は空にする（練習ページでは、名前を五線譜の外に出すため。空にするとタイトルの場所を取らない）。
 * （ステップE-1：showSymbols が false のときは、弓の記号と指番号を取り除いた写しを入れる。
 *   保存してある楽譜そのものは書き換えない）
 * （保持線：保持線（指を押さえたままにする線）も、弓の記号・指番号といっしょに取り除くようにした）
 * @param {object} record - 読み込んだ楽譜
 * @param {boolean} [showSymbols=true] - 弓の記号・指番号・指の保持線を描くかどうか（省略したら描く）
 * @returns {object} 楽譜作成アプリの形の楽譜データ（パートは1つ）
 */
export function toRenderScore(record, showSymbols = true) {
  return {
    title: "",
    composer: "",
    tempo: record.tempo,
    tempoText: record.tempoText ?? "",
    measures: record.measures,
    parts: [
      {
        id: "imported", // パートの名札（楽譜作成アプリの形に合わせて入れておく。この中では使わない）
        name: record.partName,
        abbreviation: record.partName,
        instrument: record.instrument,
        measures: showSymbols ? record.partMeasures : removeBowingFingeringsAndHolds(record.partMeasures),
      },
    ],
  };
}

/**
 * 小節の並びから、弓の記号（bowing）・指番号（fingerings）・保持線（holdStart・holdEnd）を取り除いた写しを作る関数（ステップE-1）
 * 元の小節・音符は書き換えない（音符ごとに写しを作って、その写しから消す）。
 * （保持線：名前を removeBowingAndFingerings から変えて、保持線の始まりと終わりも消すようにした）
 * @param {object[]} partMeasures - 選んだパートの小節（読み込んだ楽譜の partMeasures）
 * @returns {object[]} 弓の記号・指番号・指の保持線のない小節の並び
 */
function removeBowingFingeringsAndHolds(partMeasures) {
  return partMeasures.map((measure) => ({
    ...measure,
    notes: measure.notes.map((note) => {
      // 「...」で写しを作り、写しのほうから項目を消す
      const copy = { ...note };
      delete copy.bowing;
      delete copy.fingerings;
      delete copy.holdStart; // 保持線の始まり（保持線）
      delete copy.holdEnd; // 保持線の終わり（保持線）
      return copy;
    }),
  }));
}

/**
 * 判定から外す音符を灰色にするための、音符ごとの色の表を作る関数（ステップA-2）
 * 五線譜を描く関数（render.js の renderScore）の noteColors に渡す。
 * タイでつながった後ろの音符も、前の音符が外す音なら灰色にする（1つの音として扱うので）。
 * @param {object[]} partMeasures - 選んだパートの小節（読み込んだ楽譜の partMeasures）
 * @returns {Map<string, string>} キーは "0-小節の番号-音符の番号"（パートはいつも 0）、値は色
 */
export function getExcludedNoteColors(partMeasures) {
  const colors = new Map();

  // 1つ前の音符・休符と、それが外す音だったか（小節をまたいでもよい。タイの続きを調べるのに使う）
  let previous = null;
  let previousExcluded = false;

  partMeasures.forEach((measure, i) => {
    measure.notes.forEach((note, j) => {
      // 休符：色は付けない
      if (note.rest) {
        previous = note;
        previousExcluded = false;
        return;
      }

      // 前の音からタイでつながってきた音なら、前の音と同じ扱い。そうでなければ、この音で調べる
      const isTiedFromPrevious = previous !== null && !previous.rest && previous.tie;
      const excluded = isTiedFromPrevious ? previousExcluded : getExcludeReason(note) !== null;

      if (excluded) {
        colors.set("0-" + i + "-" + j, EXCLUDED_COLOR);
      }

      previous = note;
      previousExcluded = excluded;
    });
  });

  return colors;
}

// ===== 判定する音の並び（ステップB） =====
//
// 【判定する音1つ分の形】
// {
//   note:      { step, accidental, octave }  … 音程チェックアプリの音の形（score.js と同じ。重音ならいちばん上の音）
//   positions: [{ measure, note }, ...]      … この音にあたる、五線譜の音符の場所（タイでつながった音符は全部入る）
//   baseIndex: 数                            … 前打音を入れない並び（「通し」・区間で使う並び）での番号（「じっくり」の前打音）
//   grace:     true                          … 前打音の目標のときだけ付く（前打音の目標の positions は、主音の場所）
// }

// 楽譜作成アプリの音名（"C"〜"B"）から、音程チェックアプリの音名の番号（0〜6。0 がド）への表
const STEP_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };

/**
 * 楽譜作成アプリの音の高さを、音程チェックアプリの音の形にする関数（ステップB）
 * （ステップC-3：お手本を鳴らすときにも使うので、ほかのファイルから使えるようにした（export））
 * @param {{step: string, alter: number, octave: number}} pitch - 楽譜作成アプリの音の高さ（例：{ step: 'F', alter: 1, octave: 5 }）
 * @returns {{step: number, accidental: number, octave: number}} 音程チェックアプリの音の形（例：{ step: 3, accidental: 1, octave: 5 }）
 */
export function toPitchNote(pitch) {
  return { step: STEP_INDEX[pitch.step], accidental: pitch.alter ?? 0, octave: pitch.octave };
}

/**
 * 判定する音の並びを作る関数（ステップB）
 * ・くり返しを展開するときは、楽譜作成アプリの再生と同じ順番（playOrder）で小節をたどる
 * ・タイでつながった音符は、1つの音にまとめる（くり返しで戻った所では、タイを切る）
 * ・休符と、判定から外す音（灰色の音。タイでつながった後ろの音符も）は入れない
 * ・重音は、いちばん上の音を目標にする
 * @param {object} record - 読み込んだ楽譜
 * ・（「じっくり」の前打音）includeGrace が true のときは、判定する主音の直前に、その前打音を1つの目標として入れる
 *   前打音が重音のときは、いちばん上の音を目標にする。前打音が音域の外のときは入れない
 *   （主音が判定から外れる音のときは、前打音も入れない。タイの続きの音符の前打音も入れない）
 *   前打音の目標には grace: true を付ける。前打音を入れない並びでの番号は baseIndex に入れておく
 * @param {object} record - 読み込んだ楽譜
 * @param {boolean} expandRepeats - くり返しを展開するなら true、書いてある順に1回ずつなら false
 * @param {boolean} [includeGrace=false] - 前打音も目標に入れるなら true（省略したら入れない。「通し」・区間を決めるときは入れない）
 * @returns {object[]} 判定する音の並び（このまとまりの先頭の説明の形）
 */
export function buildTargets(record, expandRepeats, includeGrace = false) {
  // 小節をたどる順番（展開しないときは、0, 1, 2, … と書いてある順）
  const order = expandRepeats ? playOrder(toRenderScore(record), 0) : record.partMeasures.map((_, i) => i);

  const targets = [];

  // 前打音を入れない並びで、次に入る主音の番号（前打音の目標に baseIndex を付けるため）
  let baseCount = 0;

  // 1つ前の音符・休符と、それが「判定する音」として入った先（入っていなければ null）
  let previous = null;
  let previousTarget = null;

  order.forEach((i, s) => {
    // くり返しで戻った所（前の小節のすぐ次ではない所）では、タイを切る
    if (s > 0 && i !== order[s - 1] + 1) {
      previous = null;
      previousTarget = null;
    }

    record.partMeasures[i].notes.forEach((note, j) => {
      // 前の音からタイでつながってきた音符か
      const isTiedFromPrevious = previous !== null && !previous.rest && previous.tie;
      previous = note;

      // 休符：入れない（タイのつながりも切れる）
      if (note.rest) {
        previousTarget = null;
        return;
      }

      // タイの続き：前の音（判定する音なら）に、この音符の場所を足すだけ
      if (isTiedFromPrevious) {
        if (previousTarget !== null) {
          previousTarget.positions.push({ measure: i, note: j });
        }
        return;
      }

      // 判定から外す音：入れない（このあとタイでつながる音符も、previousTarget が null なので入らない）
      if (getExcludeReason(note) !== null) {
        previousTarget = null;
        return;
      }

      // 判定する音：重音ならいちばん上の音（notePitches は低い順なので最後）
      const pitches = notePitches(note);

      // 「じっくり」の前打音：前打音の付いた主音なら、主音の直前に前打音の目標を入れる
      if (includeGrace && note.grace) {
        // 前打音の高さ（重音の前打音なら、いちばん上の音。低い順に並んでいるので最後）
        const gracePitches = [note.grace.pitch, ...(note.grace.chord ?? [])];
        const graceTop = gracePitches[gracePitches.length - 1];
        const graceNumber = pitchNumber(graceTop);
        // 判定できる音域に入っているときだけ入れる
        if (graceNumber >= MIN_NOTE_NUMBER && graceNumber <= MAX_NOTE_NUMBER) {
          targets.push({ note: toPitchNote(graceTop), positions: [{ measure: i, note: j }], grace: true, baseIndex: baseCount });
        }
      }

      const target = { note: toPitchNote(pitches[pitches.length - 1]), positions: [{ measure: i, note: j }], baseIndex: baseCount };
      baseCount += 1;
      targets.push(target);
      previousTarget = target;
    });
  });

  return targets;
}

/**
 * 楽譜に、くり返し（‖: :‖・1番2番かっこ・D.C. など）があるかを調べる関数（ステップB）
 * 区間を選ぶときに「くり返しを含める」のチェックを出すかどうかに使う。
 * @param {object} record - 読み込んだ楽譜
 * @returns {boolean} くり返しがあれば true
 */
export function hasRepeats(record) {
  // くり返しをたどった順番が、書いてある順（0, 1, 2, …）と違えば、くり返しがある
  const order = playOrder(toRenderScore(record), 0);
  return order.length !== record.partMeasures.length || order.some((i, k) => i !== k);
}

/**
 * 五線譜の音符の場所が、判定する音の並びの何番目にあたるかを、全部探す関数（ステップB）
 * くり返しを展開した並びでは、同じ音符が2回以上出てくることがあるので、全部の番号を返す。
 * @param {object[]} targets - 判定する音の並び
 * @param {{measure: number, note: number}} position - 五線譜の音符の場所
 * （「じっくり」の前打音：前打音の目標は数えない。五線譜の音符をタップしたときは、主音が目標になる）
 * @returns {number[]} 番号（0から）の配列（小さい順）。判定する音でない音符（休符・灰色の音）なら空の配列
 */
export function findTargetIndexes(targets, position) {
  const indexes = [];
  targets.forEach((target, index) => {
    // 前打音の目標は、タップで選ぶ相手にしない
    if (target.grace) {
      return;
    }
    if (target.positions.some((p) => p.measure === position.measure && p.note === position.note)) {
      indexes.push(index);
    }
  });
  return indexes;
}

/**
 * 区間を選ぶときにタップした2つの音符から、区間（判定する音の並びの、始めと終わりの番号）を決める関数（ステップB）
 * 前にあるほうを始め、後ろにあるほうを終わりにする（終わりの音符を先にタップしてもよい）。
 * くり返しを展開した並びでは、始めは「その音符の1回目」、終わりは「その音符の最後の回」にする。
 * @param {object[]} targets - 判定する音の並び
 * @param {{measure: number, note: number}} first - 1回目にタップした音符の場所
 * @param {{measure: number, note: number}} second - 2回目にタップした音符の場所
 * @returns {{start: number, end: number}|null} 区間の番号（0から）。どちらかが判定する音でないときは null
 */
export function findRange(targets, first, second) {
  const firstIndexes = findTargetIndexes(targets, first);
  const secondIndexes = findTargetIndexes(targets, second);
  if (firstIndexes.length === 0 || secondIndexes.length === 0) {
    return null;
  }

  // 始め：2つの音符の「1回目」のうち、前にあるほう
  const start = Math.min(firstIndexes[0], secondIndexes[0]);

  // 終わり：2つの音符の「最後の回」のうち、後ろにあるほう
  const end = Math.max(firstIndexes[firstIndexes.length - 1], secondIndexes[secondIndexes.length - 1]);

  return { start: start, end: end };
}

/**
 * 「通し」の音程の点数を、その楽譜の最高点と比べて、上回っていたら記録する関数（ステップC-1）
 * 最高点は、読み込んだ楽譜の中に bestPitchScore という名前で入れておく（まだ無いときは、項目そのものが無い）。
 * （手入力の楽譜の library.js の recordBestScore と同じ考え方）
 * @param {string} id - 楽譜の id
 * @param {number} points - 今回の点数（0〜100）
 * @returns {{bestScore: number, isNewRecord: boolean}|null}
 *   bestScore：記録した後の最高点、isNewRecord：今回の点数で最高点を更新したかどうか。
 *   その id の楽譜がないときや、書き込めなかったときは null
 */
export function recordBestPitchScore(id, points) {
  return recordBest(id, "bestPitchScore", points);
}

/**
 * 「通し」のリズムの点数を、その楽譜の最高点と比べて、上回っていたら記録する関数（ステップD）
 * 最高点は、読み込んだ楽譜の中に bestRhythmScore という名前で入れておく。
 * @param {string} id - 楽譜の id
 * @param {number} points - 今回の点数（0〜100）
 * @returns {{bestScore: number, isNewRecord: boolean}|null} recordBestPitchScore と同じ形
 */
export function recordBestRhythmScore(id, points) {
  return recordBest(id, "bestRhythmScore", points);
}

/**
 * 点数を、その楽譜の最高点と比べて、上回っていたら記録する関数（このファイルの中だけで使う）（ステップD）
 * 音程とリズムで、入れておく名前（field）だけが違うので、まとめた。
 * @param {string} id - 楽譜の id
 * @param {string} field - 最高点を入れておく名前（"bestPitchScore" か "bestRhythmScore"）
 * @param {number} points - 今回の点数（0〜100）
 * @returns {{bestScore: number, isNewRecord: boolean}|null} 記録した後の最高点と、更新したかどうか（楽譜がない・書き込めないときは null）
 */
function recordBest(id, field, points) {
  // 今の一覧を読み込んで、楽譜を探す
  const scores = loadImportedScores();
  const score = scores.find((item) => item.id === id);
  if (score === undefined) {
    return null;
  }

  // これまでの最高点（まだ無いときは null）
  const previousBest = typeof score[field] === "number" ? score[field] : null;

  // 最高点がまだ無いとき、または、今回の点数のほうが高いときは、更新する
  if (previousBest === null || points > previousBest) {
    score[field] = points;
    if (!writeImportedScores(scores)) {
      return null;
    }
    return { bestScore: points, isNewRecord: true };
  }

  // 更新しなかったとき：これまでの最高点をそのまま返す
  return { bestScore: previousBest, isNewRecord: false };
}

/**
 * 流れるモードの幅の倍率を、その楽譜に保存する関数（ステップE-2）
 * 倍率は、読み込んだ楽譜の中に flowScale という名前で入れておく（曲によって、ちょうどいい幅が違うため）。
 * @param {string} id - 楽譜の id
 * @param {number} scale - 幅の倍率（1 なら自動で決めた幅のまま）
 * @returns {boolean} 保存できたら true
 */
export function saveFlowScale(id, scale) {
  // 今の一覧を読み込んで、楽譜を探す
  const scores = loadImportedScores();
  const score = scores.find((item) => item.id === id);
  if (score === undefined) {
    return false;
  }
  score.flowScale = scale;
  return writeImportedScores(scores);
}

/**
 * 音律を、その楽譜に保存する関数
 * 音律は、読み込んだ楽譜の中に temperamentId という名前で入れてある。練習ページで選び直したときに、楽譜ごとに覚えるために使う。
 * （音律を変えても、楽譜の音は変わらないので、「通し」の最高点は消さない）
 * @param {string} id - 楽譜の id
 * @param {string} temperamentId - 音律の id（'just'・'pythagorean'・'equal'）
 * @returns {boolean} 保存できたら true
 */
export function saveImportedTemperament(id, temperamentId) {
  // 今の一覧を読み込んで、楽譜を探す
  const scores = loadImportedScores();
  const score = scores.find((item) => item.id === id);
  if (score === undefined) {
    return false;
  }
  // 音律だけを書き換える（最高点などは、そのまま残る）
  score.temperamentId = temperamentId;
  return writeImportedScores(scores);
}
