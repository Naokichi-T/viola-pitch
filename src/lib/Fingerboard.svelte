<script>
  // 指板の図を描く部品
  // 選んだ調の音階の音が、選んだポジションのどこにあるかを、丸い印で表示する。
  // 音階にない場所は、小さな薄い点で表示する。
  // 弾く人から見た向き（ナットが上、駒が下）で、左から C線・G線・D線・A線 の順に並べる。
  // 印はタップできる。タップされたら、どの印かを使う側に伝える（音を鳴らすのは、使う側の役目）。

  // 弦の一覧、ポジションごとの範囲を求める関数、印を付ける場所を調べる関数、印の id を作る関数を読み込む
  import { STRINGS, getPositionRange, getFingerboardMarkers, getMarkerId } from "#lib/fingerboard.js";

  // この部品を使う側から受け取る値
  // key       ：調のデータ
  // position  ：ポジションの番号（1〜7）
  // labelMode ：印の中に書くもの（"name"：音名、"finger"：指番号）
  // selectedId：選択中の印の id（getMarkerId で作る文字）。選択していないときは null
  // heldIds   ：指で押さえている印の id の一覧（重音のとき、いくつも入る）。押さえていないときは空の一覧
  // onselect  ：印がマウスでクリックされたとき（またはキーボードで選ばれたとき）に呼ぶ関数。その印のデータを渡す
  // onpress   ：印が指で押されたとき（スマホなど）に呼ぶ関数。その印のデータと、押した指の番号を渡す
  // onrelease ：印を押していた指が離れたときに呼ぶ関数。離れた指の番号を渡す
  // selectedId・heldIds・onselect・onpress・onrelease は、渡されなかったときのための初期値を決めておく
  let { key, position, labelMode, selectedId = null, heldIds = [], onselect = () => {}, onpress = () => {}, onrelease = () => {} } = $props();

  // 指が離れたあと、この時間（ミリ秒）のあいだに届いたクリックは無視する
  // （スマホでは、指を離した直後に、ブラウザが「クリックされた」という知らせも送ってくるため。
  //   無視しないと、指を離したときに、もう一度音が鳴ってしまう）
  const IGNORE_CLICK_MILLISECONDS = 500;

  // 今、印を押している指の番号の一覧（ブラウザが指1本ごとに付ける番号）
  // 2本以上の指で同時に押すことがあるので、全部の指を覚えておく
  // Set は、同じものを2回入れない「入れ物」。add で入れ、has で入っているか調べ、delete で取り出す
  const pressingPointerIds = new Set();

  // 最後に指が離れた時刻（ミリ秒）。まだ一度も離れていないときは、とても昔の時刻にしておく
  let lastReleaseTime = -Infinity;

  // ===== 図の大きさと位置の設定値（単位は、SVGの中の座標） =====

  // 図の全体の横幅
  const WIDTH = 300;

  // 一番左の弦（C線）の横の位置と、弦と弦の間隔
  const FIRST_STRING_X = 45;
  const STRING_SPACING = 70;

  // 弦の名前（C・G・D・A）を書く縦の位置
  const STRING_NAME_Y = 14;

  // 開放弦の印を置く縦の位置（ナットより上）
  const OPEN_Y = 40;

  // ナット（弦の付け根にある、弦を支える部品）の縦の位置
  const NUT_Y = 64;

  // 半音1つ分の、縦の間隔
  const SEMITONE_SPACING = 44;

  // 印の丸の半径
  const MARKER_RADIUS = 18;

  // 音階にない場所に表示する、小さな点の半径
  const DOT_RADIUS = 6;

  // 指板の板の、左の端と右の端の横の位置
  const BOARD_LEFT = FIRST_STRING_X - 30;
  const BOARD_RIGHT = FIRST_STRING_X + STRING_SPACING * 3 + 30;

  // 第2ポジションより上のとき、ナットと最初の行の間に入れる「途中を省略した印（ギザギザの切れ目）」のための高さ
  const CUT_SPACE = 34;

  // 切れ目の、上の端と下の端の縦の位置（ナットからの距離）と、ギザギザの山の高さ・幅
  const CUT_TOP = 12;
  const CUT_BOTTOM = 26;
  const CUT_ZIGZAG_HEIGHT = 4;
  const CUT_ZIGZAG_WIDTH = 15;

  // このポジションで表示する範囲（開放弦から半音いくつ分上か）
  // $derived を付けると、ポジション（position）が変わるたびに、自動で求め直される
  let range = $derived(getPositionRange(position));

  // ナットのすぐ下から表示するかどうか（第1ポジションだけ true）
  // false のときは、途中を省略して、切れ目を入れる
  let startsAtNut = $derived(range.low <= 1);

  // 一番上の行（範囲の下の端）の、縦の位置
  // 第1ポジションは、ナットから半音1つ分下。それ以外は、切れ目の分だけ下にずらす
  let firstRowY = $derived(startsAtNut ? NUT_Y + SEMITONE_SPACING : NUT_Y + CUT_SPACE + MARKER_RADIUS + 8);

  // 図の全体の高さ（一番下の印が切れないように、下に余白を足す）
  let height = $derived(firstRowY + (range.high - range.low) * SEMITONE_SPACING + MARKER_RADIUS + 10);

  // 切れ目のギザギザの形（多角形の頂点の並び）。板の左の端から右の端まで、山と谷をくり返す
  const cutPoints = createCutPoints();

  // 弦の太さ（左の C線が一番太く、右の A線が一番細い）
  // （ビオラの弦はバイオリンより太いので、少し太めにした）
  const STRING_WIDTHS = [3.6, 3, 2.4, 1.8];

  // 印を付ける場所の一覧
  // $derived を付けると、調（key）かポジション（position）が変わるたびに、自動で調べ直される
  let markers = $derived(getFingerboardMarkers(key, position));

  /**
   * 切れ目のギザギザの形を作る関数
   * 上の辺を左から右へギザギザに進み、下の辺を右から左へギザギザに戻る、多角形の頂点の並びを作る。
   * @returns {string} SVG の polygon に渡す、頂点の並び（例："15,74 30,78 …"）
   */
  function createCutPoints() {
    const topPoints = [];
    const bottomPoints = [];

    // 板の左の端から右の端まで、決まった幅ごとに頂点を置く。1つおきに、山と谷を入れ替える
    let index = 0;
    for (let x = BOARD_LEFT; x <= BOARD_RIGHT; x += CUT_ZIGZAG_WIDTH) {
      // 偶数番目は上に、奇数番目は下にずらす
      const offset = index % 2 === 0 ? -CUT_ZIGZAG_HEIGHT : CUT_ZIGZAG_HEIGHT;
      topPoints.push(x + "," + (NUT_Y + CUT_TOP + offset));
      bottomPoints.push(x + "," + (NUT_Y + CUT_BOTTOM + offset));
      index += 1;
    }

    // 上の辺（左から右）のあとに、下の辺（右から左）をつなげる
    return [...topPoints, ...bottomPoints.reverse()].join(" ");
  }

  /**
   * 印が押されはじめたときの処理をする関数
   * 指で押されたとき（スマホなど）だけ、押されたことを使う側に伝える。
   * マウスのときは何もしない（マウスは、クリックされたときに handleClick で処理する）。
   * @param {PointerEvent} event - 押されたときの情報
   * @param {object} marker - その印のデータ
   */
  function handlePointerDown(event, marker) {
    // event.pointerType は、何で押されたか（"touch"：指、"mouse"：マウス、"pen"：ペン）
    if (event.pointerType !== "touch") {
      return;
    }

    // どの指で押しているかを覚えて、押されたことを伝える
    pressingPointerIds.add(event.pointerId);
    onpress(marker, event.pointerId);
  }

  /**
   * 印を押していた指が離れたとき（または、スクロールなどで押すのが取り消されたとき）の処理をする関数
   * 押していた指のときだけ、離れたことを使う側に伝える。
   * @param {PointerEvent} event - 離れたときの情報
   */
  function handlePointerEnd(event) {
    // 印を押していた指でないときは、何もしない
    if (!pressingPointerIds.has(event.pointerId)) {
      return;
    }

    // その指を「押していない」状態に戻して、離れた時刻を覚えておく
    pressingPointerIds.delete(event.pointerId);
    lastReleaseTime = performance.now();

    onrelease(event.pointerId);
  }

  /**
   * 印がクリックされたときの処理をする関数
   * マウスでクリックされたときに、選ばれたことを使う側に伝える。
   * 指を離した直後に届くクリックは、すでに handlePointerDown で処理しているので、無視する。
   * @param {object} marker - その印のデータ
   */
  function handleClick(marker) {
    // 指が離れた直後のクリックは無視する
    if (performance.now() - lastReleaseTime < IGNORE_CLICK_MILLISECONDS) {
      return;
    }

    onselect(marker);
  }

  /**
   * 印の上でキーが押されたときの処理をする関数
   * キーボードで操作する人のために、Enter キーかスペースキーでも印を選べるようにする。
   * @param {KeyboardEvent} event - キーが押されたときの情報
   * @param {object} marker - その印のデータ
   */
  function handleKeydown(event, marker) {
    if (event.key === "Enter" || event.key === " ") {
      // スペースキーで画面がスクロールしてしまうのを防ぐ
      event.preventDefault();

      // タップされたときと同じように、選ばれたことを伝える
      onselect(marker);
    }
  }

  /**
   * 弦の横の位置を求める関数
   * @param {number} stringIndex - 何番目の弦か（0 が C線、3 が A線）
   * @returns {number} 横の位置
   */
  function getStringX(stringIndex) {
    return FIRST_STRING_X + stringIndex * STRING_SPACING;
  }

  /**
   * 印の縦の位置を求める関数
   * @param {number} semitones - 開放弦から半音いくつ分上か（0 は開放弦）
   * @returns {number} 縦の位置
   */
  function getMarkerY(semitones) {
    // 開放弦の印は、ナットより上に置く
    if (semitones === 0) {
      return OPEN_Y;
    }

    // 押さえる音の印は、一番上の行から、範囲の下の端より半音いくつ分上かの数だけ下に置く
    return firstRowY + (semitones - range.low) * SEMITONE_SPACING;
  }
