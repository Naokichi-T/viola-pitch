// 「通し」モードの点数を計算するファイル
// （ステップD：読み込んだ楽譜の「通し」のための、リズムの点数の計算をいちばん下に足した）
// 点の付け方を変えたくなったときは、このファイルだけを直せばよい。

// ずれ（セント）と点数の対応表。ずれの小さい順に並べておく
// 表の間の値は、前後の点を直線でつないで計算する
//   例：ずれ 20 は、10（90点）と 25（60点）の間なので 70点
// 一番上の行より小さいずれ（0〜5セント）は 100点、一番下の行より大きいずれ（100セント以上）は 0点
const SCORE_TABLE = [
  { cents: 5, points: 100 },
  { cents: 10, points: 90 },
  { cents: 25, points: 60 },
  { cents: 40, points: 42 },
  { cents: 50, points: 30 },
  { cents: 75, points: 15 },
  { cents: 100, points: 0 },
];

/**
 * 1つの音の、ずれ（セント）から点数を計算する関数
 * 高い・低いは区別せず、ずれの大きさだけで決める。
 * @param {number|null} cents - 目標の音とのずれ（セント）。音が出ていなかったときは null
 * @returns {number} 点数（0〜100 の整数）
 */
export function centsToPoints(cents) {
  // 音が出ていなかったときは 0点
  if (cents === null) {
    return 0;
  }

  // ずれの大きさ（高い・低いを区別しないので、マイナスを取る）
  const distance = Math.abs(cents);

  // 表の一番上の行より小さいずれは、一番上の行の点数（100点）
  if (distance <= SCORE_TABLE[0].cents) {
    return SCORE_TABLE[0].points;
  }

  // 表を上から順に見て、ずれがどの行とどの行の間にあるかを探す
  for (let index = 1; index < SCORE_TABLE.length; index += 1) {
    // 間の「前」の行と「後ろ」の行
    const previous = SCORE_TABLE[index - 1];
    const current = SCORE_TABLE[index];

    if (distance <= current.cents) {
      // 前の行から後ろの行までのうち、どのくらい進んだ位置か（0 なら前の行、1 なら後ろの行）
      const ratio = (distance - previous.cents) / (current.cents - previous.cents);

      // 前の行の点数から、進んだぶんだけ後ろの行の点数に近づける。小数は四捨五入する
      return Math.round(previous.points + (current.points - previous.points) * ratio);
    }
  }

  // 表の一番下の行より大きいずれは 0点
  return 0;
}

/**
 * 全体の点数を計算する関数
 * 1音ごとの点数を平均して、小数を四捨五入する。
 * @param {(number|null)[]} centsList - 1音ごとのずれ（セント）の配列。音が出ていなかった音は null
 * @returns {number} 全体の点数（0〜100 の整数）。配列が空のときは 0
 */
export function getTotalScore(centsList) {
  // 音が1つもないときは 0点（0 で割り算をしないため）
  if (centsList.length === 0) {
    return 0;
  }

  // 1音ごとの点数を全部足す
  let sum = 0;
  for (const cents of centsList) {
    sum += centsToPoints(cents);
  }

  // 音の数で割って平均にし、小数を四捨五入する
  return Math.round(sum / centsList.length);
}

// ===== リズムの点数（ステップD。読み込んだ楽譜の「通し」で使う） =====

// ずれ（秒）と点数の対応表。ずれの小さい順に並べておく（音程の SCORE_TABLE と同じ考え方）
// 表の間の値は、前後の点を直線でつないで計算する
//   例：ずれ 0.1秒は、0.08秒（90点）と 0.12秒（75点）の間なので 83点
// 一番上の行より小さいずれ（0〜0.04秒）は 100点、一番下の行より大きいずれ（0.4秒以上）は 0点
const RHYTHM_SCORE_TABLE = [
  { seconds: 0.04, points: 100 },
  { seconds: 0.08, points: 90 },
  { seconds: 0.12, points: 75 },
  { seconds: 0.2, points: 45 },
  { seconds: 0.3, points: 15 },
  { seconds: 0.4, points: 0 },
];

/**
 * 1つの音の、リズムのずれ（秒）から点数を計算する関数（ステップD）
 * 早い・遅いは区別せず、ずれの大きさだけで決める。
 * @param {number|null} seconds - お手本の始まりとのずれ（秒。マイナスは早い）。出だしが見つからなかったときは null
 * @returns {number} 点数（0〜100 の整数）
 */
export function secondsToPoints(seconds) {
  // 出だしが見つからなかったときは 0点
  if (seconds === null) {
    return 0;
  }

  const distance = Math.abs(seconds);

  // 表の一番上の行より小さいずれは 100点
  if (distance <= RHYTHM_SCORE_TABLE[0].seconds) {
    return RHYTHM_SCORE_TABLE[0].points;
  }

  // 表を上から順に見て、ずれがどの行とどの行の間にあるかを探し、直線でつないで計算する
  for (let index = 1; index < RHYTHM_SCORE_TABLE.length; index += 1) {
    const previous = RHYTHM_SCORE_TABLE[index - 1];
    const current = RHYTHM_SCORE_TABLE[index];
    if (distance <= current.seconds) {
      const ratio = (distance - previous.seconds) / (current.seconds - previous.seconds);
      return Math.round(previous.points + (current.points - previous.points) * ratio);
    }
  }

  // 表の一番下の行より大きいずれは 0点
  return 0;
}

/**
 * リズムの全体の点数を計算する関数（ステップD）
 * 1音ごとの点数を平均して、小数を四捨五入する。
 * @param {(number|null)[]} secondsList - 1音ごとのずれ（秒）の配列。出だしが見つからなかった音は null
 * @returns {number} 全体の点数（0〜100 の整数）。配列が空のときは 0
 */
export function getRhythmTotalScore(secondsList) {
  if (secondsList.length === 0) {
    return 0;
  }
  let sum = 0;
  for (const seconds of secondsList) {
    sum += secondsToPoints(seconds);
  }
  return Math.round(sum / secondsList.length);
}
