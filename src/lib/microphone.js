// 【iPad で音を拾わないのを直した手直し】
//   iPad の Safari では、ボタンを押した瞬間の処理の中で作らなかった AudioContext は、「一時停止」の状態で始まる
//   （自動で音が鳴るのを防ぐ決まり）。前は、マイクの許可を待った「あと」で作っていたので、一時停止のままになり、
//   マイクの音が流れてこなかった。そこで、
//     ① AudioContext を、許可を待つ「前」（ボタンを押した瞬間の処理の中）に作る
//     ② 念のため、一時停止なら再開する（resume）
//     ③ 波形を取り出す部品のあとに、音量0の部品をはさんでスピーカーまでつなぐ
//        （Safari では、スピーカーまでつながっていない流れが処理されないことがあるため。音量0なので音は出ない）
//   パソコン・Android の動きは変わらない
//   （確認用の表示で調べた結果、iPad で音名が出なかった本当の原因は、下の「音がとても小さく届く」ことだった。
//     この直しは、iPad で一時停止のまま始まるのを防ぐために、念のため残している）

// 【iPad・iPhone では、届いた音を30倍にする手直し】
//   iPad で調べると、エコー除去・雑音除去・音量の自動調整をオフにして頼むと（楽器の音をそのまま取るため）、
//   マイクの音がとても小さく届いていた（弾いているときの RMS が 0.001〜0.002。ほかの端末は 0.06 くらい）。
//   そのため、高さを調べ始める大きさ（pitch.js の MIN_RMS ＝ 0.004）に届かず、音名が出なかった。
//   いつもの設定（オンのまま）で頼むと大きく届くが、のばした音を雑音とみなして小さくしたり、音量を勝手に上げ下げしたりして、
//   判定に影響しそうなので、オフのまま頼んで、iPad・iPhone のときだけ、届いた音をアプリの中で30倍にする。
//   （iPad で試して、30倍で小さい音（pp）も音名が出て、針も落ち着き、弾いていないときは 0.004 より小さいことを確かめた）
//   パソコン・Android は1倍（今までどおり）

// 波形から周波数を検出する関数を読み込む
// （ステップD：音の大きさ（RMS）を計算する関数も読み込む）
import { detectPitch, calculateRms } from "./pitch.js";

// ===== マイクの音を調べるための設定値 =====

// 一度に取り出す波形データの個数。低い音でも周期を正確に測れるように、多めに取り出す
const FFT_SIZE = 4096;

// 直近の検出値を何回分ためておくか（1秒に約60回検出するので、12回分は約0.2秒分）
// ためた値の中央値を使うことで、たまに大きく外れた値が混ざっても影響を受けないようにする
// 多くすると値が安定するが、弾いた音への反応が遅くなる
const HISTORY_SIZE = 12;

// 音量（RMS）を計算するときに使う、波形の最後のほうのデータの個数（ステップD）
// 高さを調べるときの 4096個（約0.085秒）だと、弓を返したときの短い音量の下がりがならされて見えにくいので、
// 最後の 1024個（約0.02秒）だけで計算する
const RMS_SIZE = 1024;

// iPad・iPhone で、届いた音を何倍にするか（iPad・iPhone では、マイクの音がとても小さく届くため）
// （iPad・iPhone では、届いた音を30倍にする手直し。ほかの端末は1倍）
const APPLE_MOBILE_GAIN = 30;

// ===== マイクの音を調べるための部品 =====

// AudioContext：ブラウザで音を扱うための土台になる部品
let audioContext = null;

// AnalyserNode：音の波形データを取り出すための部品
let analyser = null;

// MediaStream：マイクから流れてくる音そのもの
let mediaStream = null;

// マイクの音を AudioContext の中に取り込むための部品
let sourceNode = null;

// 音量0の部品（波形を取り出す部品からスピーカーまでつなぐのに使う。音は出ない）（iPad で音を拾わないのを直した手直し）
let silentNode = null;

// 届いた音を大きくする部品（iPad・iPhone では30倍、ほかの端末は1倍）
let inputGainNode = null;

/**
 * iPad・iPhone かを調べる関数（iPad・iPhone では、届いた音を30倍にする手直し）
 * iPad の Safari は、パソコンの Mac と同じ名前（Macintosh）を名のるので、指で触れる点の数（maxTouchPoints）でも見分ける
 * @returns {boolean} iPad・iPhone なら true
 */
function isAppleMobile() {
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1;
}

// 繰り返し処理の番号（停止するときに使う）
let animationId = null;

