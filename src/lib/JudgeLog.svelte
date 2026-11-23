<!--
  JudgeLog.svelte
  【仮】「じっくり」で、判定が切れる原因を調べるための記録の画面（原因がわかったら消す）
  ・［判定の記録］ボタンを押した瞬間の記録を、画面全体に重ねて出す（スクショを撮るため）
  ・上：直前3秒のグラフ
      点（青）   … なめらかにする前の、その回の値のズレ
      線（黒）   … なめらかにした値（判定に使っている値）のズレ
      緑の帯     … OK の範囲
      赤い点     … 50セントより大きく外れた値（1オクターブ違いなど。グラフの上か下の端に出す）
      下の段の印 … 音が出ていない（null）と判定された時
      灰色の背景 … 判定を止めていた時（お手本の音・次へ進んだ直後の待ち時間など）
      縦線       … ゲージが0に戻った時（赤の点線）・通過した時（緑）
  ・下：直近10回の「戻る／通過」の行（新しいものが上）
  ・データは StepPractice.svelte が集めて、snapshot として渡す
-->
<script>
  // 使う側（StepPractice.svelte）から受け取る値
  // snapshot：押した瞬間の記録のコピー
  //   info      … 目標の音・調・音律・OK の範囲を1行にまとめた文字
  //   now       … 押した時刻（ミリ秒）。グラフの右の端になる
  //   duration  … グラフに出す時間の長さ（ミリ秒）
  //   tolerance … OK の範囲（セント）
  //   frames    … 毎回の値 [{ time, raw, smooth, paused }, ...]（古いものが前）
  //   events    … 「戻る／通過」が起きた時刻 [{ time, result }, ...]
  //   lines     … 「戻る／通過」の行 [{ clock, text }, ...]（新しいものが前）
  // onclose ：［閉じる］を押したときに呼ぶ関数
  let { snapshot, onclose } = $props();

  // ===== グラフの大きさ（SVG の中の座標。画面の幅に合わせて自動で縮む） =====

  // グラフ全体の幅と高さ
  const WIDTH = 360;
  const HEIGHT = 222;

  // グラフの枠の、左・右の余白（左には目盛りの数字を書く）
  const LEFT = 36;
  const RIGHT = 8;

  // ズレのグラフの、上の端と高さ
  const CHART_TOP = 10;
  const CHART_HEIGHT = 150;

  // 縦の目盛りの範囲（セント）。これより大きいズレは、端に出す
  const CENTS_RANGE = 60;

  // 大きく外れたとみなすズレ（セント）。StepPractice の METER_RANGE と同じ
  const FAR_CENTS = 50;

  // 音が出ていない（null）の印を出す段の、上の端と高さ
  const NULL_TOP = CHART_TOP + CHART_HEIGHT + 10;
  const NULL_HEIGHT = 12;

  // 時間の目盛りの数字を書く高さ
  const TIME_LABEL_Y = NULL_TOP + NULL_HEIGHT + 18;

  /**
   * 時刻（ミリ秒）を、グラフの横の位置にする関数
   * 押した瞬間（snapshot.now）が右の端、その duration 前が左の端になる。
   * @param {number} time - 時刻（ミリ秒）
   * @returns {number} 横の位置
   */
  function toX(time) {
    const start = snapshot.now - snapshot.duration;
    return LEFT + ((time - start) / snapshot.duration) * (WIDTH - LEFT - RIGHT);
  }

  /**
   * ズレ（セント）を、グラフの縦の位置にする関数
   * 範囲（±CENTS_RANGE）を超えたズレは、上か下の端にする。
   * @param {number} cents - ズレ（セント）。プラスは高い（上）、マイナスは低い（下）
   * @returns {number} 縦の位置
   */
  function toY(cents) {
    const clamped = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, cents));
    return CHART_TOP + ((CENTS_RANGE - clamped) / (CENTS_RANGE * 2)) * CHART_HEIGHT;
  }

  /**
   * なめらかにした値の線（SVG の path の d）を作る関数
   * 音が出ていない（null）ところで線を切る。
   * @returns {string} path の d（例："M 40 80 L 42 81 …"）
   */
  function buildSmoothPath() {
    let d = "";
    // 前の点から線をつなぐか（直前が null なら、新しく線を始める）
    let drawing = false;
    for (const frame of snapshot.frames) {
      if (frame.smooth === null) {
        drawing = false;
        continue;
      }
      const x = toX(frame.time).toFixed(1);
      const y = toY(frame.smooth).toFixed(1);
      d += (drawing ? " L " : " M ") + x + " " + y;
      drawing = true;
    }
    return d;
  }

  /**
   * 判定を止めていた区間（灰色の背景）の一覧を作る関数
   * 続けて止めていた回を、1つの区間にまとめる。
   * @returns {{x: number, width: number}[]} 区間の横の位置と幅
   */
  function buildPausedRanges() {
    const ranges = [];
    // 今まとめている区間の始まりの時刻（まとめていないときは null）
    let startTime = null;
    // 1つ前の回の時刻
    let lastTime = null;
    for (const frame of snapshot.frames) {
      if (frame.paused) {
        if (startTime === null) startTime = frame.time;
      } else if (startTime !== null) {
        ranges.push({ x: toX(startTime), width: toX(lastTime) - toX(startTime) });
        startTime = null;
      }
      lastTime = frame.time;
    }
    // 最後まで止めていたときは、最後の回までを区間にする
    if (startTime !== null) {
      ranges.push({ x: toX(startTime), width: toX(lastTime) - toX(startTime) });
    }
    // 幅が細すぎると見えないので、少しだけ広げる
    return ranges.map((range) => ({ x: range.x, width: Math.max(range.width, 1) }));
  }

  // グラフに出すもの（snapshot が変わったら作り直す）
  let smoothPath = $derived(buildSmoothPath());
  let pausedRanges = $derived(buildPausedRanges());

  // 数えた回数（グラフの下に出す。グラフを見なくても、ざっと分かるように）
  let nullCount = $derived(snapshot.frames.filter((frame) => frame.raw === null).length);
  let farCount = $derived(snapshot.frames.filter((frame) => frame.raw !== null && Math.abs(frame.raw) > FAR_CENTS).length);

  // 縦の目盛り（セント）
  const CENTS_TICKS = [50, 25, 0, -25, -50];

  // 横の目盛り（押した瞬間から何秒前か）
  const TIME_TICKS = [3, 2, 1, 0];
