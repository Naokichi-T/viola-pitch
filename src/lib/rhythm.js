// リズムの判定のために、マイクの記録から「音の出だし」の時刻を見つけるファイル（ステップD）
// （ステップE-3：rit.・フェルマータのあとなどで OK の範囲を広げた音は、探す範囲も広げるようにした）
// 読み込んだ楽譜の「通し」（ImportedRunPractice.svelte）で使う。
//
// 【マイクの記録の形】（演奏中に、1秒に約60回ためていくもの）
// { time: 2.31, frequency: 441.2, rms: 0.03 }
//   time      ：時刻表と同じ数え方の時刻（秒）
//   frequency ：その回に調べた高さ（Hz。なめらかにする前の値。音が出ていないときは null）
//   rms       ：その回の音量（0 に近いほど静か）
//
// 【見つけ方】
// ・前の音と高さが違うとき・前が休符のとき：「目標の高さになった最初の時刻」（2回続けて目標の高さなら、その1回目）
//   （ステップD-5：目標の高さにならなかったとき（音程が大きく外れたとき）は、
//     「高さが前の音から変わった時刻」か「無音のあとに鳴り始めた時刻」、それもなければ「音量が下がってまた上がった時刻」にする。
//     音程が外れていても、リズムは判定できるようにするため。
//     そのときは、ひとつ前の音の出だし（もう見つかっているもの）より少し後だけを探す。
//     短い音で大きく遅れたとき、ひとつ前の音の弾き始めを、今の音の出だしと間違えないようにするため）
//   ただし、その少し前（0.15秒以内）に「音量が下がってまた上がった」所があれば、そちらを出だしにする
//   （高さは、前の音と新しい音が混ざっている間は目標の高さにならず、音量よりおそく変わるため。弓を返したときなど）
// ・前の音と同じ高さで、つながっているとき：「音量がいったん下がって、また上がった時刻」（弓を返して弾き直したところ）
// どちらも、お手本の始まりの少し前から、音の長さの7割（0.35秒まで）の間で探す。見つからなければ null。
// （ステップD-2：メトロノームのクリックの直後に、クリックの高さ（1000Hz・1500Hz）を拾った記録は、高さを「なし」として扱う。
//   1拍目のクリックは高い音なので、高さで見つけるときにも、クリックの音を拾ってしまうことがあったため。
//   クリックの直後でも、ビオラの高さを拾えている記録は使う（拍の頭で弾き始めた出だしを見のがさないため））

// ===== 見つけ方の設定値 =====

// マイクの記録の時刻から差し引く「遅れ」（秒）
// 高さも音量も、少し前の音の波から計算するので、新しい音が半分くらい入ったところで変わる（0.085秒の波の半分 ≒ 0.04秒）。
// それに、マイクから音が届くまでの遅れを少し足した値
export const ONSET_LATENCY = 0.05;

// お手本の始まりの、何秒前から探すか（前の音が短いときは、前の音の長さの半分まで）
const SEARCH_BEFORE = 0.25;

// お手本の始まりの、何秒後まで探すか（その音の長さの7割まで）
const SEARCH_AFTER = 0.35;
const SEARCH_AFTER_RATIO = 0.7;

// OK の範囲を広げた音で、OK の範囲よりどれだけ先まで探すか（秒）（ステップE-3）
// （OK の範囲ぎりぎりで弾いた出だしも、見つけられるようにするため）
const SEARCH_MARGIN = 0.05;

// 「目標の高さ」とみなす範囲（セント）。音程が少しずれていても、出だしは見つけたいので、広めにする
const PITCH_MATCH_CENTS = 70;

// 「高さが変わった」とみなす、前の音の高さとの差（セント）（ステップD-5）
// ビブラート（±20〜30セントくらい）を、高さが変わったと間違えないように、それより大きくする
const PITCH_CHANGE_CENTS = 60;