</script>

<!-- viewBox で「中の座標の範囲」を決めておくと、画面の幅に合わせて全体が拡大・縮小される -->
<!-- role と aria-label は、読み上げで操作する人のための、図の説明（group は「いくつかの部品のまとまり」という意味） -->
<svg class="fingerboard" viewBox="0 0 {WIDTH} {height}" role="group" aria-label="指板の図">
  <!-- 指板の板：ナットから下を、黒っぽい色で塗る -->
  <rect class="board" x={BOARD_LEFT} y={NUT_Y} width={BOARD_RIGHT - BOARD_LEFT} height={height - NUT_Y} rx="4" />

  <!-- 弦：4本を、上から下まで引く -->
  {#each STRINGS as string, stringIndex (string.id)}
    <!-- 弦の名前 -->
    <text class="string-name" x={getStringX(stringIndex)} y={STRING_NAME_Y} text-anchor="middle">{string.id}</text>

    <!-- 弦そのもの（太さは弦ごとに変える） -->
    <line class="string" x1={getStringX(stringIndex)} y1={NUT_Y} x2={getStringX(stringIndex)} y2={height} stroke-width={STRING_WIDTHS[stringIndex]} />
  {/each}

  <!-- ナット：指板の上の端の、太い横線 -->
  <line class="nut" x1={BOARD_LEFT} y1={NUT_Y} x2={BOARD_RIGHT} y2={NUT_Y} />

  <!-- 切れ目：第2ポジションより上のとき、ナットと最初の行の間を省略していることを、ギザギザの白い帯で表す -->
  <!-- 板と弦の上に重ねて描くので、板と弦が途中で切れているように見える -->
  {#if !startsAtNut}
    <polygon class="cut" points={cutPoints} />
  {/if}

  <!-- 印：押せる場所の全部に描く。音階の音は丸と文字、音階にない場所は小さな点にする -->
  {#each markers as marker (getMarkerId(marker))}
    <!-- g は、複数の図形をまとめるための入れ物。transform の translate で、印の中心を弦の上の場所に移動する -->
    <!-- 開放弦には open、主音には tonic、音階にない場所には outside、選択中の印には selected のクラスを付けて、見た目を変える -->
    <!-- role・tabindex・aria-label・onkeydown は、キーボードや読み上げで操作する人のための設定 -->
    <g
      class="marker"
      class:open={marker.semitones === 0}
      class:tonic={marker.isTonic}
      class:outside={!marker.inScale}
      class:selected={getMarkerId(marker) === selectedId || heldIds.includes(getMarkerId(marker))}
      transform="translate({getStringX(marker.stringIndex)} {getMarkerY(marker.semitones)})"
      role="button"
      tabindex="0"
      aria-label="{STRINGS[marker.stringIndex].id}線の{marker.name}"
      onpointerdown={(event) => handlePointerDown(event, marker)}
      onpointerup={handlePointerEnd}
      onpointercancel={handlePointerEnd}
      oncontextmenu={(event) => event.preventDefault()}
      onclick={() => handleClick(marker)}
      onkeydown={(event) => handleKeydown(event, marker)}
    >
      {#if marker.inScale}
        <!-- 音階の音：大きな丸と、その中の文字 -->
        <circle class="disc" r={MARKER_RADIUS} />

        <!-- 印の中の文字：音名か指番号（文字が長い音名は、小さい字にする） -->
        <!-- dominant-baseline="central" を付けると、文字の縦の中心が、丸の中心に合う -->
        {#if labelMode === "finger"}
          <text class="label finger" text-anchor="middle" dominant-baseline="central">{marker.finger}</text>
        {:else}
          <text class="label" class:long={marker.name.length >= 3} text-anchor="middle" dominant-baseline="central">{marker.name}</text>
        {/if}
      {:else}
        <!-- 音階にない場所：見た目は小さな点だが、押しやすいように、透明な大きい丸を重ねておく -->
        <circle class="hit-area" r={MARKER_RADIUS} />
        <circle class="dot" r={DOT_RADIUS} />
      {/if}
    </g>
  {/each}
</svg>

<style>
  /* 指板の図：横幅いっぱいに表示する（高さは横幅に合わせて自動で決まる）。大きくなりすぎないように、幅の上限を決める */
  .fingerboard {
    display: block;
    width: 100%;
    max-width: 360px;
    height: auto;
    margin: 0 auto;
    font-family: sans-serif;
    /* 文字を選択できないようにする（図をタップしたときに、文字が選ばれてしまうのを防ぐ） */
    user-select: none;
    -webkit-user-select: none;
    /* 指で長押ししたときに、ブラウザのメニュー（コピーなど）が出ないようにする（iPhone 用） */
    -webkit-touch-callout: none;
    /* 図の上で指を動かしたとき、ブラウザに任せるのは「縦のスクロール」だけにする */
    /* （こうしておくと、押している指が少し横にずれても、音が止まらない） */
    /* 2本指の拡大・縮小もできないようにする（重音を鳴らすために2本指で押したとき、画面が拡大されないようにするため） */
    touch-action: pan-y;
  }

  /* 指板の板：黒檀（こくたん）のような、黒っぽい茶色 */
  .board {
    fill: #3e2723;
  }

  /* 弦：明るいグレー */
  .string {
    stroke: #cfd8dc;
  }

  /* ナット：クリーム色の太い線 */
  .nut {
    stroke: #f5e6c8;
    stroke-width: 6;
  }

  /* 切れ目（途中を省略していることを表す、ギザギザの帯）：背景と同じ白で塗る */
  .cut {
    fill: #ffffff;
  }

  /* 弦の名前（G・D・A・E） */
  .string-name {
    font-size: 13px;
    font-weight: bold;
    fill: #616161;
  }

  /* 印1つぶんのまとまり：押せることが分かるように、マウスの形を指にする */
  .marker {
    cursor: pointer;
    /* タップしたときにブラウザが付ける枠や色を消す（選択中の表示は自分で付けるため） */
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }

  /* 印の丸（ふつうの音）：青 */
  .disc {
    fill: #1976d2;
    stroke: #ffffff;
    stroke-width: 1.5;
  }

  /* 音階にない場所の、押せる範囲：透明な丸 */
  /* fill を none にすると押しても反応しなくなるので、「透明な色で塗る」指定にしている */
  .hit-area {
    fill: transparent;
  }

  /* 音階にない場所の、小さな点：薄いグレー */
  .dot {
    fill: #9e9e9e;
  }

  /* 開放弦で、音階にない場所の点：板の外（白い背景の上）にあるので、少し濃くして見えるようにする */
  .marker.open .dot {
    fill: #bdbdbd;
  }

  /* 印の中の文字：白 */
  .label {
    font-size: 13px;
    font-weight: bold;
    fill: #ffffff;
  }

  /* 文字が長い音名（「ファ♯」など）：丸からはみ出さないように、小さい字にする */
  .label.long {
    font-size: 10.5px;
  }

  /* 指番号：大きめの字にする */
  .label.finger {
    font-size: 17px;
  }

  /* 主音（音階の最初の音）の印：オレンジ */
  .marker.tonic .disc {
    fill: #ef6c00;
  }

  /* 開放弦の印：白地に青い枠・青い文字にして、押さえる音と区別する */
  .marker.open .disc {
    fill: #ffffff;
    stroke: #1976d2;
    stroke-width: 2.5;
  }

  .marker.open .label {
    fill: #1976d2;
  }

  /* 開放弦が主音のとき：白地にオレンジの枠・オレンジの文字にする */
  .marker.open.tonic .disc {
    stroke: #ef6c00;
  }

  .marker.open.tonic .label {
    fill: #ef6c00;
  }

  /* 選択中の印（最後にタップした印）：黄色い太い枠を付けて目立たせる */
  /* ほかのスタイルより後に書いているので、開放弦や主音の枠の色より、こちらが優先される */
  .marker.selected .disc {
    stroke: #ffeb3b;
    stroke-width: 4;
  }

  /* 選択中の、音階にない場所の点：黄色く塗って、少し太い枠を付ける */
  .marker.selected .dot {
    fill: #ffeb3b;
    stroke: #f9a825;
    stroke-width: 2;
  }

  /* キーボードで印に移動したとき：どの印にいるか分かるように、水色の太い枠を付ける */
  .marker:focus-visible .disc,
  .marker:focus-visible .dot {
    stroke: #4fc3f7;
    stroke-width: 4;
  }
</style>