</script>

<!-- 画面全体に重ねる白い画面（スクショを撮りやすいように、ほかのものを隠す） -->
<div class="judge-log">
  <div class="head">
    <strong>判定の記録（仮）</strong>
    <button onclick={onclose}>閉じる</button>
  </div>

  <!-- 目標の音・調・音律・OK の範囲 -->
  <p class="info">{snapshot.info}</p>

  <!-- 直前3秒のグラフ -->
  <!-- viewBox で座標を決めておくと、画面の幅に合わせて全体が縮む -->
  <svg viewBox="0 0 {WIDTH} {HEIGHT}" class="graph" role="img" aria-label="直前3秒の音のズレのグラフ">
    <!-- 判定を止めていた時（灰色の背景） -->
    {#each pausedRanges as range, i (i)}
      <rect x={range.x} y={CHART_TOP} width={range.width} height={NULL_TOP + NULL_HEIGHT - CHART_TOP} fill="#e0e0e0" />
    {/each}

    <!-- OK の範囲（緑の帯） -->
    <rect x={LEFT} y={toY(snapshot.tolerance)} width={WIDTH - LEFT - RIGHT} height={toY(-snapshot.tolerance) - toY(snapshot.tolerance)} fill="#c8e6c9" opacity="0.7" />

    <!-- 縦の目盛りの線と数字 -->
    {#each CENTS_TICKS as tickCents (tickCents)}
      <line x1={LEFT} x2={WIDTH - RIGHT} y1={toY(tickCents)} y2={toY(tickCents)} stroke={tickCents === 0 ? "#888" : "#ddd"} stroke-width="1" />
      <text x={LEFT - 4} y={toY(tickCents) + 4} text-anchor="end" class="label">{tickCents > 0 ? "+" + tickCents : tickCents}</text>
    {/each}

    <!-- 音が出ていない（null）の段の名前 -->
    <text x={LEFT - 4} y={NULL_TOP + NULL_HEIGHT - 2} text-anchor="end" class="label">null</text>
    <line x1={LEFT} x2={WIDTH - RIGHT} y1={NULL_TOP + NULL_HEIGHT} y2={NULL_TOP + NULL_HEIGHT} stroke="#ddd" stroke-width="1" />

    <!-- ゲージが0に戻った時（赤の点線）・通過した時（緑）の縦線 -->
    {#each snapshot.events as event, i (i)}
      <line
        x1={toX(event.time)}
        x2={toX(event.time)}
        y1={CHART_TOP}
        y2={NULL_TOP + NULL_HEIGHT}
        stroke={event.result === "通過" ? "#2e7d32" : "#d32f2f"}
        stroke-width="1.5"
        stroke-dasharray={event.result === "通過" ? "" : "4 3"}
      />
    {/each}

    <!-- 毎回の値：生の値の点（青）、大きく外れた値（赤）、音が出ていない印（灰色） -->
    {#each snapshot.frames as frame, i (i)}
      {#if frame.raw === null}
        <rect x={toX(frame.time) - 0.75} y={NULL_TOP} width="1.5" height={NULL_HEIGHT} fill="#757575" />
      {:else if Math.abs(frame.raw) > FAR_CENTS}
        <circle cx={toX(frame.time)} cy={toY(frame.raw)} r="2.5" fill="#d32f2f" />
      {:else}
        <circle cx={toX(frame.time)} cy={toY(frame.raw)} r="1.5" fill="#1976d2" opacity="0.6" />
      {/if}
    {/each}

    <!-- なめらかにした値（判定に使っている値）の線 -->
    <path d={smoothPath} fill="none" stroke="#222" stroke-width="1.5" />

    <!-- 横の目盛り（何秒前か）。右の端の「押した時」は、はみ出さないように右寄せにする -->
    {#each TIME_TICKS as seconds (seconds)}
      <text x={toX(snapshot.now - seconds * 1000)} y={TIME_LABEL_Y} text-anchor={seconds === 0 ? "end" : "middle"} class="label">{seconds === 0 ? "押した時" : "-" + seconds + "秒"}</text>
    {/each}
  </svg>

  <!-- グラフの読み方と、数えた回数 -->
  <p class="legend">
    点＝その回の値／線＝判定に使う値／緑＝OK／赤い点＝50セント超え（{farCount}回）／下の段＝null（{nullCount}回）／灰色＝判定を止めていた時／縦線＝戻る（赤）・通過（緑）
  </p>

  <!-- 直近10回の「戻る／通過」の行（新しいものが上） -->
  <h3>直近の「戻る／通過」</h3>
  {#if snapshot.lines.length === 0}
    <p class="empty">まだありません（ゲージがたまり始めると記録されます）</p>
  {:else}
    <ul>
      {#each snapshot.lines as line, i (i)}
        <li><span class="clock">{line.clock}</span> {line.text}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  /* 画面全体に重ねる。中身が長いときは、この中で縦にスクロールする */
  .judge-log {
    position: fixed;
    inset: 0;
    z-index: 1000;
    overflow-y: auto;
    padding: 12px;
    background-color: white;
    color: #222;
    box-sizing: border-box;
  }

  /* 見出しと［閉じる］ボタンの行 */
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .head button {
    padding: 8px 16px;
    font-size: 1rem;
    border-radius: 8px;
  }

  /* 目標の音などの1行 */
  .info {
    margin: 8px 0;
    font-size: 0.85rem;
  }

  /* グラフ：画面の幅いっぱいに出す */
  .graph {
    width: 100%;
    height: auto;
    display: block;
  }

  /* グラフの目盛りの数字 */
  .label {
    font-size: 9px;
    fill: #555;
  }

  /* グラフの読み方 */
  .legend {
    margin: 4px 0 12px;
    font-size: 0.75rem;
    color: #555;
  }

  h3 {
    margin: 8px 0 4px;
    font-size: 0.95rem;
  }

  /* 「戻る／通過」の行：小さめの文字で、詰めて並べる */
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: 0.75rem;
  }

  li {
    padding: 4px 0;
    border-bottom: 1px solid #eee;
    word-break: break-all;
  }

  .clock {
    color: #888;
  }

  .empty {
    font-size: 0.85rem;
    color: #888;
  }
</style>