// 「音が鳴っている」とみなす、いちばん小さい音量（ステップD-5）
// マイクで高さを調べるときに「音が出ていない」とする音量（pitch.js の MIN_RMS）と同じ値。
// 高さの変わり目・音量で出だしを探すときに、無音の中の小さな雑音（メトロノームの鳴り終わりなど）を、
// 出だしと間違えないようにするため
const MIN_SOUND_RMS = 0.004;

// ひとつ前の音の出だしから、何秒あとから「高さの変わり目」を探すか（ステップD-5）
// ひとつ前の音の弾き始め（高さが混ざっている所）を、今の音の出だしと間違えないようにするため
const PREVIOUS_ONSET_GAP = 0.08;

// 「高さが落ち着いている」とみなす、続けて調べた2回の高さの差（セント）（ステップD-5）
// 音の変わり目の、高さが混ざっている途中の値を拾わないようにするため
const PITCH_STABLE_CENTS = 30;

// 「目標の高さになった時刻」から、さかのぼって音量の上がり目を探す長さ（秒）
const LOOK_BACK = 0.15;

// 音量の上がり目が見つからないとき（スラーで高さが変わったときなど）に、「目標の高さになった時刻」から、さらに差し引く時間（秒）
// 高さは、前の音と新しい音が混ざっている間（約0.05秒）は目標の高さにならないため、そのぶん早めにする
const PITCH_EXTRA_LATENCY = 0.03;

// 音量が「いったん下がった」とみなす割合（下がる前の音量の 7割より小さくなったら）
const DIP_RATIO = 0.7;

// 音量が「また上がった」とみなす割合（下がった所から、そのあとのいちばん大きい音量までの、半分まで戻ったら）
const RISE_RATIO = 0.5;

// メトロノームのクリックの直後、音量の変化を数えない時間（秒）（クリックの音をマイクが拾うため）
const CLICK_IGNORE = 0.05;

// メトロノームのクリックの直後、クリックの高さを拾っていないか調べる時間（秒）（ステップD-2）
// クリックは 0.05秒鳴り、高さは 0.085秒ぶんの波から調べるので、鳴り終わっても少しの間はクリックの高さが出る。
// それに、スピーカーから音が出るまでの遅れを足して、長めにしてある
// （ステップD-5：0.2 から 0.3 にした。テストで、クリックの0.09〜0.2秒後までクリックの高さが残っていて、ぎりぎりだったため。
//   クリックの高さに近い音（シ5・ファ♯6 くらい）だけをよけるので、長くしても、ほかの音の判定には影響しない）
const CLICK_PITCH_WINDOW = 0.3;

// クリックの高さ（Hz）（audio.js の CLICK_FREQUENCY・ACCENT_CLICK_FREQUENCY と同じ値）（ステップD-2）
const CLICK_FREQUENCIES = [1000, 1500];

// クリックの高さとみなす範囲（セント）（ステップD-2）
const CLICK_MATCH_CENTS = 50;

/**
 * 2つの周波数が、何セント離れているかを返す関数（このファイルの中だけで使う）
 * @param {number} a - 周波数（Hz）
 * @param {number} b - 周波数（Hz）
 * @returns {number} 離れているセントの大きさ（プラスの数）
 */
function centsBetween(a, b) {
  return Math.abs(1200 * Math.log2(a / b));
}

/**
 * 1つの音の、出だしの時刻を見つける関数（ステップD）
 * @param {{time: number, frequency: number|null, rms: number}[]} frames - マイクの記録（時刻の順）
 * @param {object} item - 時刻表の音（start・end と、method（"pitch" か "volume"）が入っているもの）
 * @param {object|null} previous - 時刻表の1つ前の音（最初の音なら null）。探す範囲を決めるのに使う
 * @param {number} targetFrequency - 目標の高さ（Hz）
 * @param {number[]} clickTimes - メトロノームのクリックを鳴らした時刻（秒）の並び（鳴らしていなければ空）
 * @param {number|null} previousOnset - ひとつ前の音の、見つかった出だしの時刻（秒）。分からないときは null（ステップD-5）
 * @param {number} tolerance - この音の、リズムの OK とする範囲（秒）（ステップE-3）
 *                             rit.・フェルマータのあとなどで広げた音では、探す範囲も、OK の範囲より少し先まで広げる
 *                             （ただし、前の音の長さの半分・この音の長さの7割は超えない。前後の音と取り違えないように）
 *                             省略したら 0（今までどおりの探す範囲）
 * @returns {number|null} 出だしの時刻（秒。時刻表と同じ数え方）。見つからないときは null
 */