// 波形データを入れておく入れ物（配列）
let waveform = null;

// 直近の検出値（Hz）をためておく配列。古いものから順に並ぶ
let history = [];

// 音の高さが分かるたびに呼ぶ関数（使う側のページから渡される）
let listener = null;

// マイクを開始した回数。開始の途中で停止されたことに気づくために使う
let requestCount = 0;

/**
 * 中央値を計算する関数
 * 中央値は、値を小さい順に並べたときに真ん中に来る値のこと。
 * たまに大きく外れた値が混ざっても、平均と違って影響を受けにくい。
 * @param {number[]} values - 数値の配列（1個以上入っていること）
 * @returns {number} 中央値
 */
function calculateMedian(values) {
  // 元の配列の順番を変えないように、コピーを作ってから小さい順に並べる
  const sorted = [...values].sort((a, b) => a - b);

  // 真ん中の位置を求める
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    // 個数が奇数のとき：真ん中の1個がそのまま中央値
    return sorted[middle];
  } else {
    // 個数が偶数のとき：真ん中の2個の平均が中央値
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
}

/**
 * マイクの音の高さを調べはじめる関数
 * マイクの使用許可を取り、音の高さが分かるたびに、渡された関数を呼ぶ。
 * ブラウザの決まりで、ボタンを押すなどの操作をきっかけにしないとマイクを使えないので、
 * この関数は、ボタンを押したときの処理の中から呼ぶこと。
 * マイクが使えないときは、理由を日本語で書いたエラーを投げる。
 * @param {(frequency: number|null, rms?: number, rawFrequency?: number|null) => void} onPitch
 *   音の高さが分かるたびに呼ばれる関数。周波数（Hz）が渡される。音が出ていないときは null が渡される
 *   （ステップD：2つ目に音量（RMS。0 に近いほど静か）、3つ目に、なめらかにする前のその回の周波数（検出できないときは null）も渡す。
 *    リズムの判定で、音の出だしを見つけるのに使う。1つ目だけを受け取る使い方は、今までどおり動く）
 */
export async function startMicrophone(onPitch) {
  // すでに動いていた場合は、いったん止める
  stopMicrophone();

  // 今回の開始に番号を付けておく（途中で停止されたら、番号が変わる）
  requestCount = requestCount + 1;
  const myRequest = requestCount;

  // マイクが使えない環境（HTTPSではないページなど）かどうかを確認する
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("このブラウザ（またはこのページ）ではマイクが使えません。");
  }

  // 音を扱う土台を、許可を待つ「前」に作る（ボタンを押した瞬間の処理の中で作るため）（iPad で音を拾わないのを直した手直し）
  // resume：一時停止の状態で作られたときに、再開を頼む（ここもボタンを押した瞬間の処理の中なので、iPad でも再開できる）
  const context = new AudioContext();
  if (context.state === "suspended") {
    context.resume().catch(() => {}); // 再開できなくても、あとでもう一度頼む
  }

  // マイクの使用許可を求める（ここでブラウザの許可ダイアログが出る）
  let stream;
  try {
    // 楽器の音をそのまま取り込みたいので、通話用の自動補正はすべてオフにする
    // （iPad・iPhone では、オフにすると音がとても小さく届くので、あとで30倍にする）
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false, // エコー除去をオフ
        noiseSuppression: false, // 雑音除去をオフ
        autoGainControl: false, // 音量の自動調整をオフ
      },
    });
  } catch (error) {
    // 許可を拒否された場合や、マイクが見つからない場合はここに来る
    context.close(); // 先に作った土台は使わないので閉じる（iPad で音を拾わないのを直した手直し）
    // 画面にそのまま表示できるように、日本語のメッセージにして投げ直す
    if (error.name === "NotAllowedError") {
      throw new Error("マイクの使用が許可されませんでした。ブラウザの設定を確認してください。");
    } else if (error.name === "NotFoundError") {
      throw new Error("マイクが見つかりませんでした。");
    } else {
      throw new Error("マイクの開始に失敗しました：" + error.message);
    }
  }

  // 許可を待っている間に停止されていた場合は、取得したマイクを止めて終わる
  if (myRequest !== requestCount) {
    stream.getTracks().forEach((track) => track.stop());
    context.close(); // 先に作った土台も閉じる（iPad で音を拾わないのを直した手直し）
    return;
  }

  // マイクの音を覚えておく
  mediaStream = stream;

  // 音を扱う土台（許可を待つ前に作ったもの）を使う（iPad で音を拾わないのを直した手直し）
  audioContext = context;
  // まだ一時停止のままなら、もう一度再開を頼む（再開できなくても先へ進む。そのときは音が流れてこない）
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch (error) {
      // 再開できなかった。何もしない
    }
    // 再開を待っている間に停止されていたら、ここで終わる（停止のほうで、マイクと土台は片付け済み）
    if (myRequest !== requestCount) return;
  }

  // マイクの音を土台の中に取り込む
  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // 波形を取り出す部品を作り、マイクの音をつなぐ
  analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  // 届いた音を何倍かにしてから、波形を取り出す部品につなぐ（iPad・iPhone では30倍、ほかの端末は1倍＝そのまま）
  // （iPad・iPhone では、届いた音を30倍にする手直し）
  inputGainNode = audioContext.createGain();
  inputGainNode.gain.value = isAppleMobile() ? APPLE_MOBILE_GAIN : 1;
  sourceNode.connect(inputGainNode);
  inputGainNode.connect(analyser);

  // 波形を取り出す部品のあとに音量0の部品をはさんで、スピーカーまでつなぐ（音は出ない）（iPad で音を拾わないのを直した手直し）
  // （Safari では、スピーカーまでつながっていない流れが処理されないことがあるため）
  silentNode = audioContext.createGain();
  silentNode.gain.value = 0;
  analyser.connect(silentNode);
  silentNode.connect(audioContext.destination);

  // 波形データを入れる入れ物を、データの個数ぶん用意する
  waveform = new Float32Array(analyser.fftSize);

  // 結果を伝える先の関数を覚えておく
  listener = onPitch;

  // 繰り返し処理を始める
  update();
}

