<script>
  // 「通し」モードの練習の部品
  // メトロノームのテンポに合わせて、目標の音が1拍ごとに次へ進む。
  // 弾いた音は、1拍ごとに「OK・高い・低い・音なし」のどれかに判定して記録する。
  // 最後まで進むと、全体の点数を表示する。「くり返す」ときは、短いカウントのあと、もう一度最初から進む。

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

  // 1音ごとの点数と、全体の点数を計算する関数を読み込む
  import { centsToPoints, getTotalScore } from "#lib/scoring.js";

  // マイクで音の高さを調べはじめる関数と、止める関数を読み込む
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // メトロノームの音を鳴らす関数と、合図の音を鳴らす関数を読み込む
  import { playClick, playChime } from "#lib/audio.js";

  // カウントの拍の数を、ブラウザに保存する関数と読み込む関数を読み込む
  import { loadCountInBeats, saveCountInBeats } from "#lib/settings.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

  // この部品を使う側（練習ページ）から受け取る値
  // notes        ：練習する楽譜の音の並び（音のデータの配列。1つ以上入っていること）
  // currentKey   ：楽譜の調のデータ
  // initialTempo ：最初のテンポ（編集ページで決めたテンポ）
  // temperamentId：音律の id（'just'・'pythagorean'・'equal'）
  // tolerance    ：OK とする範囲（セント）。±この値までを OK にする
  // allowOpenString：開放弦の高さで弾いた音も OK にするかどうか（true：する）
  // repeatEnabled  ：最後の音まで進んだら、最初の音に戻ってくり返すかどうか（true：くり返す）
  // ontempochange  ：テンポを変えたときに呼ぶ関数。新しいテンポを渡す
  //                  （練習ページがテンポを覚えておき、この部品を作り直したときに同じテンポで始めるため）
  // onfinish       ：最後の音まで進んで、点数が出たときに呼ぶ関数。その回の点数を渡す
  //                  （練習ページが、楽譜ごとの最高点を記録するため）
  // clefId         ：五線譜を描く音部記号の id（"alto"・"treble"・"tenor"）（ビオラ版。渡されなかったときはアルト記号）
  // ontempochange と onfinish は、渡されなかったときのための初期値（何もしない関数）を決めておく
  let { notes, currentKey, initialTempo, temperamentId, tolerance, allowOpenString, repeatEnabled, ontempochange = () => {}, onfinish = () => {}, clefId = "alto" } = $props();

  // ===== テンポとカウントに関する設定値 =====

  // テンポ（1分間の拍の数）の最小・最大と、ボタン1回で変わる量
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 200;
  const TEMPO_STEP = 5;

  // 弾きはじめる前に、メトロノームだけを鳴らす拍の数（カウント）の最小・最大と、最初の値
  // （弓を構える時間がほしいので、少し長めにしてある）
  const COUNT_IN_MIN = 5;
  const COUNT_IN_MAX = 30;
  const COUNT_IN_DEFAULT = 10;

  // くり返しの2回目からの、カウントの拍の数
  // 弓をもう構えているので、最初のカウントより短くする
  const REPEAT_COUNT_IN_BEATS = 4;

  // ===== 判定に関する設定値 =====

  // 1拍のうち、判定に使いはじめる位置（0.5 なら、拍の後半だけを判定に使う）
  // 弾きはじめは音程が揺れやすく、メトロノームの音も拍の頭で鳴るので、前半は使わない
  const JUDGE_START_RATIO = 0.5;

  // 判定に必要な、音の高さのデータの数。これより少ないときは「音なし」にする
  const MIN_SAMPLES = 3;

  // 結果の種類ごとの、表示する文字
  const STATUS_LABELS = {
    ok: "OK",
    high: "高い",
    low: "低い",
    none: "音なし",
  };

  // 最後まで弾けたときに鳴らす、終わりの合図の音の高さ（Hz）。順番に続けて鳴らす
  // 1768 は ラ6（基準音 442Hz の2オクターブ上）、2652 はその5度上（1.5倍）の ミ7
  const FINISH_CHIME_FREQUENCIES = [1768, 2652];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // テンポ（1分間の拍の数）。四分音符1つが1拍
  // 最初は、編集ページで決めたテンポにする。そのあとは、このページの「−」「＋」で変えられる
  // untrack で囲むのは、「最初の値として1回だけ読む」ことをSvelteにはっきり伝えるため
  let tempo = $state(untrack(() => clampTempo(initialTempo)));

  // カウントの拍の数。設定の「−」「＋」で変えられる
  // 最初は決めておいた値にしておき、保存した値があれば、下の onMount で入れ直す
  let countInBeats = $state(COUNT_IN_DEFAULT);

  // 今の状態。次の5つのどれかが入る
  //   'idle'     ：始める前（または、途中でやめたあと）
  //   'preparing'：マイクの準備中（使用許可を待っている）
  //   'countIn'  ：カウント中（メトロノームだけが鳴っている）
  //   'playing'  ：演奏中（目標の音が1拍ごとに進んでいる）
  //   'finished' ：最後まで進んだ
  let phase = $state("idle");

  // カウントの残りの拍の数（10 → 9 → … → 1）。カウント中だけ使う
  let countInRemaining = $state(0);

  // 今の目標の音が何番目か（0から始まる）。演奏中だけ入り、それ以外は null
  let currentIndex = $state(null);

  // 1音ごとの判定の結果を、楽譜の順に入れておく配列
  // 1つの結果は { status: 結果の種類, cents: 目標の音とのずれ（セント）, openString: 開放弦と比べたか } の形
  //   status    ：'ok'（OK）・'high'（高い）・'low'（低い）・'none'（音なし）
  //   cents     ：音なしのときは null
  //   openString：開放弦の高さと比べた結果のとき true（音なしのときは入っていない）
  let results = $state([]);

  // くり返しの、回ごとの点数を順に入れておく配列（例：[86, 91] は、1回目86点・2回目91点）
  let roundScores = $state([]);

  // 五線譜でタップして選んだ音が何番目か（0から始まる）。選んでいないときは null
  // 選んだ音の結果の札を、目立つように表示するために使う
  let selectedIndex = $state(null);

  // エラーメッセージ（マイクが使えなかったときなどに表示する）
  let errorMessage = $state("");

  // ===== 進行のために覚えておく値（画面には表示しないので $state は付けない） =====

  // 次の拍のための予約の番号（やめるときに、予約を取り消すために使う）
  let timer = null;

  // 今の回を始めた時刻（ページを開いてからのミリ秒）。くり返しで次の回に入るたびに、入れ直す
  let startTime = 0;

  // 今の回の、カウントの拍の数（1回目は設定の拍の数、2回目からは短いカウント）
  let roundCountInBeats = 0;

  // 1拍の長さ（ミリ秒）。始めるときに、そのときのテンポから計算する
  let beatMilliseconds = 0;

  // 今の拍が始まった時刻（ページを開いてからのミリ秒）
  let beatStartTime = 0;

  // 今の拍の後半に、マイクが検出した音の高さ（Hz）を集めておく配列
  let samples = [];

  // 動いている最中かどうか（マイクの準備中・カウント中・演奏中なら true）
  // $derived を付けると、phase が変わるたびに自動で計算し直される
  let isRunning = $derived(phase === "preparing" || phase === "countIn" || phase === "playing");

  // 全体の点数（1音ごとの点数の平均）
  // results.map(…) で、結果の中のずれ（cents）だけを並べた配列を作って渡す
  let totalScore = $derived(getTotalScore(results.map((result) => result.cents)));

  // 結果の種類ごとの数（OK がいくつ、高いがいくつ、…）
  // $derived.by は、何行かの計算の結果を入れておきたいときに使う
  let statusCounts = $derived.by(() => {
    // 最初は全部 0 にしておき、結果を1つずつ見て、その種類の数を1増やす
    const counts = { ok: 0, high: 0, low: 0, none: 0 };
    for (const result of results) {
      counts[result.status] += 1;
    }
    return counts;
  });

  // この部品が画面に表示されたときに、前回保存したカウントの拍の数を読み込む
  // （ブラウザの保存場所は、画面が表示されたあとでないと使えないため、ここで読み込む）
  onMount(() => {
    const savedCountInBeats = loadCountInBeats();

    // 保存した値があるときだけ使う（念のため、最小と最大の間に収める）
    if (savedCountInBeats !== null) {
      countInBeats = clampCountIn(savedCountInBeats);
    }
  });

  // この部品が画面から消えるとき（別のモードに切り替えたときや、ページを離れたとき）に、進行を止める
  onDestroy(() => {
    stop();
  });

  /**
   * テンポを、最小と最大の間に収める関数
   * @param {number} value - テンポ
   * @returns {number} 最小と最大の間に収めたテンポ
   */
  function clampTempo(value) {
    return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, value));
  }

  /**
   * テンポを変える関数
   * テンポの「−」「＋」ボタンを押したときに呼ばれる。
   * @param {number} amount - 変える量（遅くするときはマイナス、速くするときはプラス）
   */
  function changeTempo(amount) {
    tempo = clampTempo(tempo + amount);

    // 新しいテンポを、練習ページに伝える（区間やモードを変えても、同じテンポで始められるようにするため）
    ontempochange(tempo);
  }

  /**
   * カウントの拍の数を、最小と最大の間に収める関数
   * @param {number} value - カウントの拍の数
   * @returns {number} 最小と最大の間に収めたカウントの拍の数
   */
  function clampCountIn(value) {
    return Math.min(COUNT_IN_MAX, Math.max(COUNT_IN_MIN, value));
  }

  /**
   * カウントの拍の数を変える関数
   * 設定の「−」「＋」ボタンを押したときに呼ばれる。変えた値はブラウザに保存する。
   * @param {number} amount - 変える量（減らすときはマイナス、増やすときはプラス）
   */
  function changeCountIn(amount) {
    countInBeats = clampCountIn(countInBeats + amount);

    // 次に開いたときも同じ値で始められるように、ブラウザに保存する
    saveCountInBeats(countInBeats);
  }

  /**
   * 五線譜の音符がタップされたときに、その音を選ぶ関数
   * 選んだ音の結果の札が、目立つ表示になる。同じ音をもう一度タップすると、選ぶのをやめる。
   * @param {number} noteIndex - タップされた音が何番目か（0から始まる）
   */
  function selectNote(noteIndex) {
    // まだ判定していない音（結果が無い音）は、選べないようにする
    // results[noteIndex] は、結果が無いとき undefined になる
    if (results[noteIndex] === undefined) {
      return;
    }

    if (selectedIndex === noteIndex) {
      // すでに選んでいる音をタップしたとき：選ぶのをやめる
      selectedIndex = null;
    } else {
      // それ以外：タップされた音を選ぶ
      selectedIndex = noteIndex;
    }
  }

  /**
   * 「通し」の練習を始める関数
   * 「始める」ボタンを押したときに呼ばれる。
   * マイクを開始してからカウントを鳴らし、そのあと1拍ごとに目標の音を進める。
   */
  async function start() {
    // 前回のエラーメッセージ・前回の結果・回ごとの点数を消す。音を選んでいたら、それもやめる
    errorMessage = "";
    results = [];
    roundScores = [];
    selectedIndex = null;

    // マイクの準備中にする（この間は「やめる」ボタンが出る）
    phase = "preparing";

    try {
      // マイクを開始する。音の高さが分かるたびに、handlePitch が呼ばれる
      // await は「終わるまで待つ」という意味（使用許可の画面が出ている間、ここで待つ）
      await startMicrophone(handlePitch);
    } catch (error) {
      // 許可を拒否された場合や、マイクが見つからない場合はここに来る
      // どんなエラーかは、microphone.js が日本語のメッセージにしてくれている
      errorMessage = error.message;
      phase = "idle";
      return;
    }

    // マイクの準備を待っている間に「やめる」が押されていたら、マイクを止めて終わる
    if (phase !== "preparing") {
      stopMicrophone();
      return;
    }

    // 1拍の長さ（ミリ秒）を計算する。テンポ60なら1000、テンポ120なら500
    beatMilliseconds = 60000 / tempo;

    // 1回目のカウントは、設定の拍の数にする
    roundCountInBeats = countInBeats;

    // 始めた時刻を覚えておく（それぞれの拍の時刻を計算するために使う）
    // performance.now() は、ページを開いてからの時間をミリ秒で返す
    startTime = performance.now();

    // 最初の拍（カウントの1拍目）から始める
    runBeat(0);
  }

  /**
   * 1拍ぶんの処理をして、次の拍を予約する関数
   * 1拍ごとに呼ばれる。カウント → 楽譜の音を順に → 終わり（くり返すときは次の回のカウント）、と進む。
   * @param {number} beat - 今の回を始めてから何拍目か（0から始まる。カウントの拍も含めて数える）
   */
  function runBeat(beat) {
    // 楽譜の何番目の音にあたるか（カウントの間はマイナスになる）
    const noteIndex = beat - roundCountInBeats;

    // 1つ前の拍が楽譜の音だったら、その音の判定をして結果を記録する
    if (noteIndex >= 1) {
      judgeNote(noteIndex - 1);
    }

    // この拍が始まった時刻を覚えて、集めた音の高さを空にする
    beatStartTime = startTime + beat * beatMilliseconds;
    samples = [];

    if (noteIndex < 0) {
      // カウント中：残りの拍の数を表示して、メトロノームを鳴らす
      phase = "countIn";
      countInRemaining = roundCountInBeats - beat;
      currentIndex = null;
      playClick();
    } else if (noteIndex < notes.length) {
      // 1音目が始まるとき：前の回の結果を消す（くり返しの2回目から。1回目はもともと空）
      // 前の回の結果は、カウントの間に見直せるように、ここまで残してある
      if (noteIndex === 0) {
        results = [];
        selectedIndex = null;
      }

      // 演奏中：この拍の音を目標にして、メトロノームを鳴らす
      phase = "playing";
      currentIndex = noteIndex;
      playClick();
    } else {
      // 最後の音の拍が終わった

      // 終わりの合図の音を鳴らす（判定はもう終わっているので、点数には影響しない）
      playChime(FINISH_CHIME_FREQUENCIES);

      // この回の点数を、練習ページに伝える（楽譜ごとの最高点を記録するため）
      onfinish(totalScore);

      // くり返しているとき（または、途中でくり返しをやめたとき）は、この回の点数を記録する
      if (repeatEnabled || roundScores.length > 0) {
        roundScores.push(totalScore);
      }

      // くり返すとき：メトロノームを止めずに、短いカウントから次の回を始める
      if (repeatEnabled) {
        // 今の拍の時刻を、次の回を始めた時刻にする
        startTime = startTime + beat * beatMilliseconds;

        // 2回目からは、短いカウントにする
        roundCountInBeats = REPEAT_COUNT_IN_BEATS;

        // 次の回の最初の拍（カウントの1拍目）から始める
        runBeat(0);
        return;
      }

      // くり返さないとき：マイクを止めて、終わりにする
      stopMicrophone();
      timer = null;
      phase = "finished";
      currentIndex = null;
      return;
    }

    // 次の拍の時刻を、始めた時刻から計算する
    // （「今から1拍後」と数えていくと、少しずつ遅れが積み重なるため）
    const nextTime = startTime + (beat + 1) * beatMilliseconds;

    // 次の拍までの待ち時間（ミリ秒）。すでに過ぎていたら、すぐに進める
    const delay = Math.max(0, nextTime - performance.now());

    // 待ち時間のあとに、次の拍でこの関数をもう一度呼ぶように予約する
    timer = setTimeout(() => runBeat(beat + 1), delay);
  }

  /**
   * マイクが音の高さを調べるたびに呼ばれる関数
   * 演奏中の、拍の後半に検出した音の高さだけを集めておく。
   * @param {number|null} frequency - 検出した周波数（Hz）。音が出ていないときは null
   */
  function handlePitch(frequency) {
    // 演奏中でなければ（カウント中など）、何もしない
    if (phase !== "playing") {
      return;
    }

    // 音が出ていないときは、何もしない
    if (frequency === null) {
      return;
    }

    // 今の拍が始まってからの時間（ミリ秒）
    const elapsed = performance.now() - beatStartTime;

    // 拍の前半は、判定に使わない
    if (elapsed < beatMilliseconds * JUDGE_START_RATIO) {
      return;
    }

    // 拍の後半の音の高さを集めておく
    samples.push(frequency);
  }

  /**
   * 数字の並びの「真ん中の値」（中央値）を求める関数
   * 平均とちがって、少しだけ混ざった大きく外れた値に引っぱられにくい。
   * @param {number[]} values - 数字の配列（1つ以上入っていること）
   * @returns {number} 真ん中の値
   */
  function getMedian(values) {
    // もとの配列を変えないように、コピーしてから小さい順に並べる
    const sorted = [...values].sort((a, b) => a - b);

    // 真ん中の位置
    const middle = Math.floor(sorted.length / 2);

    // 個数が奇数なら真ん中の1つ、偶数なら真ん中の2つの平均を返す
    if (sorted.length % 2 === 1) {
      return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /**
   * 1つの音の判定をして、結果を記録する関数
   * その音の拍が終わったときに呼ばれる。拍の後半に集めた音の高さを、目標の音と比べる。
   * @param {number} noteIndex - 楽譜の何番目の音か（0から始まる）
   */
  function judgeNote(noteIndex) {
    // 集めた音の高さが少なすぎるときは「音なし」にする
    if (samples.length < MIN_SAMPLES) {
      results.push({ status: "none", cents: null });
      return;
    }

    // 目標の音の周波数（選んだ音律で計算する）
    const targetFrequency = getFrequency(notes[noteIndex], currentKey, temperamentId);

    // 弾いた音の高さ（集めた値の真ん中の値）
    const playedFrequency = getMedian(samples);

    // 目標の音とのずれ（セント）。プラスなら高い、マイナスなら低い
    // （このあと、開放弦とのずれに入れ替えることがあるので、const ではなく let にしている）
    let cents = 1200 * Math.log2(playedFrequency / targetFrequency);

    // 開放弦の高さと比べた結果を使ったかどうか
    let usedOpenString = false;

    // 「開放弦の高さで弾いた音もOKにする」とき：開放弦の高さとも比べる
    if (allowOpenString) {
      // 目標の音が開放弦と同じ音（ド3・ソ3・レ4・ラ4）なら、開放弦の周波数が返る。違えば null
      const openFrequency = getOpenStringFrequency(notes[noteIndex]);

      if (openFrequency !== null) {
        // 開放弦の高さとのずれ（セント）
        const openCents = 1200 * Math.log2(playedFrequency / openFrequency);

        // 開放弦とのずれのほうが小さければ、そちらを採用する
        // Math.abs は、マイナスを取って「ずれの大きさ」にする
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

    // 結果を記録する（openString は、開放弦の高さと比べた結果のとき true）
    results.push({ status: status, cents: cents, openString: usedOpenString });
  }

  /**
   * 「通し」の練習を途中でやめる関数
   * 「やめる」ボタンを押したときと、この部品が画面から消えるときに呼ばれる。
   * そこまでの結果は画面に残す（次に始めるときに消える）。
   */
  function stop() {
    // 次の拍の予約を取り消す
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    // マイクを止める
    stopMicrophone();

    // 始める前の状態に戻す
    phase = "idle";
    currentIndex = null;
  }
</script>

<!-- 五線譜（今の目標の音を、編集ページの「再生中」と同じオレンジで表示する） -->
<!-- statuses には、判定の結果の種類だけを取り出した配列を渡す（音符の色と記号になる） -->
<!-- results.map(…) は、結果を1つずつ取り出して、その中の status だけを並べた配列を作る -->
<!-- selectedIndex と onselect で、音符をタップして選べるようにする（選んだ音は青い帯になる） -->
<Staff {notes} signature={currentKey.signature} {clefId} playingIndex={currentIndex} statuses={results.map((result) => result.status)} {selectedIndex} onselect={selectNote} />

<!-- 今の状態の表示：状態によって、表示する内容を切り替える -->
<div class="status-area">
  {#if phase === "preparing"}
    <!-- マイクの準備中 -->
    <p class="status-caption">　</p>
    <p class="status-main idle">マイクの準備中</p>
  {:else if phase === "countIn"}
    <!-- カウント中：残りの拍の数を大きく表示する -->
    <p class="status-caption">カウント</p>
    <p class="status-main count">{countInRemaining}</p>
  {:else if phase === "playing"}
    <!-- 演奏中：今の目標の音を大きく表示する -->
    <p class="status-caption">
      目標の音（{currentIndex + 1} / {notes.length}）
      <!-- くり返すときは、今が何回目かも表示する（記録した点数の数 ＋ 1 が、今の回） -->
      {#if repeatEnabled}
        ・くり返し {roundScores.length + 1}回目
      {/if}
    </p>
    <p class="status-main">{noteToText(notes[currentIndex])}</p>
  {:else if phase === "finished"}
    <!-- 最後まで進んだ：全体の点数と、結果の種類ごとの数を表示する -->
    <p class="status-caption">点数</p>
    <p class="status-main finished">{totalScore} 点</p>
    <p class="status-caption">
      OK {statusCounts.ok}　高い {statusCounts.high}　低い {statusCounts.low}　音なし {statusCounts.none}
    </p>
  {:else}
    <!-- 始める前：やり方を案内する -->
    <p class="status-caption">「始める」を押すと、カウントが{countInBeats}拍鳴ります</p>
    <p class="status-main idle">♩＝{tempo}</p>
  {/if}
</div>

<!-- 判定の結果の一覧：結果が1つ以上あるときだけ表示する -->
<!-- 何セントずれたかと、1音ごとの点数は、五線譜では分からないので、ここで表示する -->
{#if results.length > 0}
  <ul class="result-list">
    <!-- 結果を1つずつ取り出して表示する（index は 0 から始まる番号） -->
    {#each results as result, index}
      <!-- 結果の種類（ok・high・low・none）を class に付けて、色を変える -->
      <!-- 五線譜で選んだ音の札には selected を付けて、目立つ表示にする -->
      <li class="result {result.status}" class:selected={index === selectedIndex}>
        <span class="result-note">{index + 1}. {noteToText(notes[index])}</span>
        {STATUS_LABELS[result.status]}
        <!-- ずれ（セント）は、音なしのときは表示しない -->
        {#if result.cents !== null}
          {formatCents(result.cents)}
        {/if}
        <!-- 開放弦の高さと比べた結果のときは、そのことが分かるように印を付ける -->
        {#if result.openString === true}
          開放弦
        {/if}
        <!-- この音の点数 -->
        <span class="result-note">{centsToPoints(result.cents)}点</span>
      </li>
    {/each}
  </ul>
{/if}

<!-- くり返しの、回ごとの点数：1回以上記録があるときだけ表示する -->
{#if roundScores.length > 0}
  <ul class="round-list">
    <!-- 点数を1つずつ取り出して表示する（index は 0 から始まるので、1を足して「何回目」にする） -->
    {#each roundScores as score, index}
      <li class="round">{index + 1}回目 <strong>{score}点</strong></li>
    {/each}
  </ul>
{/if}

<!-- エラーメッセージ：エラーがあるときだけ表示する -->
{#if errorMessage !== ""}
  <p class="error">{errorMessage}</p>
{/if}

<!-- テンポの指定と、始める・やめるのボタン -->
<div class="control-row">
  <!-- 今のテンポ。♩＝60 は「四分音符を1分間に60回」という意味 -->
  <span class="tempo-text">♩＝{tempo}</span>

  <!-- テンポを遅くするボタン（動いている最中と、これ以上遅くできないときは押せない） -->
  <!-- aria-label は、読み上げで操作する人のための、ボタンの説明 -->
  <button class="tempo-button" aria-label="テンポを遅くする" disabled={isRunning || tempo <= TEMPO_MIN} onclick={() => changeTempo(-TEMPO_STEP)}> − </button>

  <!-- テンポを速くするボタン（動いている最中と、これ以上速くできないときは押せない） -->
  <button class="tempo-button" aria-label="テンポを速くする" disabled={isRunning || tempo >= TEMPO_MAX} onclick={() => changeTempo(TEMPO_STEP)}> ＋ </button>

  <!-- 動いている最中は「やめる」ボタン、それ以外は「始める」ボタンを表示する -->
  {#if isRunning}
    <button class="main-button stop" onclick={stop}>■ やめる</button>
  {:else}
    <button class="main-button start" onclick={start}>
      {phase === "finished" ? "▶ もう一度" : "▶ 始める"}
    </button>
  {/if}
</div>

<!-- 設定：ふだんは閉じておき、「設定」を押すと開く -->
<details class="settings">
  <summary>設定</summary>

  <!-- カウントの拍の数（動いている最中は変えられない） -->
  <div class="setting-row">
    <span class="setting-label">カウントの拍の数</span>
    <span class="setting-value">{countInBeats}</span>

    <!-- 減らすボタン（動いている最中と、これ以上減らせないときは押せない） -->
    <button class="tempo-button" aria-label="カウントの拍の数を減らす" disabled={isRunning || countInBeats <= COUNT_IN_MIN} onclick={() => changeCountIn(-1)}> − </button>

    <!-- 増やすボタン（動いている最中と、これ以上増やせないときは押せない） -->
    <button class="tempo-button" aria-label="カウントの拍の数を増やす" disabled={isRunning || countInBeats >= COUNT_IN_MAX} onclick={() => changeCountIn(1)}> ＋ </button>
  </div>
</details>

<style>
  /* 今の状態の表示のエリア：中央に寄せる */
  .status-area {
    margin-top: 4px;
    text-align: center;
  }

  /* 小さな見出し（「カウント」「目標の音（3 / 8）」など） */
  .status-caption {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 大きく表示する文字（目標の音名。五線譜の目標の音と同じオレンジにする） */
  .status-main {
    margin: 0;
    font-size: 3rem;
    font-weight: bold;
    color: #e65100;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* カウントの数字：グレー */
  .status-main.count {
    color: #616161;
  }

  /* 点数の文字：緑 */
  .status-main.finished {
    color: #2e7d32;
  }

  /* 始める前のテンポの表示：薄いグレー */
  .status-main.idle {
    color: #9e9e9e;
  }

  /* 判定の結果の一覧：横に並べて、入りきらないときは折り返す */
  .result-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 0 0;
    padding: 0;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 結果1つぶん：角の丸い小さな札にする */
  .result {
    padding: 2px 8px;
    font-size: 0.85rem;
    border: 1px solid currentColor;
    border-radius: 12px;
    /* 数字の幅をそろえる */
    font-variant-numeric: tabular-nums;
  }

  /* 結果の中の、番号・音名・点数：少し薄くする */
  .result-note {
    opacity: 0.7;
  }

  /* OK：緑 */
  .result.ok {
    color: #2e7d32;
  }

  /* 高い：赤 */
  .result.high {
    color: #c62828;
  }

  /* 低い：青 */
  .result.low {
    color: #1565c0;
  }

  /* 音なし：グレー */
  .result.none {
    color: #757575;
  }

  /* 五線譜で選んだ音の札：色を塗って白い文字にし、少し大きく太くして目立たせる */
  .result.selected {
    font-size: 1.05rem;
    font-weight: bold;
    color: white;
  }

  /* 選んだ札の中の、番号・音名・点数：薄くしない（白い文字がはっきり見えるように） */
  .result.selected .result-note {
    opacity: 1;
  }

  /* 選んだ札の色：結果の種類ごとに、文字の色と同じ色で塗る */
  .result.ok.selected {
    background-color: #2e7d32;
    border-color: #2e7d32;
  }

  .result.high.selected {
    background-color: #c62828;
    border-color: #c62828;
  }

  .result.low.selected {
    background-color: #1565c0;
    border-color: #1565c0;
  }

  .result.none.selected {
    background-color: #757575;
    border-color: #757575;
  }

  /* くり返しの、回ごとの点数の一覧：横に並べて、入りきらないときは折り返す */
  .round-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin: 8px 0 0 0;
    padding: 0;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 回ごとの点数1つぶん */
  .round {
    font-size: 0.9rem;
    color: #616161;
    /* 数字の幅をそろえる */
    font-variant-numeric: tabular-nums;
  }

  /* 点数の数字：緑の太字にする */
  .round strong {
    color: #2e7d32;
  }

  /* エラーメッセージ */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* テンポの表示・テンポのボタン・始めるボタンを横に並べる */
  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  /* テンポの表示（♩＝60） */
  .tempo-text {
    /* テンポが3けたになっても横幅が変わらないように、幅を決めておく */
    min-width: 4.5em;
    font-size: 1rem;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* ボタン共通：高さを数値で決めて、ボタンの高さをそろえる */
  button {
    height: 44px;
    padding: 0;
    font-size: 1rem;
    line-height: 1;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* テンポの「−」「＋」ボタン：正方形にする */
  button.tempo-button {
    width: 44px;
    flex-shrink: 0;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 始める・やめるボタン：残りの横幅いっぱいに広げる */
  button.main-button {
    flex: 1;
    color: white;
    border: none;
  }

  /* 設定のエリア */
  .settings {
    margin-top: 16px;
    font-size: 0.9rem;
    color: #616161;
  }

  /* 「設定」の文字：押せることが分かるように、カーソルを指の形にする */
  .settings summary {
    cursor: pointer;
  }

  /* 設定の1行：名前・値・ボタンを横に並べる */
  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* 設定の名前：残りの横幅を使って、値とボタンを右に寄せる */
  .setting-label {
    flex: 1;
  }

  /* 設定の値（拍の数）：けた数が変わっても横幅が変わらないようにする */
  .setting-value {
    min-width: 2em;
    text-align: right;
    font-size: 1rem;
    color: #212121;
    font-variant-numeric: tabular-nums;
  }

  /* 「始める」ボタン（青） */
  button.main-button.start {
    background-color: #1976d2;
  }

  /* 「やめる」ボタン（赤） */
  button.main-button.stop {
    background-color: #c62828;
  }
</style>