export function findOnset(frames, item, previous, targetFrequency, clickTimes, previousOnset = null, tolerance = 0) {
  // 探す範囲（ステップE-3：OK の範囲が広いときは、OK の範囲より SEARCH_MARGIN だけ先まで探す）
  const searchBefore = Math.max(SEARCH_BEFORE, tolerance + SEARCH_MARGIN);
  const searchAfter = Math.max(SEARCH_AFTER, tolerance + SEARCH_MARGIN);
  const before = previous !== null ? Math.min(searchBefore, (previous.end - previous.start) * 0.5) : searchBefore;
  const after = Math.min(searchAfter, (item.end - item.start) * SEARCH_AFTER_RATIO);
  const from = item.start - before;
  const to = item.start + after;

  // 範囲の中の記録（遅れのぶんを差し引いた時刻で見る）
  // （ステップD-2：クリックの高さを拾った記録は、高さを null（音なし）にしておく。
  //   クリックの直後かどうかは、遅れを差し引く前の時刻（frame.time）とクリックの時刻をそのまま比べる）
  const inRange = [];
  frames.forEach((frame) => {
    const time = frame.time - ONSET_LATENCY;
    if (time >= from && time <= to) {
      const frequency = isClickNoise(frame.time, frame.frequency, clickTimes) ? null : frame.frequency;
      inRange.push({ time: time, frequency: frequency, rms: frame.rms });
    }
  });
  if (inRange.length < 3) {
    return null;
  }

  if (item.method === "volume") {
    return findVolumeOnset(inRange, clickTimes);
  }

  // 高さの変わり目を探すときに使う記録（ステップD-5）
  // ひとつ前の音の出だしが分かっているときは、それより少し後の記録だけを使う
  const changeRecords = previousOnset !== null ? inRange.filter((record) => record.time > previousOnset + PREVIOUS_ONSET_GAP) : inRange;

  // 目標の高さになった時刻を探す
  const onset = findPitchOnset(inRange, targetFrequency);
  if (onset !== null && onset !== inRange[0].time) {
    return onset;
  }

  // 範囲のはじめから、もう目標の高さだったとき（ステップD-5）
  // とても早く弾き始めたのかもしれないが、前の音が外れていて、たまたま今の音の高さに近かっただけかもしれない。
  // そこで、そのあとに高さが変わった所（または無音のあとの鳴り始め）があれば、そちらを出だしにする。
  // なければ、とても早く弾き始めた（範囲の最初の時刻）とする
  if (onset !== null) {
    return findPitchChangeOnset(changeRecords) ?? onset;
  }

  // 見つからないとき（音程が大きく外れたとき）は、高さが変わった時刻を探し、それもなければ音量で探す（ステップD-5）
  const changed = findPitchChangeOnset(changeRecords);
  if (changed !== null) {
    return changed;
  }
  // 音量で探すときも、ひとつ前の音の出だしより少し後だけを探す
  return changeRecords.length >= 3 ? findVolumeOnset(changeRecords, clickTimes) : null;
}

