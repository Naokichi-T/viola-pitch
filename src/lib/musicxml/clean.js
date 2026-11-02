// ==========================================================
// clean.js
// 【音程チェックアプリ】MusicXML の読み込み（musicxmlImport.js）が使う「楽譜を決まりどおりに直す関数」をまとめたファイル（ステップA-1a）
// 楽譜作成アプリ（string-score）の src/lib/score/edit.js から、次の3つの関数だけをそのままコピーした
//   ・cloneScore      … 楽譜データをまるごとコピーする（cleanAlternates が使う）
//   ・cleanSpanners   … 相手がいなくなったスラー・松葉の印を外す
//   ・cleanAlternates … 2音トレモロの印を、決まりどおりに直す
// （保持線：楽譜作成アプリと同じく、cleanSpanners で保持線（holdStart・holdEnd）も調べるようにした。
//   そのために使う removeFinger もコピーした）
// （edit.js は編集の関数がたくさん入った 2400行ほどの大きいファイルで、
//   音程チェックアプリでは使わない関数ばかりなので、丸ごとは持ってこない）
// ==========================================================

// 2音トレモロとして扱えるかを調べる関数を読み込む（cleanAlternates が使う）
import { isAlternate } from "./model.js";

// ----------------------------------------------------------
// 関数：cloneScore
// 楽譜データをまるごとコピーする（コピーを書き換えても、元のデータは変わらない）
// ----------------------------------------------------------
export function cloneScore(score) {
  return JSON.parse(JSON.stringify(score));
}

// ----------------------------------------------------------
// 関数：removeFinger
// 音符の holdStart か holdEnd の並びから、指の番号を外す（空になったら項目ごと消す）（保持線）
//   note   … 音符のデータ（直接書き換える。コピーした楽譜データの中でだけ使う）
//   key    … "holdStart" か "holdEnd"
//   finger … 指の番号
// ----------------------------------------------------------
function removeFinger(note, key, finger) {
  if (!note[key]) return;
  note[key] = note[key].filter((f) => f !== finger);
  if (note[key].length === 0) delete note[key];
}

// ----------------------------------------------------------
// 関数：cleanSpanners
// 1つのパートの中で、相手がいなくなったスラー・松葉の印を外す
// （「ここから」だけ・「ここまで」だけが残ると、おかしな所どうしがつながってしまうため）
// ----------------------------------------------------------
export function cleanSpanners(part) {
  // 休符ではない音符を、前から順に並べる
  const notes = [];
  part.measures.forEach((measure) => {
    measure.notes.forEach((note) => {
      if (!note.rest) notes.push(note);
    });
  });

  // スラー（"start" と "stop"）を調べる
  // （「どんな音符でも入る」と VSCode に教えておく。書かないと、null しか入らないと思われてエラーになる）
  /** @type {any} */
  let open = null; // 「ここから」の印が付いていて、まだ「ここまで」が来ていない音符
  notes.forEach((note) => {
    const value = note.slur;
    if (value === undefined) return;
    if (value === "stop") {
      if (open) {
        open = null; // 正しい組になった
      } else {
        delete note.slur; // 「ここから」がない「ここまで」は外す
      }
    } else {
      if (open) delete open.slur; // 前の「ここから」に「ここまで」がなかったので外す
      open = note;
    }
  });
  if (open) delete open.slur; // 最後まで「ここまで」が来なかった「ここから」は外す

  // 松葉（始まり wedge と終わり wedgeEnd）を調べる
  // 1つの音符では「前の松葉の終わり → 次の松葉の始まり」の順に見る（＜ の終わりの音符から ＞ が始まる形のため）
  // （音符の下だけの松葉 wedgeInside は、1つの音符で完結しているので調べない）
  /** @type {any} */
  let openWedge = null; // 始まりが付いていて、まだ終わりが来ていない音符
  notes.forEach((note) => {
    if (note.wedgeEnd) {
      if (openWedge) {
        openWedge = null; // 正しい組になった
      } else {
        delete note.wedgeEnd; // 始まりのない終わりは外す
      }
    }
    if (note.wedge) {
      if (openWedge) delete openWedge.wedge; // 前の始まりに終わりがなかったので外す
      openWedge = note;
    }
  });
  if (openWedge) delete openWedge.wedge; // 最後まで終わりが来なかった始まりは外す

  // 保持線（始まり holdStart と終わり holdEnd）を、指の番号ごとに調べる（保持線）
  // 松葉と同じく、1つの音符では「前の線の終わり → 次の線の始まり」の順に見る
  const openHolds = new Map(); // 指の番号 → 始まりが付いていて、まだ終わりが来ていない音符
  notes.forEach((note) => {
    [...(note.holdEnd ?? [])].forEach((finger) => {
      if (openHolds.has(finger)) {
        openHolds.delete(finger); // 正しい組になった
      } else {
        removeFinger(note, "holdEnd", finger); // 始まりのない終わりは外す
      }
    });
    [...(note.holdStart ?? [])].forEach((finger) => {
      if (openHolds.has(finger)) removeFinger(openHolds.get(finger), "holdStart", finger); // 前の始まりに終わりがなかったので外す
      openHolds.set(finger, note);
    });
  });
  openHolds.forEach((note, finger) => removeFinger(note, "holdStart", finger)); // 最後まで終わりが来なかった始まりは外す
}

// ----------------------------------------------------------
// 関数：cleanAlternates
// 2音トレモロの印（alternate）を、決まりどおりに直す
//   ・2音トレモロにできなくなった音符からは、印 alternate を外す（ふつうの重音・音符に戻る）
//   ・2音トレモロの音符のタイと、前の音から2音トレモロへのタイを外す
// 直すものがなければ、渡された楽譜データをそのまま返す
//   score … 楽譜データ
// 戻り値：楽譜データ（直したときは、新しく作ったもの）
// ----------------------------------------------------------
export function cleanAlternates(score) {
  // 直すものがあるか、先に調べる
  const needsFix = score.parts.some((part) => {
    let prev = null; // 1つ前の音符・休符（小節をまたいでもよい）
    return part.measures.some((measure) =>
      measure.notes.some((note) => {
        const broken = note.alternate && !isAlternate(note); // 使えなくなった印
        const tied = isAlternate(note) && (note.tie || (prev && !prev.rest && prev.tie)); // つながったタイ
        prev = note;
        return broken || tied;
      }),
    );
  });
  if (!needsFix) return score;

  // 新しく作って直す
  const newScore = cloneScore(score);
  newScore.parts.forEach((part) => {
    let prev = null;
    part.measures.forEach((measure) => {
      measure.notes.forEach((note) => {
        if (note.alternate && !isAlternate(note)) delete note.alternate;
        if (isAlternate(note)) {
          if (note.tie) note.tie = false;
          if (prev && !prev.rest && prev.tie) prev.tie = false;
        }
        prev = note;
      });
    });
  });
  return newScore;
}
