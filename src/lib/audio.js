// ===== 音を鳴らすための設定値 =====

// 音の大きさ（0〜1）。大きすぎると音が割れるので、ひかえめにしておく
const VOLUME = 0.2;

// 音の出はじめに、音量を 0 から上げていく時間（秒）
// いきなり鳴らすと「プツッ」という雑音が出るので、短い時間をかけて上げる
const ATTACK_TIME = 0.03;

// 音の終わりに、音量を 0 まで下げていく時間（秒）
const RELEASE_TIME = 0.1;

// 鳴っている音を途中で止めるときに、音量を 0 まで下げる時間（秒）
const QUICK_STOP_TIME = 0.03;

// 高い倍音をどこから弱めるか（Hz）。小さくするほど、やわらかい（こもった）音になる
const FILTER_FREQUENCY = 2500;

// 合図の音の大きさ（0〜1）。練習の邪魔にならないように、お手本の音より小さくする
const CHIME_VOLUME = 0.3;

// 合図の音1つぶんの長さ（秒）
const CHIME_NOTE_SECONDS = 0.12;

// ===== 音を鳴らすための部品 =====

// AudioContext：ブラウザで音を扱うための土台になる部品
// 最初に音を鳴らすときに1回だけ作り、そのあとは同じものを使い回す
let audioContext = null;

// 今鳴っている音の部品（鳴っていないときは null）
// 次の音を鳴らす前に、前の音を止めるために覚えておく
let currentOscillator = null;
let currentGain = null;

/**
 * 音を扱う土台（AudioContext）を用意する関数
 * まだ作っていなければ作り、止まっていれば動かす。
 * ブラウザの決まりで、ボタンを押すなどの操作をきっかけにしないと音を出せないので、
 * この関数は、ボタンを押したときの処理の中から呼ぶこと。
 * @returns {AudioContext} 音を扱う土台
 */