/**
 * マイクで拾った高さが、メトロノームのクリックの音かどうかを調べる関数（ステップD-2）
 * 「クリックを鳴らした直後（CLICK_PITCH_WINDOW 秒以内）」で、「高さがクリックの高さ（1000Hz・1500Hz）に近い」ときに true。
 * クリックの直後でも、ビオラの高さを拾えているときは false（使ってよい）。
 * 音程の判定（ImportedRunPractice.svelte）でも使うので、ほかのファイルから使えるようにしてある（export）。
 * @param {number} time - マイクの記録の時刻（秒。時刻表と同じ数え方。遅れを差し引く前）
 * @param {number|null} frequency - 拾った高さ（Hz）。音が出ていないときは null
 * @param {number[]} clickTimes - クリックを鳴らした時刻（秒）の並び
 * @returns {boolean} クリックの音なら true
 */
export function isClickNoise(time, frequency, clickTimes) {
  if (frequency === null) {
    return false;
  }
  const afterClick = clickTimes.some((click) => time >= click && time < click + CLICK_PITCH_WINDOW);
  if (!afterClick) {
    return false;
  }
  return CLICK_FREQUENCIES.some((click) => centsBetween(frequency, click) <= CLICK_MATCH_CENTS);
}

/**
 * 「目標の高さになった最初の時刻」を見つける関数（このファイルの中だけで使う）（ステップD）
 * 2回続けて目標の高さだったとき、その1回目の時刻を出だしにする（たまたま1回だけ近い値が出たのを拾わないため）。
 * 範囲のいちばん最初から、もう目標の高さだったときは、範囲の最初の時刻（＝とても早く弾き始めた）にする。
 * @param {{time: number, frequency: number|null}[]} records - 範囲の中の記録
 * @param {number} targetFrequency - 目標の高さ（Hz）
 * @returns {number|null} 出だしの時刻（秒）
 */
function findPitchOnset(records, targetFrequency) {
  const matches = records.map((record) => record.frequency !== null && centsBetween(record.frequency, targetFrequency) <= PITCH_MATCH_CENTS);
  for (let k = 0; k + 1 < records.length; k++) {
    if (matches[k] && matches[k + 1]) {
      // 範囲のいちばん最初から目標の高さ：とても早く弾き始めた（範囲の最初の時刻）
      if (k === 0) {
        return records[0].time;
      }

      // 目標の高さになった時刻の少し前に、音量の上がり目があれば、そちらを出だしにする
      // 上がり目がない（スラーで高さだけが変わったなど）ときは、高さが混ざっていたぶん、少し早めにする
      // （ステップD-5：この2つは、高さが変わった時刻を探すときにも使うので、refineOnset に取り出した）
      return refineOnset(records, records[k].time);
    }
  }
  return null;
}

/**
 * 「高さが前の音から変わった時刻」を見つける関数（このファイルの中だけで使う）（ステップD-5）
 * 目標の高さにならなかった（音程が大きく外れた）ときに使う。
 * ・範囲のはじめに鳴っている高さを「前の音の高さ」として覚え、そこから PITCH_CHANGE_CENTS 以上ちがう高さが
 *   2回続いた（しかも2回の差が PITCH_STABLE_CENTS 以内で落ち着いている）ら、その1回目を出だしにする
 * ・無音（高さが null）のあとに、落ち着いた高さが2回続いたら、その1回目を出だしにする（休符のあとや、弓を離したあと）
 * 出だしの時刻は、findPitchOnset と同じように、少し前に音量の上がり目があればそちら、なければ少し早めにする。
 * @param {{time: number, frequency: number|null, rms: number}[]} records - 範囲の中の記録
 * @returns {number|null} 出だしの時刻（秒）
 */