/**
 * 繰り返し処理をする関数
 * 画面の描画に合わせて（1秒に約60回）呼ばれ続ける。
 * 波形データを取り出して周波数を検出し、結果を使う側に伝える。
 */
function update() {
  // 最新の波形データを入れ物に取り出す（値は -1 〜 1 の範囲）
  analyser.getFloatTimeDomainData(waveform);

  // 波形から周波数を検出する（検出できなかったときは null が入る）
  const detected = detectPitch(waveform, audioContext.sampleRate);

  // 波形の最後のほう（RMS_SIZE 個）の音量（ステップD）
  const rms = calculateRms(waveform.subarray(waveform.length - RMS_SIZE));

  if (detected === null) {
    // 検出できなかったとき：ためた値を消して、「音が出ていない」と伝える
    // （ステップD：音量と、なめらかにする前の値（null）も一緒に伝える）
    history = [];
    listener(null, rms, null);
  } else {
    // 検出できたとき：検出値を配列の最後に追加する
    history.push(detected);

    // ためる個数の上限を超えたら、一番古い値（先頭）を捨てる
    if (history.length > HISTORY_SIZE) {
      history.shift();
    }

    // ためた値の中央値を伝える
    // （ステップD：音量と、なめらかにする前のその回の値も一緒に伝える）
    listener(calculateMedian(history), rms, detected);
  }

  // 次の描画のタイミングで、もう一度この関数を呼ぶ
  animationId = requestAnimationFrame(update);
}

/**
 * マイクの音の高さを調べるのをやめる関数
 * 使っていた部品をすべて片付ける。動いていないときに呼んでも問題ない。
 */
export function stopMicrophone() {
  // 開始の途中だった場合に、それを打ち切れるように番号を変える
  requestCount = requestCount + 1;

  // 繰り返し処理を止める
  if (animationId !== null) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  // マイクと解析用の部品の接続を外す
  if (sourceNode !== null) {
    sourceNode.disconnect();
    sourceNode = null;
  }

  // 届いた音を大きくする部品の接続も外す（iPad・iPhone では、届いた音を30倍にする手直し）
  if (inputGainNode !== null) {
    inputGainNode.disconnect();
    inputGainNode = null;
  }

  // 音量0の部品の接続も外す（iPad で音を拾わないのを直した手直し）
  if (silentNode !== null) {
    silentNode.disconnect();
    silentNode = null;
  }

  // マイクを止める（ブラウザの「マイク使用中」の表示が消える）
  if (mediaStream !== null) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  // 音を扱う土台を閉じる
  if (audioContext !== null) {
    audioContext.close();
    audioContext = null;
  }

  // 残りの部品を初期状態に戻す
  analyser = null;
  waveform = null;
  history = [];
  listener = null;
}
