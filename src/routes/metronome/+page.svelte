<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onMount, onDestroy } from "svelte";

  // 音の時計の今の時刻を返す関数と、決めた時刻にメトロノームの音を鳴らす予約をする関数を読み込む
  // （このバージョンのSvelteKitでは、src/lib フォルダを「#lib」と書いて指す）
  import { getAudioTime, scheduleClick } from "#lib/audio.js";

  // メトロノームのテンポと拍子を、読み込む関数と保存する関数を読み込む
  import { loadMetronomeTempo, saveMetronomeTempo, loadMetronomeBeats, saveMetronomeBeats } from "#lib/settings.js";

  // ===== 設定値 =====

  // テンポ（1分間の拍の数）の、一番遅い値・一番速い値・最初の値
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 208;
  const DEFAULT_TEMPO = 80;

  // テンポを変えるボタンの一覧
  //   difference：今のテンポに足す数、label：ボタンに表示する文字、description：読み上げ用の説明
  const TEMPO_BUTTONS_DOWN = [
    { difference: -10, label: "−10", description: "テンポを10下げる" },
    { difference: -1, label: "−1", description: "テンポを1下げる" },
  ];
  const TEMPO_BUTTONS_UP = [
    { difference: 1, label: "＋1", description: "テンポを1上げる" },
    { difference: 10, label: "＋10", description: "テンポを10上げる" },
  ];

  // 選べる拍子の一覧
  //   beats：1小節の拍の数（0 は「なし」。全部の拍を同じ音で鳴らす）、name：ボタンに表示する文字
  const BEATS_OPTIONS = [
    { beats: 0, name: "なし" },
    { beats: 2, name: "2" },
    { beats: 3, name: "3" },
    { beats: 4, name: "4" },
    { beats: 6, name: "6" },
  ];

  // 最初の拍子（4拍子）
  const DEFAULT_BEATS = 4;

  // 「これから鳴らす音を、予約しておくか」を調べる間隔（ミリ秒）
  const CHECK_INTERVAL_MILLISECONDS = 25;

  // 何秒先の音までを、先に予約しておくか（秒）
  // 音は、ブラウザの「音の時計」で時刻を決めて予約すると、正確な間隔で鳴る。
  // （その場で1つずつ鳴らすと、ブラウザがほかの作業をしているときに、間隔が乱れてしまう）
  const SCHEDULE_AHEAD_SECONDS = 0.1;

  // 「スタート」を押してから、最初の音が鳴るまでの時間（秒）
  const START_DELAY_SECONDS = 0.1;

  // 拍の印を、明るく光らせておく時間（ミリ秒）
  const LIGHT_MILLISECONDS = 120;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // メトロノームが動いているかどうか（true：動作中、false：停止中）
  let isRunning = $state(false);

  // テンポ（1分間の拍の数）
  let tempo = $state(DEFAULT_TEMPO);

  // 拍子（1小節の拍の数。0 は「なし」）
  let beats = $state(DEFAULT_BEATS);

  // 今鳴っている拍の番号（0 が1拍目）。止まっているときは null
  let currentBeat = $state(null);

  // 拍の印を、今明るく光らせているかどうか（音が鳴った瞬間だけ true になる）
  let isLit = $state(false);

  // 画面に並べる拍の印の数（拍子が「なし」のときは、印を1つだけ出す）
  // $derived を付けると、beats が変わるたびに自動で計算し直される
  let dotCount = $derived(beats === 0 ? 1 : beats);

  // ===== 動かすために覚えておく値（画面には表示しないので $state は付けない） =====

  // 「予約しておくかを調べる」くり返しの番号（止めるときに使う）
  let checkTimerId = null;

  // 次に鳴らす音の時刻（音の時計での秒数）
  let nextClickTime = 0;

  // 次に鳴らす音が、何拍目か（0 が1拍目）
  let nextBeat = 0;

  // 「音が鳴る時刻に、画面の印を光らせる」予約の番号の一覧（止めるときに、まとめて取り消す）
  let displayTimerIds = [];

  // このページが画面に表示された直後に、保存しておいたテンポと拍子を読み込む
  onMount(() => {
    tempo = loadMetronomeTempo(TEMPO_MIN, TEMPO_MAX, DEFAULT_TEMPO);

    // 保存してあった拍子が、選べる一覧の中にあるときだけ使う
    const savedBeats = loadMetronomeBeats();
    if (BEATS_OPTIONS.some((option) => option.beats === savedBeats)) {
      beats = savedBeats;
    }
  });

  // このページが画面から消えるときに、メトロノームを止める
  onDestroy(() => {
    stop();
  });

  /**
   * メトロノームを動かしはじめる関数
   * 「スタート」ボタンを押したときに呼ばれる。
   */
  function start() {
    // 最初の音は、今から少しだけあとに鳴らす。1拍目から始める
    nextClickTime = getAudioTime() + START_DELAY_SECONDS;
    nextBeat = 0;
    isRunning = true;

    // すぐに1回調べて、そのあとは決まった間隔でくり返し調べる
    scheduleClicks();
    checkTimerId = setInterval(scheduleClicks, CHECK_INTERVAL_MILLISECONDS);
  }

  /**
   * これから鳴らす音を、少し先の分まで予約する関数
   * 動いている間、決まった間隔でくり返し呼ばれる。
   * 「今から SCHEDULE_AHEAD_SECONDS 秒先まで」に入る音を、まだ予約していなければ予約する。
   */
  function scheduleClicks() {
    // 音の時計の、今の時刻
    const now = getAudioTime();

    // 次の音の時刻が、もう過ぎてしまっているとき（ほかのタブを見ていて、調べるのが遅れたときなど）は、
    // 遅れた分をまとめて鳴らさないように、今から鳴らし直す
    if (nextClickTime < now) {
      nextClickTime = now + START_DELAY_SECONDS;
    }

    // 予約する範囲に入っている音を、順に予約する
    while (nextClickTime < now + SCHEDULE_AHEAD_SECONDS) {
      // 拍子が「なし」ではなく、1拍目のときは、高い音（アクセント）にする
      const isAccent = beats > 0 && nextBeat === 0;

      // 音を予約する
      scheduleClick(nextClickTime, isAccent);

      // 音が鳴る時刻に、画面の印を光らせる予約をする
      showBeatLater(nextBeat, nextClickTime - now);

      // 次の拍に進む（小節の最後まで来たら、1拍目に戻る。「なし」のときは、ずっと 0 のまま）
      nextBeat = beats > 0 ? (nextBeat + 1) % beats : 0;

      // 次の音の時刻（1拍の長さは、60秒 ÷ テンポ）
      // ここで今のテンポを使うので、動いている途中でテンポを変えても、次の拍から反映される
      nextClickTime = nextClickTime + 60 / tempo;
    }
  }

  /**
   * 決めた時間がたったら、画面の拍の印を光らせる関数
   * @param {number} beat - 何拍目か（0 が1拍目）
   * @param {number} delaySeconds - 今から何秒後に光らせるか
   */
  function showBeatLater(beat, delaySeconds) {
    const timerId = setTimeout(() => {
      // 今の拍を覚えて、印を明るく光らせる
      currentBeat = beat;
      isLit = true;

      // 少したったら、明るい光を消す（今の拍の印の色は残る）
      const lightTimerId = setTimeout(() => {
        isLit = false;
      }, LIGHT_MILLISECONDS);
      displayTimerIds.push(lightTimerId);
    }, delaySeconds * 1000);

    displayTimerIds.push(timerId);

    // 予約の番号がたまりすぎないように、古いものは一覧から捨てる（もう実行が終わっているため）
    if (displayTimerIds.length > 40) {
      displayTimerIds = displayTimerIds.slice(-20);
    }
  }

  /**
   * メトロノームを止める関数
   * 「ストップ」ボタンを押したとき、ページを離れるときに呼ばれる。
   */
  function stop() {
    // 「予約しておくかを調べる」くり返しを止める
    if (checkTimerId !== null) {
      clearInterval(checkTimerId);
      checkTimerId = null;
    }

    // 画面の印を光らせる予約を、まとめて取り消す
    displayTimerIds.forEach((timerId) => clearTimeout(timerId));
    displayTimerIds = [];

    // 表示を初期状態に戻す
    currentBeat = null;
    isLit = false;
    isRunning = false;
  }

  /**
   * テンポを変える関数
   * テンポのボタンを押したときに呼ばれる。範囲からはみ出すときは、端の値にする。
   * @param {number} difference - 今のテンポに足す数（例：−10、−1、1、10）
   */
  function changeTempo(difference) {
    tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo + difference));

    // ブラウザに保存する（次に開いたときも、同じテンポになる）
    saveMetronomeTempo(tempo);
  }

  /**
   * 拍子を変える関数
   * 拍子のボタンを押したときに呼ばれる。動いている途中なら、次の音を1拍目にする。
   * @param {number} newBeats - 1小節の拍の数（0 は「なし」）
   */
  function selectBeats(newBeats) {
    beats = newBeats;
    nextBeat = 0;

    // 前の拍子での「今の拍」の表示は、いったん消す
    currentBeat = null;

    // ブラウザに保存する
    saveMetronomeBeats(beats);
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブと、検索結果の見出しに出る -->
  <title>メトロノーム｜ビオラ音程チェック</title>

  <!-- description：検索結果で、見出しの下に出る説明文 -->
  <meta
    name="description"
    content="ブラウザで使える、シンプルなメトロノームです。テンポは 40〜208、拍子は 2・3・4・6 拍子から選べ、1拍目を高い音で知らせます。インストール不要で、スマホでも使えます。"
  />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>メトロノーム</h1>
  </div>

  <!-- 拍の印：拍子の数だけ丸を並べる。今の拍の丸に色を付け、音が鳴った瞬間は明るく光らせる -->
  <!-- aria-hidden は、読み上げで操作する人に、この飾りを読み上げないようにする設定 -->
  <div class="dots" aria-hidden="true">
    {#each { length: dotCount } as _, index (index)}
      <!-- current：今の拍、accent：1拍目（拍子が「なし」のときは付けない）、lit：音が鳴った瞬間 -->
      <span class="dot" class:current={currentBeat === index} class:accent={beats > 0 && index === 0} class:lit={currentBeat === index && isLit}></span>
    {/each}
  </div>

  <!-- テンポ：下げるボタン、今のテンポ、上げるボタンを横に並べる -->
  <div class="tempo-row">
    {#each TEMPO_BUTTONS_DOWN as button (button.difference)}
      <!-- disabled を付けると、ボタンが押せなくなる（一番遅いテンポまで来たとき） -->
      <button class="tempo-button" aria-label={button.description} disabled={tempo <= TEMPO_MIN} onclick={() => changeTempo(button.difference)}>{button.label}</button>
    {/each}

    <!-- 今のテンポ（♩=80 は、「4分音符が1分間に80回」という意味） -->
    <span class="tempo-value">♩={tempo}</span>

    {#each TEMPO_BUTTONS_UP as button (button.difference)}
      <button class="tempo-button" aria-label={button.description} disabled={tempo >= TEMPO_MAX} onclick={() => changeTempo(button.difference)}>{button.label}</button>
    {/each}
  </div>

  <!-- 拍子：見出しと、選ぶボタンを横に並べる -->
  <div class="beats-row">
    <span class="beats-label">拍子</span>
    {#each BEATS_OPTIONS as option (option.beats)}
      <!-- 選択中のボタンに selected クラスを付けて色を変える -->
      <button class="choice" class:selected={beats === option.beats} onclick={() => selectBeats(option.beats)}>{option.name}</button>
    {/each}
  </div>

  <!-- 動作中は「ストップ」ボタン、停止中は「スタート」ボタンを表示する -->
  {#if isRunning}
    <button class="main-button stop" onclick={stop}>■ ストップ</button>
  {:else}
    <button class="main-button start" onclick={start}>▶ スタート</button>
  {/if}

  <p class="note">
    テンポは {TEMPO_MIN}〜{TEMPO_MAX} の範囲で選べます。動かしている途中でも変えられます。<br />
    拍子を選ぶと、1拍目だけ高い音になります。「なし」は、全部の拍が同じ音です。<br />
    テンポと拍子は、このブラウザに保存されます。<br />
    音が聞こえないときは、スマホの音量を確認してください。<br />
    iPhone で音が出ないときは、消音モードを解除してから、ページを開き直してください。
  </p>
</main>

<style>
  /* 画面全体：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    padding: 12px 16px 24px 16px;
    font-family: sans-serif;
  }

  /* 画面の上の行：リンクとタイトルを横に並べる */
  .header-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 12px;
  }

  /* ホームへ戻るリンク */
  .back-link {
    flex-shrink: 0;
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 拍の印を横に並べて、中央に寄せる */
  .dots {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin: 28px 0;
  }

  /* 拍の印（ふだん）：グレーの丸 */
  .dot {
    /* ふだんの幅は 56px。丸の数が多くて入りきらないときは、同じ割合で縮む */
    flex: 0 1 56px;
    /* 高さを幅と同じにして、縮んでも丸のままにする */
    aspect-ratio: 1 / 1;
    background-color: #e0e0e0;
    border-radius: 50%;
    /* 色と大きさが変わるとき、短い時間でなめらかに変える */
    transition:
      background-color 0.05s linear,
      transform 0.05s linear;
  }

  /* 1拍目の印（ふだん）：オレンジの枠を付けて、1拍目だと分かるようにする */
  .dot.accent {
    /* 枠の太さを、幅と高さの中に含める（丸の大きさが変わらないようにする） */
    box-sizing: border-box;
    border: 4px solid #ef6c00;
  }

  /* 今の拍の印：青で塗る */
  .dot.current {
    background-color: #90caf9;
  }

  /* 今の拍が1拍目のとき：薄いオレンジで塗る */
  .dot.accent.current {
    background-color: #ffcc80;
  }

  /* 音が鳴った瞬間の印：濃い色にして、少し大きくする */
  .dot.lit {
    background-color: #1976d2;
    transform: scale(1.25);
  }

  /* 音が鳴った瞬間の、1拍目の印：濃いオレンジにする */
  .dot.accent.lit {
    background-color: #ef6c00;
  }

  /* テンポ：ボタンと今のテンポを横に並べて、中央に寄せる */
  .tempo-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  /* テンポを変えるボタン：白地に青い枠。指で押しやすい大きさにする */
  button.tempo-button {
    /* ふだんの幅は 48px。画面がせまいときは、40px まで縮んでよい */
    flex: 0 1 48px;
    min-width: 40px;
    height: 46px;
    padding: 0;
    font-size: 0.95rem;
    font-weight: bold;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* テンポを変えるボタン（押せないとき）：グレーにする */
  button.tempo-button:disabled {
    color: #bdbdbd;
    border-color: #bdbdbd;
    cursor: default;
  }

  /* 今のテンポ：大きく表示する */
  .tempo-value {
    /* 値が変わっても、ボタンの位置が動かないように、幅を決めておく（画面がせまいときは、少し縮んでよい） */
    flex: 0 1 4.2em;
    min-width: 3.4em;
    font-size: 1.6rem;
    font-weight: bold;
    text-align: center;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 拍子：見出しとボタンを横に並べる */
  .beats-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 20px;
  }

  /* 「拍子」の見出し */
  .beats-label {
    flex-shrink: 0;
    margin-right: 4px;
    font-size: 0.9rem;
    color: #616161;
  }

  /* 拍子を選ぶボタン（選択前）：白地に青い枠。5つのボタンで、残りの横幅を同じ割合で分け合う */
  button.choice {
    flex: 1;
    /* 文字の種類（ひらがな・数字）でボタンの高さが変わらないように、高さを決めておく */
    height: 44px;
    padding: 0;
    font-size: 1rem;
    font-weight: bold;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 拍子を選ぶボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 「スタート」「ストップ」のボタン共通：指で押しやすい大きさにする */
  button.main-button {
    width: 100%;
    margin-top: 24px;
    padding: 16px;
    font-size: 1.2rem;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  /* スタートボタン（緑） */
  button.main-button.start {
    background-color: #2e7d32;
  }

  /* ストップボタン（赤） */
  button.main-button.stop {
    background-color: #c62828;
  }

  /* 注意書き：小さくグレーで表示する */
  .note {
    margin: 16px 0 0 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: #757575;
  }
</style>