function findPitchChangeOnset(records) {
  // 前の音の高さ（まだ分からないときは null）と、その後に無音があったかどうか
  let reference = null;
  let silenceSeen = false;

  for (let k = 0; k + 1 < records.length; k++) {
    const a = records[k].frequency;
    const b = records[k + 1].frequency;

    // 無音（高さが分からない回）：無音があったことを覚えておく
    if (a === null) {
      silenceSeen = true;
      continue;
    }

    // 2回続けて高さがあり、落ち着いていて、音が鳴っている大きさか（小さな雑音の高さは使わない）
    const loud = records[k].rms >= MIN_SOUND_RMS && records[k + 1].rms >= MIN_SOUND_RMS;
    const stable = b !== null && loud && centsBetween(a, b) <= PITCH_STABLE_CENTS;
    if (!stable) {
      continue;
    }

    // 範囲のはじめから鳴っている音（無音をはさまない最初の高さ）は、前の音として覚える
    if (reference === null && !silenceSeen) {
      reference = a;
      continue;
    }

    // 無音のあとに鳴り始めた・前の音から高さが変わった：ここを出だしにする
    if (silenceSeen || centsBetween(a, reference) >= PITCH_CHANGE_CENTS) {
      return refineOnset(records, records[k].time);
    }
  }
  return null;
}

/**
 * 高さで見つけた出だしの時刻を、音量の上がり目で少し前に直す関数（このファイルの中だけで使う）（ステップD-5）
 * findPitchOnset でしていたことを取り出したもの。
 * 少し前（LOOK_BACK 秒以内）に音量の上がり目があればそちら、なければ PITCH_EXTRA_LATENCY だけ早めにする。
 * @param {{time: number, rms: number}[]} records - 範囲の中の記録
 * @param {number} matchTime - 高さで見つけた時刻（秒）
 * @returns {number} 出だしの時刻（秒）
 */
function refineOnset(records, matchTime) {
  const nearby = records.filter((record) => record.time >= matchTime - LOOK_BACK && record.time <= matchTime);
  const rise = nearby.length >= 3 ? findVolumeOnset(nearby, []) : null;
  if (rise !== null && rise <= matchTime) {
    return rise;
  }
  return matchTime - PITCH_EXTRA_LATENCY;
}

/**
 * 「音量がいったん下がって、また上がった時刻」を見つける関数（このファイルの中だけで使う）（ステップD）
 * 範囲の中で音量がいちばん小さい所を探し、その前より十分に下がっていれば、そのあと半分まで戻った時刻を出だしにする。
 * メトロノームのクリックの直後の記録は、音量の変化に使わない。
 * @param {{time: number, rms: number}[]} records - 範囲の中の記録
 * @param {number[]} clickTimes - メトロノームのクリックを鳴らした時刻（秒）
 * @returns {number|null} 出だしの時刻（秒）
 */
function findVolumeOnset(records, clickTimes) {
  // クリックの直後の記録を除く（記録の時刻は遅れを差し引いてあるので、クリックの時刻とそのまま比べる）
  const usable = records.filter((record) => !clickTimes.some((click) => record.time >= click && record.time < click + CLICK_IGNORE + ONSET_LATENCY));
  if (usable.length < 3) {
    return null;
  }

  // 音量がいちばん小さい所
  let lowest = 0;
  usable.forEach((record, k) => {
    if (record.rms < usable[lowest].rms) {
      lowest = k;
    }
  });

  // その前のいちばん大きい音量（下がる前の音量）と、そのあとのいちばん大きい音量
  const beforePeak = Math.max(...usable.slice(0, lowest + 1).map((record) => record.rms));
  const afterRecords = usable.slice(lowest);
  const afterPeak = Math.max(...afterRecords.map((record) => record.rms));

  // 十分に下がっていなければ、弾き直していない（見つからない）
  if (usable[lowest].rms > beforePeak * DIP_RATIO) {
    return null;
  }

  // 下がった所から、そのあとのいちばん大きい音量の半分まで戻った最初の時刻
  // （ステップD-5：戻った音量が「音が鳴っている」大きさ（MIN_SOUND_RMS 以上）のときだけにした。
  //   無音の中の小さな雑音（メトロノームの鳴り終わりなど）を、出だしと間違えないようにするため）
  const threshold = Math.max(usable[lowest].rms + (afterPeak - usable[lowest].rms) * RISE_RATIO, MIN_SOUND_RMS);
  const rise = afterRecords.find((record) => record.rms >= threshold && record.rms > usable[lowest].rms);
  return rise !== undefined ? rise.time : null;
}