function getAudioContext() {
  // まだ作っていないときだけ作る
  if (audioContext === null) {
    audioContext = new AudioContext();
  }

  // ブラウザが土台を一時停止していることがあるので、そのときは動かす
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

/**
 * 今鳴っている音を止める関数
 * 音量をすばやく 0 まで下げてから止める（急に止めると雑音が出るため）。
 * 何も鳴っていないときは、何もしない。
 */
export function stopTone() {
  // 何も鳴っていないとき
  if (currentOscillator === null) {
    return;
  }

  // 今の時刻（AudioContext が動きはじめてからの秒数）
  const now = audioContext.currentTime;

  // 予定していた音量の変化を取り消して、今の音量から 0 まで下げる
  currentGain.gain.cancelScheduledValues(now);
  currentGain.gain.setValueAtTime(currentGain.gain.value, now);
  currentGain.gain.linearRampToValueAtTime(0, now + QUICK_STOP_TIME);

  // 音量が 0 になった時点で、音を作る部品を止める
  currentOscillator.stop(now + QUICK_STOP_TIME);

  // 「何も鳴っていない」状態に戻す
  currentOscillator = null;
  currentGain = null;
}

/**
 * 指定した周波数の音を、決まった長さだけ鳴らす関数
 * 前の音が鳴っている途中なら、それを止めてから鳴らす。
 * @param {number} frequency - 鳴らす音の周波数（Hz）
 * @param {number} duration - 鳴らす長さ（秒）。指定しないときは 0.8 秒
 */
export function playTone(frequency, duration = 0.8) {
  // 音を扱う土台を用意する
  const context = getAudioContext();

  // 前の音が鳴っていれば止める（音が重なって濁るのを防ぐ）
  stopTone();

  // 今の時刻（AudioContext が動きはじめてからの秒数）
  const now = context.currentTime;

  // ----- 音を作る部品（OscillatorNode） -----
  const oscillator = context.createOscillator();

  // 波の形を「のこぎり波」にする。倍音をたくさん含んでいて、弦楽器に少し近い音になる
  oscillator.type = "sawtooth";

  // 音の高さ（周波数）を決める
  oscillator.frequency.value = frequency;

  // ----- 音をやわらかくする部品（BiquadFilterNode） -----
  const filter = context.createBiquadFilter();

  // 「lowpass」は、決めた周波数より高い成分を弱めるフィルター
  // のこぎり波はそのままだときつい音なので、高い倍音を弱めてやわらかくする
  filter.type = "lowpass";
  filter.frequency.value = FILTER_FREQUENCY;

  // ----- 音量を決める部品（GainNode） -----
  const gain = context.createGain();

  // 音量を 0 からはじめて、短い時間で決めた大きさまで上げる
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(VOLUME, now + ATTACK_TIME);

  // 終わりの少し前まで音量を保ち、最後に 0 まで下げる
  gain.gain.setValueAtTime(VOLUME, now + duration - RELEASE_TIME);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  // ----- 部品をつなぐ：音を作る → やわらかくする → 音量を決める → スピーカー -----
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  // 鳴らしはじめる時刻と、止める時刻を予約する
  oscillator.start(now);
  oscillator.stop(now + duration);

  // 今鳴っている音として覚えておく
  currentOscillator = oscillator;
  currentGain = gain;

  // 音が最後まで鳴り終わったら、「何も鳴っていない」状態に戻す
  // （途中で次の音に切り替わっていた場合は、次の音の情報を消さないように何もしない）
  oscillator.onended = () => {
    if (currentOscillator === oscillator) {
      currentOscillator = null;
      currentGain = null;
    }
  };
}

/**
 * 短い合図の音を鳴らす関数
 * 渡された周波数の音を、1つずつ順に、短く鳴らす。
 * 澄んだ音（正弦波）を使い、鳴りはじめてすぐに音量を下げていく、鈴のような音にする。
 * playTone で鳴らしている音とは別に鳴るので、お手本の音を止めることはない。
 * @param {number[]} frequencies - 鳴らす音の周波数（Hz）の配列。例：[1768] なら1音、[1768, 2652] なら2音を続けて鳴らす
 */
export function playChime(frequencies) {
  // 音を扱う土台を用意する
  const context = getAudioContext();

  // 今の時刻（AudioContext が動きはじめてからの秒数）
  const now = context.currentTime;

  // 周波数を1つずつ取り出して、順に鳴らす
  frequencies.forEach((frequency, index) => {
    // この音を鳴らしはじめる時刻（1つ前の音が終わる時刻）
    const startTime = now + index * CHIME_NOTE_SECONDS;

    // この音を鳴らし終える時刻
    const endTime = startTime + CHIME_NOTE_SECONDS;

    // 音を作る部品。波の形は、倍音を含まない澄んだ「正弦波」にする
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    // 音量を決める部品
    const gain = context.createGain();

    // 音量を 0 からすばやく上げて、そのあと終わりまでかけて 0 に下げる
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(CHIME_VOLUME, startTime + 0.01);
    gain.gain.linearRampToValueAtTime(0, endTime);

    // 部品をつなぐ：音を作る → 音量を決める → スピーカー
    oscillator.connect(gain);
    gain.connect(context.destination);

    // 鳴らしはじめる時刻と、止める時刻を予約する
    oscillator.start(startTime);
    oscillator.stop(endTime);
  });
}

// ===== メトロノームの音に関する設定値 =====

// メトロノームの音の高さ（Hz）
const CLICK_FREQUENCY = 1000;

// メトロノームの音の大きさ（0〜1）
const CLICK_VOLUME = 0.3;

// メトロノームの音の長さ（秒）。とても短くして「コッ」という音にする
const CLICK_DURATION = 0.05;

/**
 * メトロノームの音（短い「コッ」という音）を1回鳴らす関数
 * 「通し」モードで、1拍ごとに呼ばれる。
 */
export function playClick() {
  // 音を鳴らすための土台（AudioContext）を取り出す
  const context = getAudioContext();

  // 今の時刻（AudioContextの中の時計。単位は秒）
  const now = context.currentTime;

  // 音のもと（発振器）を作る。sine は、まるい音の波
  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = CLICK_FREQUENCY;

  // 音量を調節する部品を作る
  const gain = context.createGain();

  // 最初は決めた音量で鳴らし、すぐに小さくしていく（「コッ」と短く切れる音になる）
  gain.gain.setValueAtTime(CLICK_VOLUME, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + CLICK_DURATION);

  // 発振器 → 音量 → スピーカー の順につなぐ
  oscillator.connect(gain);
  gain.connect(context.destination);

  // 今すぐ鳴らしはじめて、決めた長さで止める
  oscillator.start(now);
  oscillator.stop(now + CLICK_DURATION);
}

// ===== メトロノームのページで使う、時刻を決めて鳴らす音 =====

// 1拍目（アクセント）の音の高さ（Hz）。ふつうの拍（1000Hz）より高くして、区別できるようにする
const ACCENT_CLICK_FREQUENCY = 1500;

/**
 * 音の時計の、今の時刻を返す関数
 * 音の時計は、音を扱う土台（AudioContext）が動きはじめてからの秒数。
 * 音を「何秒の時点で鳴らす」と予約するときの、基準になる。
 * ブラウザの決まりで、ボタンを押したときの処理の中から、最初に呼ぶこと。
 * @returns {number} 今の時刻（秒）
 */
export function getAudioTime() {
  return getAudioContext().currentTime;
}

/**
 * メトロノームの音（短い「コッ」という音）を、決めた時刻に鳴らす予約をする関数
 * その場で鳴らす playClick と違い、少し先の時刻を決めて予約するので、正確な間隔で鳴らせる。
 * @param {number} time - 鳴らす時刻（音の時計での秒数。getAudioTime で分かる今の時刻より、あとの時刻）
 * @param {boolean} isAccent - true のときは、1拍目用の高い音にする
 */
export function scheduleClick(time, isAccent) {
  // 音を鳴らすための土台（AudioContext）を取り出す
  const context = getAudioContext();

  // 音のもと（発振器）を作る。sine は、まるい音の波
  const oscillator = context.createOscillator();
  oscillator.type = "sine";

  // 1拍目は高い音、それ以外はふつうの高さにする
  oscillator.frequency.value = isAccent ? ACCENT_CLICK_FREQUENCY : CLICK_FREQUENCY;

  // 音量を調節する部品を作る
  const gain = context.createGain();

  // 鳴らす時刻に決めた音量ではじめて、すぐに小さくしていく（「コッ」と短く切れる音になる）
  gain.gain.setValueAtTime(CLICK_VOLUME, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + CLICK_DURATION);

  // 発振器 → 音量 → スピーカー の順につなぐ
  oscillator.connect(gain);
  gain.connect(context.destination);

  // 決めた時刻に鳴らしはじめて、決めた長さで止める予約をする
  oscillator.start(time);
  oscillator.stop(time + CLICK_DURATION);
}

// ===== 音を出せる状態かどうか =====

/**
 * 今、音を出せる状態かどうかを返す関数
 * ブラウザは、ページを開いた直後は音を出せないようにしていて、
 * 画面を押して指を離す・クリックする・キーを押す、などの操作があってはじめて、音を出せるようになる。
 * @returns {boolean} true：音を出せる、false：まだ出せない（土台をまだ作っていないときも false）
 */
export function isAudioRunning() {
  return audioContext !== null && audioContext.state === "running";
}

/**
 * 音を出せる状態にしておく関数
 * 音を扱う土台（AudioContext）を用意して、止まっていれば動かす。音は鳴らさない。
 * ブラウザが「操作があった」と認める処理（指を離したとき・クリックしたとき・キーを押したとき）の中から呼ぶこと。
 */
export function unlockAudio() {
  getAudioContext();
}

// ===== いくつも同時に鳴らせる音（指板の図の重音に使う） =====

// 同時に鳴らす音1つぶんの大きさ（0〜1）
// 4つ同時に鳴らしても音が割れないように、playTone の音（0.2）より少し小さくする
const VOICE_VOLUME = 0.15;

// 音を止めるとき、音量がなめらかに小さくなっていく速さ（秒）
// この時間で、音量がおよそ 3分の1 になる。0.02 なら、0.1秒ほどでほぼ聞こえなくなる
const VOICE_FADE_TIME_CONSTANT = 0.02;

// 音量を下げはじめてから、音を作る部品を止めるまでの時間（秒）
const VOICE_STOP_DELAY = 0.15;

/**
 * 音を1つ鳴らしはじめて、その音を返す関数
 * playTone と違い、前の音を止めないので、いくつも同時に鳴らせる。
 * 止めるときは、返ってきた音を stopVoice に渡す。
 * @param {number} frequency - 鳴らす音の周波数（Hz）
 * @param {number} maxSeconds - 鳴らす長さの上限（秒）。stopVoice で止めなくても、この長さで止まる
 * @returns {{oscillator: OscillatorNode, gain: GainNode, startTime: number}} 鳴らしはじめた音
 *   oscillator：音を作る部品、gain：音量を決める部品、startTime：鳴らしはじめた時刻（音の時計での秒数）
 */
export function startVoice(frequency, maxSeconds) {
  // 音を扱う土台を用意する
  const context = getAudioContext();

  // 今の時刻（AudioContext が動きはじめてからの秒数）
  const now = context.currentTime;

  // ----- 音を作る部品：playTone と同じ「のこぎり波」 -----
  const oscillator = context.createOscillator();
  oscillator.type = "sawtooth";
  oscillator.frequency.value = frequency;

  // ----- 音をやわらかくする部品：playTone と同じく、高い倍音を弱める -----
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = FILTER_FREQUENCY;

  // ----- 音量を決める部品 -----
  const gain = context.createGain();

  // 音量を 0 からはじめて、短い時間で決めた大きさまで上げる
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(VOICE_VOLUME, now + ATTACK_TIME);

  // 上限の長さの少し前まで音量を保ち、最後に 0 まで下げる
  gain.gain.setValueAtTime(VOICE_VOLUME, now + maxSeconds - RELEASE_TIME);
  gain.gain.linearRampToValueAtTime(0, now + maxSeconds);

  // ----- 部品をつなぐ：音を作る → やわらかくする → 音量を決める → スピーカー -----
  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);

  // 鳴らしはじめる時刻と、上限の長さで止める時刻を予約する
  oscillator.start(now);
  oscillator.stop(now + maxSeconds);

  return { oscillator: oscillator, gain: gain, startTime: now };
}

