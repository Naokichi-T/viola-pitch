<script>
  // 読み込んだ楽譜の「通し」モードの練習の部品（ステップC-1）
  // 手入力の楽譜の「通し」（RunPractice.svelte）をもとにして、
  // 「1拍ごとに1音」ではなく、「お手本の時刻表（importedTimeline.js）の時間」で目標の音が進むようにしたもの。
  // 音の長さ・テンポの変化・rit.・フェルマータ・くり返しは、楽譜作成アプリの再生と同じ時間で進む。
  // 判定は音程だけ（リズムの判定はステップDで足す）。
  //
  // 【演奏中の五線譜】
  // 色が変わるたびに五線譜を全部描き直すと、速い曲やスマホでは間に合わないので、
  // 演奏中は五線譜の上の「重ねる層」にだけ描く（今の音のオレンジの帯と、判定した音の下の小さな印）。
  // 最後まで弾き終わったら、五線譜を1回だけ描き直して、音符そのものを結果の色にする。
  //
  // 【リズムのヒント】（ステップC-2）
  // ・流れる縦線：五線譜の上を、お手本の時刻表どおりに、なめらかに流れる（最初は入）
  // ・メトロノーム：演奏中、拍の頭でクリックを鳴らす（1拍目は高い音。最初は切）
  // 入・切は、ブラウザに覚えておく
  //
  // 【お手本を聴く】（ステップC-3）
  // ［♪ お手本を聴く］を押すと、マイクを使わずに、時刻表どおりにお手本を電子音で鳴らす（判定はしない）。
  // 短いカウントのあと、オレンジの帯・流れる縦線・メトロノームも、本番と同じように動く。
  // 高さは、選んでいる音律の高さ。灰色の音も鳴らし、重音は全部の音を鳴らす（装飾は付けず、書いてある音だけ）。
  //
  // 【リズムの判定】（ステップD）
  // 演奏中、マイクの記録（時刻・なめらかにする前の高さ・音量）をためておき、音が終わったら、
  // その音の出だしの時刻を見つけて（rhythm.js）、お手本の始まりとのずれを出す。
  // ずれが判定のレベルの幅（ノーマル ±0.1秒・イージー ±0.15秒）以内なら OK、それより早い・遅いは「早い」「遅い」。
  // 結果は、音符の上に印（OK ●・早い ←・遅い →・見つからない ?）で出し、点数は音程とリズムを並べて出す。
  // （ステップD-4：合っていた音（OK）は、印を出さず、音符も黒のままにした。ずれた音が目立つようにするため。
  //   合っていた音も、タップすれば結果が見られる）
  //
  // 【練習中の画面】（ステップE-1）
  // スマホでも楽譜を広く見られるように、動いている間（マイクの準備・カウント・演奏中・くり返しの間）は、
  // 楽譜と「やめる」ボタンだけにする（カウントの間は、カウントの数字も「やめる」ボタンの横に出す）。
  // 楽譜の枠は、画面の高さいっぱいに広げる（音符の大きさは変わらない）。
  // 練習ページの設定なども隠してもらえるように、動いているかどうかが変わるたびに、練習ページに知らせる。
  //
  // 【楽譜の見せ方】（ステップE-2）
  // 「ふつう」（改行した楽譜）と「流れる」（1本の帯が右から左へ流れる。上が今、下が続き）を選べる。選んだほうはブラウザに覚えておく。
  // 「流れる」でも、結果を見るとき（最後まで弾いたあと・途中でやめて結果があるとき）は、ふつうの楽譜に戻して見せる。
  //
  // 【リズムを甘くする所】（ステップE-3）
  // rit.・accel.（「遅くする」「速くする」の自由な文字も）の範囲の中の音と、フェルマータのすぐ次の音は、
  // 時刻表の倍率（rhythmFactor）だけ、リズムの OK の範囲を広げる（範囲の中は進むほど広げる：2倍 → 4倍。フェルマータの次は4倍）。
  // 点数は「ずれ ÷ 倍率」で出す（広げた範囲の中で同じ割合のずれなら、ふつうの所と同じ点数）。
  // 結果の札には、甘くした理由の印（rit.・rall.・𝄐 など）を付ける。

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  // onDestroy：この部品が画面から消えるときに後片付けをするための仕組み
  // untrack：値を「最初の1回だけ」読むための仕組み（下の tempo で使う）
  import { onMount, onDestroy, untrack } from "svelte";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // セントの数字を「+3」「−8」のような文字にする関数を読み込む
  import { formatCents } from "#lib/note.js";

  // 選んだ音律での、音の周波数を計算する関数と、開放弦の周波数を返す関数を読み込む
  import { getFrequency, getOpenStringFrequency } from "#lib/tuning.js";

  // 1音ごとの点数と、全体の点数を計算する関数を読み込む（今の「通し」と同じ）
  // （ステップD：リズムの1音ごとの点数と、全体の点数を計算する関数も読み込む）
  import { centsToPoints, getTotalScore, secondsToPoints, getRhythmTotalScore } from "#lib/scoring.js";

  // マイクの記録から、音の出だしの時刻を見つける関数を読み込む（ステップD）
  // （ステップD-2：拾った高さがメトロノームのクリックの音かを調べる関数も読み込む。音程の判定でクリックの音をよけるため）
  import { findOnset, isClickNoise } from "#lib/rhythm.js";

  // マイクで音の高さを調べはじめる関数と、止める関数を読み込む
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // メトロノームの音を鳴らす関数と、合図の音を鳴らす関数を読み込む
  // （ステップC-2：演奏中のメトロノームのために、時刻を決めてクリックを鳴らす関数と、音の時計の今の時刻を返す関数も読み込む）
  // （ステップC-3：お手本を鳴らすために、いくつも同時に鳴らせる音を鳴らす関数・止める関数も読み込む）
  import { playClick, playChime, scheduleClick, getAudioTime, startVoice, stopVoice } from "#lib/audio.js";

  // カウントの拍の数を、ブラウザに保存する関数と読み込む関数を読み込む（今の「通し」と共通の設定）
  // （ステップC-2：流れる縦線・メトロノームの入・切を、読み込む関数と保存する関数も読み込む）
  // （ステップE-2：楽譜の見せ方を、読み込む関数と保存する関数も読み込む）
  import { loadCountInBeats, saveCountInBeats, loadRunCursorEnabled, saveRunCursorEnabled, loadRunMetronomeEnabled, saveRunMetronomeEnabled, loadRunViewMode, saveRunViewMode } from "#lib/settings.js";

  // 流れるモードの幅の倍率の最小・最大と、ボタン1回で変わる量（ステップE-2）
  const FLOW_SCALE_MIN = 0.5;
  const FLOW_SCALE_MAX = 2;
  const FLOW_SCALE_STEP = 0.1;

  // 1つの音の、どこから判定に使いはじめるか（頭の4割をよける）を読み込む
  import { JUDGE_START_RATIO } from "#lib/importedTimeline.js";

  // 小節を「3小節目」などの文字にする関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { measureName } from "#lib/musicxml/model.js";

  // 読み込んだ楽譜の五線譜を描く部品を読み込む
  import ImportedStaff from "#lib/ImportedStaff.svelte";

  // この部品を使う側（読み込んだ楽譜の練習ページ）から受け取る値
  // score         ：五線譜に描く形の楽譜（imported.js の toRenderScore で作ったもの）
  // baseColors    ：判定から外す音を灰色にするための、音符ごとの色の表
  // getTimeline   ：テンポを渡すと、練習する範囲のお手本の時刻表を返す関数（importedTimeline.js の形）
  // currentKey    ：楽譜の調のデータ
  // initialTempo  ：最初のテンポ（♩＝○○）
  // temperamentId ：音律の id
  // tolerance     ：OK とする範囲（セント）
  // rhythmTolerance：リズムの OK とする範囲（秒）（ステップD）
  // allowOpenString：開放弦の高さで弾いた音も OK にするかどうか
  // repeatEnabled ：最後の音まで進んだら、最初の音に戻ってくり返すかどうか
  // staffHeight   ：五線譜の枠の高さの上限（CSS の書き方）
  // flowScale     ：流れるモードの幅の倍率（楽譜ごとに覚えている値）（ステップE-2）
  // onflowscalechange：流れるモードの幅の倍率を変えたときに呼ぶ関数（新しい倍率を渡す）（ステップE-2）
  // focusStaffHeight：動いている間の、五線譜の枠の高さの上限（CSS の書き方）（ステップE-1）
  // measureRange  ：五線譜に描く小節の範囲 { from, to }（練習する区間の小節だけを描くとき）。null なら全部（ステップD-3）
  // ontempochange ：テンポを変えたときに呼ぶ関数（新しいテンポを渡す）
  // onrunningchange：動いているかどうかが変わったときに呼ぶ関数（true：動いている）（ステップE-1）
  // onfinish      ：最後まで進んで点数が出たときに呼ぶ関数（その回の音程の点数と、リズムの点数を渡す）（ステップD：リズムも渡す）
  let {
    score,
    baseColors,
    getTimeline,
    currentKey,
    initialTempo,
    temperamentId,
    tolerance,
    rhythmTolerance,
    allowOpenString,
    repeatEnabled,
    staffHeight,
    focusStaffHeight = staffHeight,
    flowScale = 1,
    onflowscalechange = () => {},
    measureRange = null,
    ontempochange = () => {},
    onrunningchange = () => {},
    onfinish = () => {},
  } = $props();

  // ===== テンポとカウントに関する設定値 =====

  // テンポ（1分間の拍の数）の最小・最大と、ボタン1回で変わる量
  // （読み込んだ楽譜は、もとのテンポがいろいろなので、今の「通し」（40〜200）より広くしておく）
  const TEMPO_MIN = 30;
  const TEMPO_MAX = 240;
  const TEMPO_STEP = 5;

  // カウントの拍の数の最小・最大と、最初の値（今の「通し」と同じ）
  const COUNT_IN_MIN = 5;
  const COUNT_IN_MAX = 30;
  const COUNT_IN_DEFAULT = 10;

  // くり返しの2回目からの、カウントの拍の数（今の「通し」と同じ）
  const REPEAT_COUNT_IN_BEATS = 4;

  // ===== 判定に関する設定値 =====

  // 判定に必要な、音の高さのデータの数。これより少ないときは「音なし」にする（今の「通し」と同じ）
  const MIN_SAMPLES = 3;

  // マイクの高さの「遅れ」（秒）
  // マイクで調べる高さは、少し前の音の波（4096個ぶん）から求め、さらに直近12回の中央値にしているので、
  // 弾く音を変えてから、調べた高さが変わるまでに 0.2秒くらいかかる（調べてみたら 0.21秒だった）。
  // 短い音（8分音符など）では、判定の時間の頭のほうに、前の音の高さが混ざってしまうので、
  // マイクの高さは「この秒数だけ前に弾いた音の高さ」として扱う（判定も、音が終わってからこの秒数だけ待ってから行う）。
  // 画面の「今の音」は、遅らせずに、時刻表どおりに進む。
  const DETECTION_DELAY = 0.15;

  // 結果の種類ごとの、表示する文字（今の「通し」と同じ。skip は判定しなかった短い音）
  const STATUS_LABELS = {
    ok: "OK",
    high: "高い",
    low: "低い",
    none: "音なし",
    skip: "判定しない（短い音）",
  };

  // 結果の種類ごとの、色と、音符の下に出す印（今の「通し」の五線譜と同じ色）
  const STATUS_STYLES = {
    ok: { color: "#2e7d32", mark: "●" },
    high: { color: "#c62828", mark: "↑" },
    low: { color: "#1565c0", mark: "↓" },
    none: { color: "#9e9e9e", mark: "−" },
  };

  // 判定しない音（短すぎる音）の色（灰色）
  const SKIP_COLOR = "#9e9e9e";

  // リズムの結果の種類ごとの、表示する文字と、色と、音符の上に出す印（ステップD）
  // （色は、音程の結果と見分けられるように、早い・遅いは紫にする）
  const RHYTHM_STYLES = {
    ok: { label: "OK", color: "#2e7d32", mark: "●" },
    early: { label: "早い", color: "#6a1b9a", mark: "←" },
    late: { label: "遅い", color: "#6a1b9a", mark: "→" },
    missing: { label: "出だしが見つからない", color: "#9e9e9e", mark: "?" },
  };

  // 演奏中の今の音の帯の色（今の「通し」の「目標の音」と同じオレンジ）
  const CURRENT_COLOR = "#e65100";

  // 結果を見るためにタップした音の帯の色（青）
  const SELECTED_COLOR = "#1976d2";

  // 最後まで弾けたときに鳴らす、終わりの合図の音（今の「通し」と同じ）
  const FINISH_CHIME_FREQUENCIES = [1768, 2652];

  // お手本を聴くときの、カウントの拍の数（ステップC-3。弓を構えなくてよいので、くり返しの2回目と同じ短いカウントにする）
  const PREVIEW_COUNT_IN_BEATS = 4;

  // お手本の音を鳴らす長さの割合（ステップC-3）
  // 楽譜の長さいっぱいに鳴らすと、同じ高さの音が続くときに切れ目が分からないので、少しだけ短くする
  const PREVIEW_GATE = 0.92;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // テンポ（♩＝○○）。最初は、楽譜のテンポ（練習ページで覚えているテンポ）
  let tempo = $state(untrack(() => clampTempo(initialTempo)));

  // カウントの拍の数（設定の「−」「＋」で変えられる）
  let countInBeats = $state(COUNT_IN_DEFAULT);

  // 今の状態（今の「通し」と同じ）：'idle'・'preparing'・'countIn'・'playing'・'finished'
  let phase = $state("idle");

  // カウントの残りの拍の数
  let countInRemaining = $state(0);

  // 今鳴っているはずの音が、時刻表の何番目か（0から）。休符の間や、演奏中でないときは null
  let currentIndex = $state(null);

  // 1音ごとの判定の結果（時刻表と同じ順番。まだ判定していない音は undefined）
  // 1つの結果は { status, cents, openString }（status は 'ok'・'high'・'low'・'none'・'skip'）
  let results = $state([]);

  // 1音ごとのリズムの判定の結果（時刻表と同じ順番。まだ判定していない音は undefined）（ステップD）
  // 1つの結果は { status, seconds }（status は 'ok'・'early'・'late'・'missing'・'skip'。seconds はずれ（秒。マイナスは早い）か null）
  let rhythmResults = $state([]);

  // くり返しの、回ごとの点数（ステップD：{ pitch: 音程の点数, rhythm: リズムの点数 } にした）
  let roundScores = $state([]);

  // 結果を見るためにタップした音が、時刻表の何番目か。選んでいないときは null
  let selectedIndex = $state(null);

  // エラーメッセージ（マイクが使えなかったときなど）
  let errorMessage = $state("");

  // 流れる縦線を出すかどうか（true：出す）（ステップC-2）
  let cursorEnabled = $state(true);

  // 演奏中にメトロノームを鳴らすかどうか（true：鳴らす）（ステップC-2）
  let metronomeEnabled = $state(false);

  // 流れる縦線を出す時刻（秒。時刻表と同じ数え方）。出さないときは null（ステップC-2）
  let cursorTime = $state(null);

  // お手本を聴いている最中かどうか（true：お手本を聴いている。カウント・演奏の進み方は本番と同じ）（ステップC-3）
  let isPreview = $state(false);

  // 楽譜の見せ方（"normal"：ふつう、"flow"：流れる）（ステップE-2）
  let viewMode = $state("normal");

  // 流れるモードで、縦線の所に来る時刻（秒。カウントの間と、始める前は 0）（ステップE-2）
  let flowTime = $state(0);

  // 練習する範囲のお手本の時刻表（テンポが変わるたびに作り直す）
  // $derived を付けると、tempo が変わるたびに自動で計算し直される
  let timeline = $derived(getTimeline(tempo));

  // ===== 進行のために覚えておく値（画面には表示しないので $state は付けない） =====

  // 次の画面の書き換えのための予約の番号（requestAnimationFrame の番号。やめるときに取り消すため）
  let frameId = null;

  // 今の回を始めた時刻（ページを開いてからのミリ秒）
  let startTime = 0;

  // 今の回の、カウントの拍の数と、カウントの長さ（秒）
  let roundCountInBeats = 0;
  let countInSeconds = 0;

  // 今の回で、カウントのクリックをいくつ鳴らしたか
  let clickedCount = 0;

  // 演奏を始めたときの時刻表（演奏中にテンポは変えられないが、念のため、始めたときのものを使い続ける）
  let runTimeline = null;

  // 次に判定する音の番号
  let nextJudgeIndex = 0;

  // 今の音を探すときの、手がかりの番号（前から順に進むので、毎回最初から探さなくてよいように）
  let cursor = 0;

  // 音ごとに集めた、マイクの音の高さ（Hz）の配列の配列
  let samples = [];

  // 今の回で、最初の音が始まったか（くり返しの2回目からは、最初の音が始まったときに前の回の結果を消す）
  let roundStarted = false;

  // メトロノームで、次に鳴らす拍の頭の番号（時刻表の clicks の何番目か）（ステップC-2）
  let nextClickIndex = 0;

  // マイクの記録 { time, frequency, rms } の並び（リズムの判定に使う）（ステップD）
  let frames = [];

  // メトロノームのクリックを鳴らした時刻（秒）の並び（クリックの音を、出だしと間違えないようにするため）（ステップD）
  let playedClickTimes = [];

  // お手本で、次に鳴らす音の番号（時刻表の sounds の何番目か）と、鳴らしている音の一覧（止めるときに使う）（ステップC-3）
  let nextSoundIndex = 0;
  let previewVoices = [];

  // ===== 計算で決まる値 =====

  // 動いている最中かどうか
  let isRunning = $derived(phase === "preparing" || phase === "countIn" || phase === "playing");

  // 今、流れるモードで見せるかどうか（ステップE-2）
  // 「流れる」を選んでいて、動いている最中か、結果がまだないとき（始める前）だけ流れるモードにする。
  // 結果を見るとき（終わったあと・途中でやめて結果があるとき）は、ふつうの楽譜に戻す（色・印・タップで結果を見るため）
  let flowActive = $derived(viewMode === "flow" && (isRunning || (phase === "idle" && results.length === 0)));

  // 動いているかどうかが変わるたびに、練習ページに知らせる（ステップE-1）
  // （練習ページは、動いている間、楽譜の名前や設定などを隠す）
  $effect(() => {
    onrunningchange(isRunning);
  });

  // 判定した結果（判定しない短い音を除く）のずれ（セント）の並び
  let judgedCents = $derived(results.filter((result) => result !== undefined && result.status !== "skip").map((result) => result.cents));

  // 全体の点数（判定した音の点数の平均）
  let totalScore = $derived(getTotalScore(judgedCents));

  // リズムを判定した音のずれ（秒）の並び（判定しない音を除く。見つからない音は null）（ステップD）
  // （ステップE-3：甘くした音は、ずれを倍率で割った値にする（点数を出すときに、ふつうの音と同じ割合で数えるため））
  let judgedSeconds = $derived(rhythmResults.filter((result) => result !== undefined && result.status !== "skip").map((result) => scoredSeconds(result)));

  /**
   * リズムの結果から、点数を出すのに使うずれ（秒）を返す関数（ステップE-3）
   * 甘くした音（倍率 factor が 1 より大きい音）は、ずれを倍率で割る。見つからない音は null のまま。
   * @param {{seconds: number|null, factor?: number}} result - リズムの結果
   * @returns {number|null} 点数を出すのに使うずれ（秒）
   */
  function scoredSeconds(result) {
    if (result.seconds === null) {
      return null;
    }
    return result.seconds / (result.factor ?? 1);
  }

  // リズムの全体の点数（ステップD）
  let rhythmScore = $derived(getRhythmTotalScore(judgedSeconds));

  // リズムの結果の種類ごとの数（ステップD）
  let rhythmCounts = $derived.by(() => {
    const counts = { ok: 0, early: 0, late: 0, missing: 0, skip: 0 };
    for (const result of rhythmResults) {
      if (result !== undefined) {
        counts[result.status] += 1;
      }
    }
    return counts;
  });

  // 結果の種類ごとの数
  let statusCounts = $derived.by(() => {
    const counts = { ok: 0, high: 0, low: 0, none: 0, skip: 0 };
    for (const result of results) {
      if (result !== undefined) {
        counts[result.status] += 1;
      }
    }
    return counts;
  });

  // 判定しない短い音の数（今のテンポの時刻表で）
  let skipCount = $derived(timeline.items.filter((item) => !item.judge).length);

  // 五線譜の音符の色（演奏中は変えない。描き直しを避けるため）
  //   ・終わったあと：判定の結果の色（高い 赤・低い 青・音なし 灰色・判定しない 灰色）
  //     （ステップD-4：OK の音は色を付けない（黒のまま）。ずれた音が目立つようにするため）
  //   ・それ以外：灰色の音（判定から外す音）＋ 今のテンポで短すぎる音
  let staffColors = $derived.by(() => {
    const colors = new Map(baseColors);
    timeline.items.forEach((item, index) => {
      let color = null;
      if (phase === "finished" && results[index] !== undefined) {
        if (results[index].status === "skip") {
          color = SKIP_COLOR;
        } else if (results[index].status !== "ok") {
          color = STATUS_STYLES[results[index].status].color;
        }
      } else if (!item.judge) {
        color = SKIP_COLOR;
      }
      if (color !== null) {
        item.positions.forEach((p) => colors.set("0-" + p.measure + "-" + p.note, color));
      }
    });
    return colors;
  });

  // 重ねる層の帯：演奏中は今の音（オレンジ）、結果を見るために音をタップしたときはその音（青）
  let overlayBands = $derived.by(() => {
    if (currentIndex !== null && (phase === "playing" || phase === "countIn")) {
      return [{ positions: timeline.items[currentIndex].positions, color: CURRENT_COLOR }];
    }
    if (selectedIndex !== null && !isRunning) {
      return [{ positions: timeline.items[selectedIndex].positions, color: SELECTED_COLOR }];
    }
    return [];
  });

  // 重ねる層の印：判定した音の下に、結果の印（↑・↓・−）を出す（判定しない短い音には出さない）
  // （ステップD-4：OK の音には印を出さない。ずれた音の印だけにして、目立つようにするため）
  let overlayMarks = $derived.by(() => {
    const marks = [];
    results.forEach((result, index) => {
      if (result === undefined || result.status === "skip" || result.status === "ok") {
        return;
      }
      const style = STATUS_STYLES[result.status];
      marks.push({ position: timeline.items[index].positions[0], color: style.color, text: style.mark });
    });
    // リズムの結果は、音符の上に出す（判定しない音には出さない）（ステップD）
    // （ステップD-4：OK の音には印を出さない）
    rhythmResults.forEach((result, index) => {
      if (result === undefined || result.status === "skip" || result.status === "ok") {
        return;
      }
      const style = RHYTHM_STYLES[result.status];
      marks.push({ position: timeline.items[index].positions[0], color: style.color, text: style.mark, placement: "above" });
    });
    return marks;
  });

  // 次に判定する音の番号（自動スクロールのために、画面に伝える用。休符の間に次の音の段を見せるため）
  let nextJudgeIndexState = $state(0);

  // 自動スクロールで見せる音符：演奏中は今の音（休符の間は、次の音）
  let focusPosition = $derived.by(() => {
    if (!isRunning) {
      return null;
    }
    const index = currentIndex ?? Math.min(nextJudgeIndexState, timeline.items.length - 1);
    return timeline.items[index]?.positions[0] ?? null;
  });

  // この部品が画面に表示されたときに、前回保存したカウントの拍の数を読み込む
  // （ステップC-2：流れる縦線・メトロノームの入・切も読み込む）
  onMount(() => {
    const saved = loadCountInBeats();
    if (saved !== null) {
      countInBeats = clampCountIn(saved);
    }
    cursorEnabled = loadRunCursorEnabled();
    metronomeEnabled = loadRunMetronomeEnabled();
    viewMode = loadRunViewMode(); // ステップE-2
  });

  /**
   * 流れるモードの幅の倍率を変える関数（「−」「＋」ボタン）（ステップE-2）
   * 小数の計算で 0.30000000000000004 のようにならないように、小数第1位で丸める。
   * @param {number} amount - 変える量（FLOW_SCALE_STEP か、そのマイナス）
   */
  function changeFlowScale(amount) {
    const next = Math.round((flowScale + amount) * 10) / 10;
    onflowscalechange(Math.min(FLOW_SCALE_MAX, Math.max(FLOW_SCALE_MIN, next)));
  }

  /**
   * 楽譜の見せ方を切り替える関数（「ふつう」「流れる」のボタン）（ステップE-2）
   * 切り替えたら、ブラウザに保存する。前の結果は消す（流れるモードは、結果がないときに見せるため）。
   * @param {string} mode - "normal"（ふつう）か "flow"（流れる）
   */
  function changeViewMode(mode) {
    viewMode = mode;
    saveRunViewMode(mode);
    if (mode === "flow") {
      results = [];
      rhythmResults = [];
      roundScores = [];
      selectedIndex = null;
      phase = "idle";
      flowTime = 0;
    }
  }

  /**
   * 流れる縦線の入・切を切り替える関数（チェックボックス）（ステップC-2）
   * 演奏中でも切り替えられる。切り替えたら、ブラウザに保存する。
   * @param {boolean} enabled - チェックが入っているか
   */
  function changeCursorEnabled(enabled) {
    cursorEnabled = enabled;
    saveRunCursorEnabled(enabled);
    // 切にしたら、すぐに縦線を消す（入にしたときは、次の画面の書き換えで出る）
    if (!enabled) {
      cursorTime = null;
    }
  }

  /**
   * メトロノームの入・切を切り替える関数（チェックボックス）（ステップC-2）
   * 演奏中でも切り替えられる（次の拍から鳴る・止まる）。切り替えたら、ブラウザに保存する。
   * @param {boolean} enabled - チェックが入っているか
   */
  function changeMetronomeEnabled(enabled) {
    metronomeEnabled = enabled;
    saveRunMetronomeEnabled(enabled);
  }

  // この部品が画面から消えるときに、進行を止める
  onDestroy(() => {
    stop();
  });

  /**
   * テンポを、最小と最大の間に収める関数
   * @param {number} value - テンポ
   * @returns {number} 最小と最大の間に収めたテンポ（整数）
   */
  function clampTempo(value) {
    return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(value)));
  }

  /**
   * テンポを変える関数（「−」「＋」ボタン）
   * @param {number} amount - 変える量
   */
  function changeTempo(amount) {
    tempo = clampTempo(tempo + amount);
    // 結果を見るために選んでいた音は、時刻表が変わるので選ぶのをやめる
    selectedIndex = null;
    ontempochange(tempo);
  }

  /**
   * カウントの拍の数を、最小と最大の間に収める関数
   * @param {number} value - カウントの拍の数
   * @returns {number} 最小と最大の間に収めた値
   */
  function clampCountIn(value) {
    return Math.min(COUNT_IN_MAX, Math.max(COUNT_IN_MIN, value));
  }

  /**
   * カウントの拍の数を変える関数（設定の「−」「＋」ボタン）。変えた値はブラウザに保存する（今の「通し」と共通）
   * @param {number} amount - 変える量
   */
  function changeCountIn(amount) {
    countInBeats = clampCountIn(countInBeats + amount);
    saveCountInBeats(countInBeats);
  }

  /**
   * 五線譜の音符がタップされたときに、その音の結果を見られるようにする関数
   * 演奏中は何もしない。まだ判定していない音・判定しない音符は選べない。同じ音をもう一度タップすると、選ぶのをやめる。
   * @param {{measure: number, note: number}} position - タップした音符の場所
   */
  function selectNote(position) {
    if (isRunning) {
      return;
    }
    // タップした音符を含む音のうち、結果があるもの（くり返しで2回あるときは、選んでいる音より後ろのもの → なければ最初のもの）
    const indexes = [];
    timeline.items.forEach((item, index) => {
      const hit = item.positions.some((p) => p.measure === position.measure && p.note === position.note);
      if (hit && results[index] !== undefined) {
        indexes.push(index);
      }
    });
    if (indexes.length === 0) {
      return;
    }
    const after = indexes.find((index) => selectedIndex !== null && index > selectedIndex);
    const next = after ?? indexes[0];
    selectedIndex = next === selectedIndex ? null : next;
  }

  /**
   * 「通し」の練習を始める関数（「始める」ボタン）
   * マイクを開始してからカウントを鳴らし、そのあと時刻表どおりに目標の音を進める。
   */
  async function start() {
    errorMessage = "";
    results = [];
    rhythmResults = []; // ステップD
    roundScores = [];
    selectedIndex = null;
    phase = "preparing";

    try {
      // マイクを開始する。音の高さが分かるたびに、handlePitch が呼ばれる
      await startMicrophone(handlePitch);
    } catch (error) {
      errorMessage = error.message;
      phase = "idle";
      return;
    }

    // マイクの準備を待っている間に「やめる」が押されていたら、マイクを止めて終わる
    if (phase !== "preparing") {
      stopMicrophone();
      return;
    }

    // 演奏に使う時刻表を決めて、1回目を始める（1回目のカウントは、設定の拍の数）
    runTimeline = timeline;
    startRound(countInBeats);
  }

  /**
   * お手本を聴きはじめる関数（「お手本を聴く」ボタン）（ステップC-3）
   * マイクは使わない。短いカウントのあと、時刻表どおりにお手本の音を鳴らす（判定はしない）。
   * 前の「通し」の結果は消す（お手本の帯や縦線と混ざって見づらくなるため）。
   */
  function startPreview() {
    errorMessage = "";
    results = [];
    rhythmResults = []; // ステップD
    roundScores = [];
    selectedIndex = null;
    isPreview = true;
    runTimeline = timeline;
    startRound(PREVIEW_COUNT_IN_BEATS);
  }

  /**
   * 鳴らしているお手本の音を、全部止める関数（ステップC-3）
   */
  function stopPreviewVoices() {
    previewVoices.forEach((voice) => stopVoice(voice));
    previewVoices = [];
  }

  /**
   * 1回分（くり返しのときは、その回）を始める関数
   * @param {number} beats - この回のカウントの拍の数
   */
  function startRound(beats) {
    roundCountInBeats = beats;
    countInSeconds = beats * runTimeline.beatSeconds;
    clickedCount = 0;
    nextJudgeIndex = 0;
    nextJudgeIndexState = 0;
    cursor = 0;
    samples = runTimeline.items.map(() => []);
    roundStarted = false;
    nextClickIndex = 0; // ステップC-2
    nextSoundIndex = 0; // ステップC-3
    frames = []; // ステップD
    playedClickTimes = []; // ステップD
    currentIndex = null;
    flowTime = 0; // ステップE-2
    startTime = performance.now();
    phase = "countIn";
    countInRemaining = beats;

    // 画面の書き換えのたびに進み具合を調べる（1秒に約60回）
    frameId = requestAnimationFrame(update);
  }

  /**
   * 今が、時刻表の何秒目かを返す関数（カウントの間はマイナス）
   * @returns {number} 秒
   */
  function musicTime() {
    return (performance.now() - startTime) / 1000 - countInSeconds;
  }

  /**
   * 画面の書き換えのたびに呼ばれて、カウント・今の音・判定・終わりを進める関数
   */
  function update() {
    const items = runTimeline.items;
    const t = musicTime();

    if (t < 0) {
      // ----- カウント中：拍の頭ごとにクリックを鳴らす -----
      const elapsed = t + countInSeconds; // 回を始めてからの秒
      const beat = Math.floor(elapsed / runTimeline.beatSeconds); // 今、何拍目か（0から）
      if (beat >= clickedCount && beat < roundCountInBeats) {
        playClick();
        clickedCount = beat + 1;
      }
      countInRemaining = roundCountInBeats - beat;

      // カウントの間、流れる縦線は、最初の目じるし（時刻 0）の所で待つ（ステップC-2）
      cursorTime = cursorEnabled ? 0 : null;
      flowTime = 0; // 流れるモードの帯も、最初の所で待つ（ステップE-2）
    } else {
      // ----- 演奏中 -----
      if (!roundStarted) {
        // この回の最初の音が始まった：前の回の結果を消す（くり返しの2回目から。前の回の結果は、カウントの間に見直せる）
        roundStarted = true;
        results = [];
        rhythmResults = []; // ステップD
        selectedIndex = null;
        phase = "playing";
      }

      if (isPreview) {
        // お手本を聴いているとき（ステップC-3）：判定はしないで、時刻が来た音を鳴らす
        while (nextSoundIndex < runTimeline.sounds.length && runTimeline.sounds[nextSoundIndex].start <= t) {
          playSound(runTimeline.sounds[nextSoundIndex]);
          nextSoundIndex += 1;
        }
        // 終わった音の番号だけ進めておく（休符の間に、次の音の段を見せる自動スクロールのため）
        while (nextJudgeIndex < items.length && t >= items[nextJudgeIndex].end) {
          nextJudgeIndex += 1;
        }
      } else {
        // 終わった音を、順に判定する（マイクの高さの遅れのぶん、音が終わってから少し待つ）
        while (nextJudgeIndex < items.length && t >= items[nextJudgeIndex].end + DETECTION_DELAY) {
          judgeNote(nextJudgeIndex);
          judgeRhythm(nextJudgeIndex); // ステップD
          nextJudgeIndex += 1;
        }
      }
      nextJudgeIndexState = nextJudgeIndex;

      // 今鳴っているはずの音を探す（終わった音を飛ばして、始まっていれば今の音。始まっていなければ休符の間）
      while (cursor < items.length && t >= items[cursor].end) {
        cursor += 1;
      }
      const nowIndex = cursor < items.length && t >= items[cursor].start ? cursor : null;
      if (nowIndex !== currentIndex) {
        currentIndex = nowIndex;
      }

      // 流れる縦線を、今の時刻に動かす（ステップC-2）
      cursorTime = cursorEnabled ? t : null;
      flowTime = t; // 流れるモードの帯も、今の時刻に動かす（ステップE-2）

      // メトロノーム：時刻が来た拍の頭のクリックを鳴らす（入のときだけ。切のときも、番号は進めておく）（ステップC-2）
      // 拍の頭の時刻は、お手本の時刻表どおり（rit. ではだんだん間が広がり、フェルマータでは待つ）
      while (nextClickIndex < runTimeline.clicks.length && runTimeline.clicks[nextClickIndex].time <= t) {
        if (metronomeEnabled) {
          // すぐに鳴らす（1拍目は高い音）
          scheduleClick(getAudioTime(), runTimeline.clicks[nextClickIndex].strong);
          // 鳴らした時刻を覚えておく（リズムの判定で、クリックの音を出だしと間違えないように）（ステップD）
          playedClickTimes.push(t);
        }
        nextClickIndex += 1;
      }

      // お手本の最後の音が鳴り終わった（ステップC-3）
      if (isPreview && nextJudgeIndex >= items.length && nextSoundIndex >= runTimeline.sounds.length && t >= lastSoundEnd()) {
        finishPreview();
        return;
      }

      // 最後の音が終わった（本番）
      if (!isPreview && nextJudgeIndex >= items.length) {
        finishRound();
        return;
      }
    }

    // 次の画面の書き換えで、もう一度調べる
    frameId = requestAnimationFrame(update);
  }

  /**
   * お手本の音を1つ鳴らす関数（ステップC-3）
   * 選んでいる音律の高さで、重音なら全部の高さを、楽譜の長さの少し手前まで鳴らす。
   * @param {{pitches: object[], start: number, end: number}} sound - 鳴らす音（時刻表の sounds の1つ）
   */
  function playSound(sound) {
    const seconds = Math.max(0.05, (sound.end - sound.start) * PREVIEW_GATE);
    sound.pitches.forEach((pitch) => {
      const frequency = getFrequency(pitch, currentKey, temperamentId);
      previewVoices.push(startVoice(frequency, seconds));
    });
    // 鳴らし終わった音は、一覧から外していく（一覧が長くなりすぎないように。止めても害はないが、数を減らす）
    if (previewVoices.length > 64) {
      previewVoices = previewVoices.slice(-32);
    }
  }

  /**
   * お手本の音がすべて鳴り終わる時刻（秒）を返す関数（ステップC-3）
   * @returns {number} 秒
   */
  function lastSoundEnd() {
    const sounds = runTimeline.sounds;
    return sounds.length > 0 ? Math.max(...sounds.map((sound) => sound.end)) : 0;
  }

  /**
   * お手本を最後まで鳴らしたときの処理をする関数（ステップC-3）
   * 「くり返す」に入っていても、お手本は1回で終わる。
   */
  function finishPreview() {
    stopPreviewVoices();
    frameId = null;
    isPreview = false;
    currentIndex = null;
    cursorTime = null;
    phase = "idle";
  }

  /**
   * 最後の音が終わったときの処理をする関数
   * 点数を出して、くり返すときは短いカウントから次の回を始める。
   */
  function finishRound() {
    playChime(FINISH_CHIME_FREQUENCIES);
    currentIndex = null;
    cursorTime = null; // 流れる縦線を消す（ステップC-2）

    // この回の点数（音程とリズム）を、練習ページに伝える（最高点を記録するため）（ステップD：リズムも渡す）
    onfinish(totalScore, rhythmScore);

    // くり返しているとき（または、途中でくり返しをやめたとき）は、この回の点数を記録する
    if (repeatEnabled || roundScores.length > 0) {
      roundScores.push({ pitch: totalScore, rhythm: rhythmScore });
    }

    if (repeatEnabled) {
      // くり返すとき：短いカウントから次の回を始める
      startRound(REPEAT_COUNT_IN_BEATS);
      return;
    }

    // くり返さないとき：マイクを止めて終わりにする
    stopMicrophone();
    frameId = null;
    phase = "finished";
  }

  /**
   * マイクが音の高さを調べるたびに呼ばれる関数
   * 演奏中に、それぞれの音の「後ろ6割」の時間に入っていれば、その音の高さとして集めておく。
   * マイクの高さは遅れて届くので、DETECTION_DELAY だけ前の時刻の高さとして扱う。
   * （ステップD：リズムの判定のために、音量と、なめらかにする前の高さも受け取って、記録にためておく）
   * @param {number|null} frequency - 検出した周波数（Hz。なめらかにしたもの）。音が出ていないときは null
   * @param {number} rms - 音量（ステップD）
   * @param {number|null} rawFrequency - なめらかにする前の、その回の周波数（Hz）（ステップD）
   */
  function handlePitch(frequency, rms = 0, rawFrequency = null) {
    if (phase !== "playing" || runTimeline === null) {
      return;
    }

    // リズムの判定のための記録（音が出ていないときも、音量が下がったことが分かるように記録する）（ステップD）
    frames.push({ time: musicTime(), frequency: rawFrequency, rms: rms });

    // ここから下は音程の判定のため：音が出ていないときは何もしない
    if (frequency === null) {
      return;
    }

    // メトロノームのクリックの音を拾ったときは、音程の判定に使わない（ステップD-2）
    // （1拍目のクリックは高い音なので、弾いていないのに「高い」と出てしまうことがあったため）
    // （なめらかにする前の高さか、なめらかにした高さのどちらかが、クリックの直後にクリックの高さなら、使わない）
    const now = musicTime();
    if (isClickNoise(now, rawFrequency, playedClickTimes) || isClickNoise(now, frequency, playedClickTimes)) {
      return;
    }
    const items = runTimeline.items;
    const t = musicTime() - DETECTION_DELAY; // この高さを弾いていた時刻（遅れのぶん前）

    // まだ判定していない音のうち、もう始まっている音を見る（ふつうは今の音の1つだけ）
    for (let index = nextJudgeIndex; index < items.length && items[index].start <= t; index++) {
      const item = items[index];
      const judgeFrom = item.start + (item.end - item.start) * JUDGE_START_RATIO;
      if (t >= judgeFrom && t < item.end) {
        samples[index].push(frequency);
      }
    }
  }

  /**
   * 数字の並びの「真ん中の値」（中央値）を求める関数（今の「通し」と同じ）
   * @param {number[]} values - 数字の配列（1つ以上入っていること）
   * @returns {number} 真ん中の値
   */
  function getMedian(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
      return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /**
   * 1つの音の判定をして、結果を記録する関数（今の「通し」の judgeNote と同じ決め方）
   * @param {number} index - 時刻表の何番目の音か
   */
  function judgeNote(index) {
    const item = runTimeline.items[index];

    // 短すぎる音は判定しない
    if (!item.judge) {
      results[index] = { status: "skip", cents: null };
      return;
    }

    // 集めた音の高さが少なすぎるときは「音なし」
    if (samples[index].length < MIN_SAMPLES) {
      results[index] = { status: "none", cents: null };
      return;
    }

    // 目標の音の周波数（選んだ音律で計算する）と、弾いた音の高さ（集めた値の真ん中の値）
    const targetFrequency = getFrequency(item.note, currentKey, temperamentId);
    const playedFrequency = getMedian(samples[index]);

    // 目標の音とのずれ（セント）。プラスなら高い、マイナスなら低い
    let cents = 1200 * Math.log2(playedFrequency / targetFrequency);
    let usedOpenString = false;

    // 「開放弦の高さで弾いた音もOKにする」とき：開放弦の高さとも比べて、近いほうを使う
    if (allowOpenString) {
      const openFrequency = getOpenStringFrequency(item.note);
      if (openFrequency !== null) {
        const openCents = 1200 * Math.log2(playedFrequency / openFrequency);
        if (Math.abs(openCents) < Math.abs(cents)) {
          cents = openCents;
          usedOpenString = true;
        }
      }
    }

    // ずれが範囲内なら OK、範囲より上なら「高い」、下なら「低い」
    let status = "ok";
    if (cents > tolerance) {
      status = "high";
    } else if (cents < -tolerance) {
      status = "low";
    }

    results[index] = { status: status, cents: cents, openString: usedOpenString };
  }

  /**
   * 1つの音のリズムの判定をして、結果を記録する関数（ステップD）
   * マイクの記録から出だしの時刻を見つけて、お手本の始まりとのずれで決める。
   * @param {number} index - 時刻表の何番目の音か
   */
  function judgeRhythm(index) {
    const item = runTimeline.items[index];

    // リズムを判定しない音（短すぎる音・スラーの中で同じ高さが続く音）
    if (!item.rhythm) {
      rhythmResults[index] = { status: "skip", seconds: null };
      return;
    }

    // 出だしの時刻を見つける
    const previous = index > 0 ? runTimeline.items[index - 1] : null;
    const targetFrequency = getFrequency(item.note, currentKey, temperamentId);
    // ひとつ前の音の、見つかった出だしの時刻（見つかっていない・判定しない音なら null）（ステップD-5）
    // 音程が外れた音の出だしを探すとき、ひとつ前の音の弾き始めと間違えないようにするために渡す
    const previousResult = index > 0 ? rhythmResults[index - 1] : undefined;
    const previousOnset = previousResult !== undefined && typeof previousResult.seconds === "number" ? previous.start + previousResult.seconds : null;
    // この音の OK の範囲（ステップE-3：rit.・フェルマータのあとなどは、時刻表の倍率だけ広げる）
    const factor = item.rhythmFactor ?? 1;
    const tolerance = rhythmTolerance * factor;
    const label = item.rhythmLabel ?? null; // 甘くした理由の印（結果の札に出す）
    // 広げた音では、出だしを探す範囲も広げる（tolerance を渡す）
    const onset = findOnset(frames, item, previous, targetFrequency, playedClickTimes, previousOnset, tolerance);
    if (onset === null) {
      rhythmResults[index] = { status: "missing", seconds: null, factor: factor, label: label };
      return;
    }

    // お手本の始まりとのずれ（秒。マイナスは早い）で決める
    const seconds = onset - item.start;
    let status = "ok";
    if (seconds < -tolerance) {
      status = "early";
    } else if (seconds > tolerance) {
      status = "late";
    }
    rhythmResults[index] = { status: status, seconds: seconds, factor: factor, label: label };
  }

  /**
   * 「通し」の練習を途中でやめる関数（「やめる」ボタンと、部品が消えるとき）
   * そこまでの結果は画面に残す（次に始めるときに消える）。
   */
  function stop() {
    if (frameId !== null) {
      cancelAnimationFrame(frameId);
      frameId = null;
    }
    stopMicrophone();
    stopPreviewVoices(); // お手本の音も止める（ステップC-3）
    isPreview = false;
    phase = "idle";
    currentIndex = null;
    cursorTime = null; // 流れる縦線を消す（ステップC-2）
  }
</script>

<!-- 五線譜：演奏中は、重ねる層に今の音の帯と結果の印を描く。終わったら、音符そのものを結果の色にする -->
<!-- （ステップC-2：流れる縦線の目じるしと時刻も渡す） -->
<!-- （ステップE-1：動いている間は、枠の高さの上限を、画面の高さいっぱいにする） -->
<ImportedStaff
  {score}
  noteColors={staffColors}
  {overlayBands}
  {overlayMarks}
  cursorKeys={timeline.cursorKeys}
  {cursorTime}
  focus={focusPosition}
  maxHeight={isRunning ? focusStaffHeight : staffHeight}
  {measureRange}
  onselect={selectNote}
  flow={flowActive}
  {flowScale}
  {flowTime}
  flowBrowsable={!isRunning}
/>

{#if isRunning}
  <!-- ===== 動いている間（ステップE-1）：カウントの数字と「やめる」ボタンだけ ===== -->
  <div class="run-bar">
    <!-- カウントの数字（カウントの間だけ）。マイクの準備中は「準備中」 -->
    {#if phase === "countIn"}
      <span class="run-count" aria-label="カウントの残り">{countInRemaining}</span>
    {:else if phase === "preparing"}
      <span class="run-count preparing">準備中</span>
    {/if}
    <button class="main-button stop" onclick={stop}>■ やめる</button>
  </div>
{:else}
  <!-- ===== 動いていないとき：今までどおり、全部を出す ===== -->

  <!-- 楽譜の見せ方の切り替え（ステップE-2） -->
  <div class="view-row">
    <span class="view-caption">楽譜の見せ方</span>
    <button class="view-button" class:selected={viewMode === "normal"} onclick={() => changeViewMode("normal")}>ふつう</button>
    <button class="view-button" class:selected={viewMode === "flow"} onclick={() => changeViewMode("flow")}>流れる</button>
  </div>

  <!-- 流れるモードの幅の調整（ステップE-2）：「流れる」を選んでいるときだけ出す。楽譜ごとに覚える -->
  {#if viewMode === "flow"}
    <div class="view-row">
      <span class="view-caption">流れる楽譜の幅</span>
      <button class="view-button" aria-label="幅をせまくする" disabled={flowScale <= FLOW_SCALE_MIN} onclick={() => changeFlowScale(-FLOW_SCALE_STEP)}>−</button>
      <span class="scale-value">{Math.round(flowScale * 100)}%</span>
      <button class="view-button" aria-label="幅を広くする" disabled={flowScale >= FLOW_SCALE_MAX} onclick={() => changeFlowScale(FLOW_SCALE_STEP)}>＋</button>
      <span class="view-caption small">広くすると速く流れます。始める前は、楽譜を左右に動かして先を見られます</span>
    </div>
  {/if}

  <!-- リズムのヒントの入・切（ステップC-2） -->
  <!-- （ステップE-1：動いている間は隠すので、演奏中には切り替えられなくなった） -->
  <div class="hint-row">
    <label class="hint-label">
      <input type="checkbox" checked={cursorEnabled} onchange={(event) => changeCursorEnabled(event.currentTarget.checked)} />
      流れる縦線
    </label>
    <label class="hint-label">
      <input type="checkbox" checked={metronomeEnabled} onchange={(event) => changeMetronomeEnabled(event.currentTarget.checked)} />
      メトロノーム
    </label>
  </div>

  <!-- 今の状態の表示（ステップE-1：動いている間の表示は、上の run-bar に移した。ここは、終わったあとと、始める前だけ） -->
  <div class="status-area">
    {#if phase === "finished"}
      <!-- 点数：音程とリズムを並べて出す（ステップD） -->
      <div class="score-pair">
        <div class="score-box">
          <p class="status-caption">音程</p>
          <p class="status-main finished">{totalScore}<span class="unit">点</span></p>
          <!-- 「名前 数」ごとに span で囲んで、途中で折り返さないようにする -->
          <p class="status-caption small">
            <span class="count">OK {statusCounts.ok}</span>
            <span class="count">高い {statusCounts.high}</span>
            <span class="count">低い {statusCounts.low}</span>
            <span class="count">音なし {statusCounts.none}</span>
          </p>
        </div>
        <div class="score-box">
          <p class="status-caption">リズム</p>
          <p class="status-main finished rhythm">{rhythmScore}<span class="unit">点</span></p>
          <p class="status-caption small">
            <span class="count">OK {rhythmCounts.ok}</span>
            <span class="count">早い {rhythmCounts.early}</span>
            <span class="count">遅い {rhythmCounts.late}</span>
            <span class="count">見つからない {rhythmCounts.missing}</span>
          </p>
        </div>
      </div>
      {#if statusCounts.skip > 0 || rhythmCounts.skip > statusCounts.skip}
        <p class="status-caption small">
          判定しない：音程 {statusCounts.skip}・リズム {rhythmCounts.skip}
        </p>
      {/if}
    {:else}
      <p class="status-caption">「始める」を押すと、カウントが{countInBeats}拍鳴ります</p>
      <p class="status-main idle">♩＝{tempo}</p>
      <!-- 今のテンポで短すぎて判定しない音があるときは、その数を知らせる -->
      {#if skipCount > 0}
        <p class="status-caption">このテンポでは、短い音 {skipCount}音は判定しません（灰色）</p>
      {/if}
    {/if}
  </div>

  <!-- タップして選んだ音の結果 -->
  {#if selectedIndex !== null && results[selectedIndex] !== undefined}
    {@const item = timeline.items[selectedIndex]}
    {@const result = results[selectedIndex]}
    <p class="selected-result {result.status}">
      {measureName(score, item.positions[0].measure)}・{noteToText(item.note)}：{STATUS_LABELS[result.status]}
      {#if result.cents !== null}
        {formatCents(result.cents)}セント・{centsToPoints(result.cents)}点
      {/if}
      {#if result.openString === true}
        （開放弦）
      {/if}
      <!-- リズムの結果（ステップD） -->
      {#if rhythmResults[selectedIndex] !== undefined}
        {@const rhythm = rhythmResults[selectedIndex]}
        <br />
        リズム：
        {#if rhythm.status === "skip"}
          判定しない
        {:else}
          {RHYTHM_STYLES[rhythm.status].label}
          {#if rhythm.seconds !== null}
            {rhythm.seconds >= 0 ? "+" : "−"}{Math.abs(rhythm.seconds).toFixed(2)}秒・{secondsToPoints(scoredSeconds(rhythm))}点
          {/if}
          <!-- 甘くした音には、その理由の印を付ける（rit.・rall.・𝄐 など）（ステップE-3） -->
          {#if rhythm.label}
            <span class="loose-label">（{rhythm.label}）</span>
          {/if}
        {/if}
      {/if}
    </p>
  {:else if phase === "finished"}
    <p class="hint">音符をタップすると、その音の結果が見られます</p>
  {/if}

  <!-- くり返しの、回ごとの点数 -->
  {#if roundScores.length > 0}
    <ul class="round-list">
      {#each roundScores as roundScore, index}
        <!-- ステップD：音程とリズムの点数を並べる -->
        <li class="round">{index + 1}回目 音程 <strong>{roundScore.pitch}点</strong>・リズム <strong>{roundScore.rhythm}点</strong></li>
      {/each}
    </ul>
  {/if}

  <!-- エラーメッセージ -->
  {#if errorMessage !== ""}
    <p class="error">{errorMessage}</p>
  {/if}

  <!-- 横向きがおすすめの案内（ステップE-1） -->
  <!-- スマホを縦向きにしているときだけ出す（下の style の @media で、縦向きで幅の狭い画面のときだけ表示する） -->
  <p class="orientation-hint">📱 スマホは横向きにすると、楽譜が広く見えて弾きやすくなります</p>

  <!-- テンポの指定と、始めるボタン（ステップE-1：「やめる」ボタンは、上の run-bar に移した） -->
  <div class="control-row">
    <span class="tempo-text">♩＝{tempo}</span>
    <button class="tempo-button" aria-label="テンポを遅くする" disabled={tempo <= TEMPO_MIN} onclick={() => changeTempo(-TEMPO_STEP)}> − </button>
    <button class="tempo-button" aria-label="テンポを速くする" disabled={tempo >= TEMPO_MAX} onclick={() => changeTempo(TEMPO_STEP)}> ＋ </button>
    <button class="main-button start" onclick={start}>
      {phase === "finished" ? "▶ もう一度" : "▶ 始める"}
    </button>
  </div>

  <!-- お手本を聴くボタン（ステップC-3） -->
  <button class="preview-button" onclick={startPreview}>♪ お手本を聴く</button>

  <!-- 設定：ふだんは閉じておき、「設定」を押すと開く -->
  <details class="settings">
    <summary>設定</summary>
    <div class="setting-row">
      <span class="setting-label">カウントの拍の数</span>
      <span class="setting-value">{countInBeats}</span>
      <button class="tempo-button" aria-label="カウントの拍の数を減らす" disabled={countInBeats <= COUNT_IN_MIN} onclick={() => changeCountIn(-1)}> − </button>
      <button class="tempo-button" aria-label="カウントの拍の数を増やす" disabled={countInBeats >= COUNT_IN_MAX} onclick={() => changeCountIn(1)}> ＋ </button>
    </div>
  </details>
{/if}

<style>
  /* 楽譜の見せ方の行（ステップE-2） */
  .view-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.9rem;
  }
  .view-caption {
    color: #616161;
  }
  .view-caption.small {
    font-size: 0.8rem;
  }

  /* 幅の倍率の数字 */
  .scale-value {
    min-width: 3.2em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* 楽譜の見せ方のボタン（練習ページの判定のボタンと同じ見た目） */
  button.view-button {
    height: auto;
    padding: 6px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 1px solid #1976d2;
  }

  /* 選んでいる見せ方：青く塗る */
  button.view-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* リズムのヒントの入・切の行：チェックボックスを横に並べる（ステップC-2） */
  .hint-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 6px;
    font-size: 0.9rem;
  }

  /* チェックボックスと文字 */
  .hint-label {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* 今の状態の表示のエリア：中央に寄せる */
  .status-area {
    margin-top: 4px;
    text-align: center;
  }

  /* 小さな見出し */
  .status-caption {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 大きく表示する文字（目標の音名。今の音の帯と同じオレンジ） */
  .status-main {
    margin: 0;
    font-size: 3rem;
    font-weight: bold;
    color: #e65100;
    font-variant-numeric: tabular-nums;
  }

  /* 音程とリズムの点数を横に並べる（ステップD） */
  .score-pair {
    display: flex;
    justify-content: center;
    gap: 16px;
  }

  /* 点数1つぶん */
  .score-box {
    flex: 1;
    max-width: 220px;
  }

  /* 「点」の文字：小さく */
  .unit {
    margin-left: 2px;
    font-size: 1.2rem;
  }

  /* リズムの点数の数字：紫 */
  .status-main.finished.rhythm {
    color: #6a1b9a;
  }

  /* 結果の数：小さめ */
  .status-caption.small {
    font-size: 0.75rem;
  }

  /* 結果の数の「名前 数」1つぶん：途中で折り返さない。となりとの間を少しあける */
  .count {
    display: inline-block;
    margin: 0 4px;
    white-space: nowrap;
  }

  /* 点数の文字：緑 */
  .status-main.finished {
    color: #2e7d32;
  }

  /* 始める前のテンポの表示：薄いグレー */
  .status-main.idle {
    color: #9e9e9e;
  }

  /* タップして選んだ音の結果：結果の色の枠で囲む */
  .selected-result {
    margin: 8px 0 0 0;
    padding: 6px 10px;
    font-size: 0.9rem;
    text-align: center;
    border: 1px solid currentColor;
    border-radius: 12px;
    font-variant-numeric: tabular-nums;
  }
  .selected-result.ok {
    color: #2e7d32;
  }
  .selected-result.high {
    color: #c62828;
  }
  .selected-result.low {
    color: #1565c0;
  }
  .selected-result.none,
  .selected-result.skip {
    color: #757575;
  }

  /* 「音符をタップすると…」の案内 */
  /* 結果の札の、リズムを甘くした理由の印（rit.・𝄐 など）：斜めの小さな文字（ステップE-3） */
  .loose-label {
    font-size: 0.85em;
    font-style: italic;
    color: #616161;
  }

  .hint {
    margin: 8px 0 0 0;
    font-size: 0.8rem;
    color: #757575;
    text-align: center;
  }

  /* くり返しの、回ごとの点数の一覧 */
  .round-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 8px 0 0 0;
    padding: 0;
    list-style: none;
  }
  .round {
    font-size: 0.9rem;
    color: #616161;
    font-variant-numeric: tabular-nums;
  }
  .round strong {
    color: #2e7d32;
  }

  /* エラーメッセージ */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* ===== 動いている間の、カウントの数字と「やめる」ボタンの行（ステップE-1） ===== */
  .run-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* カウントの数字：グレーの太字。ボタンと同じ高さに収める */
  .run-count {
    min-width: 2em;
    font-size: 2.2rem;
    font-weight: bold;
    line-height: 44px;
    text-align: center;
    color: #616161;
    font-variant-numeric: tabular-nums;
  }

  /* 「準備中」の文字：数字より小さく */
  .run-count.preparing {
    font-size: 1rem;
  }

  /* 横向きがおすすめの案内（ステップE-1）：ふだんは隠しておく */
  .orientation-hint {
    display: none;
    margin: 12px 0 0 0;
    padding: 6px 10px;
    font-size: 0.8rem;
    color: #e65100;
    background-color: #fff3e0;
    border-radius: 8px;
  }

  /* 縦向きで、幅の狭い画面（スマホの縦向き）のときだけ、案内を出す */
  @media (orientation: portrait) and (max-width: 600px) {
    .orientation-hint {
      display: block;
    }
  }

  /* テンポの表示・テンポのボタン・始めるボタンを横に並べる */
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  /* テンポの表示 */
  .tempo-text {
    min-width: 4.5em;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  /* ボタン共通 */
  button {
    height: 44px;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* テンポの「−」「＋」ボタン */
  button.tempo-button {
    width: 44px;
    flex-shrink: 0;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 始める・やめるボタン */
  button.main-button {
    flex: 1;
    color: white;
    border: none;
  }
  button.main-button.start {
    background-color: #1976d2;
  }
  button.main-button.stop {
    background-color: #c62828;
  }

  /* 「お手本を聴く」ボタン：横幅いっぱいの緑のボタン（「じっくり」の［目標の音を聴く］と同じ色）（ステップC-3） */
  button.preview-button {
    display: block;
    width: 100%;
    margin-top: 8px;
    color: white;
    background-color: #2e7d32;
    border: none;
  }

  /* 設定のエリア */
  .settings {
    margin-top: 16px;
    font-size: 0.9rem;
    color: #616161;
  }
  .settings summary {
    cursor: pointer;
  }
  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .setting-label {
    flex: 1;
  }
  .setting-value {
    min-width: 2em;
    text-align: right;
    font-size: 1rem;
    color: #212121;
    font-variant-numeric: tabular-nums;
  }
</style>
