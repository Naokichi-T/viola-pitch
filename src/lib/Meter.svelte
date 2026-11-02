<script>
  // ===== メーターを描くための設定値 =====
  // 単位はすべて、SVGの中での長さ（画面の幅に合わせて全体が拡大・縮小される）

  // メーター全体の横幅と高さ
  const WIDTH = 300;
  const HEIGHT = 50;

  // 目盛りの帯（グレーの部分）の上端の位置と、高さ
  const TRACK_Y = 18;
  const TRACK_HEIGHT = 22;

  // 針の太さと、帯から上下にはみ出す長さ
  const NEEDLE_WIDTH = 5;
  const NEEDLE_OVERHANG = 5;

  // メーターの中央の横の位置（ズレが 0 のときの針の位置）
  const CENTER_X = WIDTH / 2;

  // この部品を使う側から受け取る値
  // cents     ：目標の音からのズレ（セント）。プラスは高い、マイナスは低い。音が出ていないときは null
  // tolerance ：「OK」とする範囲（セント）。例：10 なら、−10〜+10 が OK
  // range     ：メーターに表示する範囲（セント）。例：50 なら、左端が −50、右端が +50
  let { cents, tolerance, range = 50 } = $props();

  /**
   * ズレ（セント）を、メーターの上での横の位置に変換する関数
   * @param {number} value - ズレ（セント）
   * @returns {number} 横の位置（左端が 0、中央が 150、右端が 300）
   */
  function centsToX(value) {
    // 中央から、「ズレ ÷ 表示する範囲」の割合だけ、左右に動かす
    return CENTER_X + (value / range) * CENTER_X;
  }

  // OK の範囲（緑の帯）の、左端の位置と横幅
  // $derived を付けると、tolerance や range が変わるたびに自動で計算し直される
  let okX = $derived(centsToX(-tolerance));
  let okWidth = $derived(centsToX(tolerance) - centsToX(-tolerance));

  // 針の横の位置（針の中心）。音が出ていないときは null
  let needleX = $derived.by(() => {
    if (cents === null) {
      return null;
    }

    // ズレが表示する範囲を超えているときは、端で止める
    const clamped = Math.min(range, Math.max(-range, cents));

    // 針がメーターの外にはみ出さないように、針の太さの半分だけ内側に収める
    const x = centsToX(clamped);
    return Math.min(WIDTH - NEEDLE_WIDTH / 2, Math.max(NEEDLE_WIDTH / 2, x));
  });

  // 針の状態（色を決めるために使う）。'ok'・'low'（低い）・'high'（高い）のどれか
  let needleState = $derived.by(() => {
    if (cents === null) {
      return "ok";
    } else if (cents < -tolerance) {
      return "low";
    } else if (cents > tolerance) {
      return "high";
    } else {
      return "ok";
    }
  });
</script>

<!-- メーター全体のSVG -->
<!-- viewBox で「中の座標の範囲」を決めておくと、画面の幅に合わせて全体が拡大・縮小される -->
<!-- aria-hidden は、読み上げで操作する人に、この図を読み上げないようにする設定 -->
<!-- （同じ内容を、メーターの下の文字で表示しているため） -->
<svg class="meter" viewBox="0 0 {WIDTH} {HEIGHT}" aria-hidden="true">
  <!-- 左右の見出し -->
  <text class="caption" x="0" y="11">低い</text>
  <text class="caption" x={WIDTH} y="11" text-anchor="end">高い</text>

  <!-- 目盛りの帯（グレー） -->
  <rect class="track" x="0" y={TRACK_Y} width={WIDTH} height={TRACK_HEIGHT} rx="4" />

  <!-- OK の範囲（緑の帯） -->
  <rect class="ok-zone" x={okX} y={TRACK_Y} width={okWidth} height={TRACK_HEIGHT} />

  <!-- 中央の線（ズレが 0 の位置） -->
  <line class="center-line" x1={CENTER_X} y1={TRACK_Y} x2={CENTER_X} y2={TRACK_Y + TRACK_HEIGHT} />

  <!-- 針（音が出ているときだけ表示する） -->
  {#if needleX !== null}
    <!-- 針の位置は、style の transform で動かす。こうすると、下の transition でなめらかに動かせる -->
    <!-- 針の状態（ok・low・high）をクラスに付けて、色を変える -->
    <rect
      class="needle {needleState}"
      x={-NEEDLE_WIDTH / 2}
      y={TRACK_Y - NEEDLE_OVERHANG}
      width={NEEDLE_WIDTH}
      height={TRACK_HEIGHT + NEEDLE_OVERHANG * 2}
      rx="2"
      style="transform: translateX({needleX}px)"
    />
  {/if}
</svg>

<style>
  /* メーター全体：横幅いっぱいに表示する（高さは横幅に合わせて自動で決まる） */
  .meter {
    display: block;
    width: 100%;
    height: auto;
  }

  /* 「低い」「高い」の見出し */
  .caption {
    font-family: sans-serif;
    font-size: 10px;
    fill: #757575;
  }

  /* 目盛りの帯（グレー） */
  .track {
    fill: #e0e0e0;
  }

  /* OK の範囲（緑の帯） */
  .ok-zone {
    fill: #a5d6a7;
  }

  /* 中央の線 */
  .center-line {
    stroke: #2e7d32;
    stroke-width: 1;
  }

  /* 針 */
  .needle {
    /* 位置が変わるとき、0.08秒かけてなめらかに動かす（カクカク動くのを防ぐ） */
    transition: transform 0.08s linear;
  }

  /* 針の色：OK は緑、低いは青、高いは赤 */
  .needle.ok {
    fill: #1b5e20;
  }

  .needle.low {
    fill: #1565c0;
  }

  .needle.high {
    fill: #c62828;
  }
</style>