/**
 * startVoice で鳴らした音を止める関数
 * 鳴らしはじめてから minSeconds 秒たっていないときは、そこまで鳴らしてから止める。
 * 音量をなめらかに下げてから止めるので、「プツッ」という雑音が出にくい。
 * ブラウザがまだ音を出せない状態だったときは、ここで出せる状態にする（指を離したときに呼ぶので、出せるようになる）。
 * @param {{oscillator: OscillatorNode, gain: GainNode, startTime: number}} voice - startVoice が返した音
 * @param {number} minSeconds - 最低でも鳴らす長さ（秒）。指定しないときは 0（すぐに止める）
 */
export function stopVoice(voice, minSeconds = 0) {
  // 音を扱う土台を用意する（止まっていれば、ここで動かす）
  const context = getAudioContext();

  // 音量を下げはじめる時刻：「今」と「鳴らしはじめてから minSeconds 秒後」の、遅いほう
  const stopTime = Math.max(context.currentTime, voice.startTime + minSeconds);

  // 予約してあった音量の変化のうち、下げはじめる時刻より後のもの（上限の長さで止める予定など）を取り消す
  voice.gain.gain.cancelScheduledValues(stopTime);

  // 下げはじめる時刻から、音量をなめらかに 0 に近づける
  voice.gain.gain.setTargetAtTime(0, stopTime, VOICE_FADE_TIME_CONSTANT);

  // 音量が十分に下がったころに、音を作る部品を止める
  voice.oscillator.stop(stopTime + VOICE_STOP_DELAY);
}
