<script>
  // 読み込んだ楽譜の五線譜を描く部品（ステップA-2）
  // 楽譜作成アプリ（string-score）からコピーした描画の関数（musicxml/render.js の renderScore）を使って、VexFlow で描く。
  // 枠の幅に合わせて改行し、幅が変わったら（スマホを縦向き⇔横向きにしたときなど）描き直す。
  // （ステップB：音符のタップ（onselect）、目標の音への自動スクロール（focus）、高さの決まった枠（maxHeight）を足した）
  // （ステップB-2：音符の後ろに、うすい青の帯（bands）を敷けるようにした。目標の音を見つけやすくするため）
  // （ステップC-1：五線譜の上に、透明な「重ねる層」を足した（overlayBands・overlayMarks）。
  //   「通し」の演奏中は、色が変わるたびに五線譜を全部描き直すと間に合わないので、この層にだけ描く。
  //   そのため、描き直し・自動スクロール・重ねる層を、それぞれ別の $effect に分けた）
  // （ステップC-2：流れる縦線（cursorKeys・cursorTime）を足した。縦線は、もう1枚の重ねる層に描き、時刻が変わるたびに位置だけを動かす）
  // （ステップD：印を、音符の上にも出せるようにした（overlayMarks の placement: "above"）。リズムの結果に使う）
  // （ステップD-4：印を少し大きく・太くした。「通し」で、ずれた音の印だけを出すようになったので、目立つように）
  // （ステップD-3：描く小節の範囲（measureRange）を足した。練習する区間の小節だけを描くため。
  //   小節の番号は、範囲を決めても元の楽譜の番号のままなので、色・帯・印・タップの場所は、今までと同じ番号で使える）
  // （ステップE-1：自動スクロールで、段が変わるたびに、今の段を枠のいちばん上に置くようにした。次の段がいつも見えるように）
  // （ステップE-2：流れるモード（flow）を足した。楽譜を改行しない1本の帯にして（音符は時間に比例した位置）、
  //   上下に2本並べる。上の帯は「今」、下の帯は「その続き」。帯は描き直さずに、位置だけを左へずらして流す。
  //   帯の左端には、今の所の音部記号と調号の札を固定して出す。縦線は上の帯の決まった位置に止めておく）

  // onMount：この部品が画面に表示されたときに1回だけ処理をするための仕組み
  // tick：画面の書き換えが終わるのを待つための仕組み（描いたあとにスクロールするときに使う）
  // untrack：$effect の中で、値を「読むだけ（変わっても動き直さない）」にするための仕組み
  import { onMount, tick, untrack } from "svelte";

  // 楽譜データを五線譜に描く関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { renderScore } from "#lib/musicxml/render.js";

  // 流れるモードの札（音部記号・調号）を描くために、小節ごとの状態を作る関数・五線の大きさを調べる関数・
  // 音部記号の表・調を VexFlow の書き方にする関数を読み込む（ステップE-2）
  import { buildStates } from "#lib/musicxml/render/measures.js";
  import { staffMetrics } from "#lib/musicxml/render/spacing.js";
  import { CLEFS } from "#lib/musicxml/model.js";
  import { keyToVexKey } from "#lib/musicxml/render/helpers.js";

  // この部品を使う側から受け取る値
  // score       ：楽譜作成アプリの形の楽譜データ（imported.js の toRenderScore で作ったもの。パートは1つ）
  // noteColors  ：音符ごとの色の表（キーは "0-小節-番号"、値は色）。色を付けないときは省略
  // onselect    ：音符をタップしたときに呼ぶ関数。音符の場所 { measure, note } を渡す（ステップB）
  //               省略したときは、タップしても何もしない
  // focus       ：見えるようにしたい音符の場所 { measure, note }（ステップB）
  //               この音符の段が枠の外にあるときは、枠の中を自動でスクロールして見せる。省略したら何もしない
  //               （ステップC-1：focus が変わっても、五線譜は描き直さない（スクロールだけする））
  // scrollRequest：この数が増えたら、focus の音符の段を、見えていても枠のいちばん上に置き直す（「じっくり」で練習を始めたとき）
  //               （手で先の段を見ていても、練習する所に戻すため）（1画面に収める手直しの続き）。省略したら 0
  // maxHeight   ：枠の高さの上限（CSS の書き方。例："40vh"）（ステップB）
  //               これより高い楽譜は、枠の中でスクロールする。省略したら上限なし（楽譜の高さのまま）
  // bands       ：後ろに帯を敷く音符の場所の配列 [{ measure, note }, ...]（ステップB-2）
  //               手入力の楽譜の五線譜（Staff）の「選択中の青い帯」と同じ見せ方。省略したら帯は敷かない
  //               （変わると五線譜を描き直すので、「じっくり」のように、たまにしか変わらないときに使う）
  // overlayBands：重ねる層に描く帯の配列 [{ positions: [{ measure, note }, ...], color: "#e65100" }, ...]（ステップC-1）
  //               変わっても、五線譜は描き直さず、重ねる層だけを描き直す（「通し」の今の音に使う）
  // overlayMarks：重ねる層に描く、音符の下の小さな印の配列 [{ position: { measure, note }, color, text: "●" }, ...]（ステップC-1）
  //               変わっても、五線譜は描き直さない（「通し」の判定の結果に使う）
  //               （ステップD：placement: "above" を付けた印は、音符の上に出す（付けなければ、今までどおり下））
  // cursorKeys  ：流れる縦線の目じるしの並び（importedTimeline.js の cursorKeys）（ステップC-2）
  // cursorTime  ：流れる縦線を出す時刻（秒。時刻表と同じ数え方）。null のときは縦線を出さない（ステップC-2）
  //               1秒に何十回も変わるが、五線譜も重ねる層も描き直さず、縦線の位置だけを動かす
  // measureRange：描く小節の範囲 { from, to }（0 から数えた小節の番号。to も描く）（ステップD-3）
  //               省略したら（null）、全部の小節を描く
  // flow        ：true なら、流れるモードで描く（ステップE-2）
  // flowBrowsable：流れるモードで、指（マウス）で横にずらして先を見られるようにするか（演奏していないときだけ true）（ステップE-2）
  // flowScale   ：流れるモードの幅の倍率（1 なら自動で決めた幅のまま）（ステップE-2）
  // flowTime    ：流れるモードで、縦線の所に来る時刻（秒。時刻表と同じ数え方）。null なら 0 と同じ（ステップE-2）
  //               縦線を出すかどうかは、cursorTime が null かどうかで決める（流れる縦線のチェック）
  let {
    score,
    noteColors = new Map(),
    onselect = null,
    focus = null,
    scrollRequest = 0,
    maxHeight = null,
    bands = [],
    overlayBands = [],
    overlayMarks = [],
    cursorKeys = [],
    cursorTime = null,
    measureRange = null,
    flow = false,
    flowScale = 1,
    flowTime = null,
    flowBrowsable = false,
  } = $props();

  // ===== 描き方の設定値 =====

  // 楽譜の最低限の幅（ピクセル）。画面がこれより狭いときは、この幅で描いて横にスクロールする
  // （楽譜作成アプリは 600。スマホの縦向き（幅 360 くらい）でも改行して収まるように小さくする）
  const MIN_WIDTH = 280;

  // 音符のタップの当たりを、音符を囲む四角より、まわりに何ピクセル広くするか（指で押しやすくするため）（ステップB）
  const HIT_MARGIN = 8;

  // 自動スクロールで、段の上に残すすき間（ピクセル）（ステップB）
  const SCROLL_MARGIN = 8;

  // 音符の後ろに敷く帯の見た目（ステップB-2。手入力の楽譜の五線譜の「選択中の帯」と同じ色と透け具合）
  const BAND_COLOR = "#1976d2"; // 帯の色（青）
  const BAND_OPACITY = 0.25; // 透け具合（0 は完全に透明、1 はまったく透けない。五線の線が隠れないように透かす）
  const BAND_PADDING_X = 5; // 帯を、音符の左右にどれだけはみ出させるか（ピクセル）
  const BAND_PADDING_Y = 6; // 帯を、五線・音符の上下にどれだけはみ出させるか（ピクセル）

  // 五線の高さ（ピクセル）。VexFlow の五線は、線と線の間が 10 なので、5本の線で 40（ステップB-2）
  const STAFF_HEIGHT = 40;

  // 音符の下の印の見た目（ステップC-1）
  // （ステップD-4：大きさを 14 から 18 に、下の印の間を 14 から 18 にした。太さの縁取り（MARK_STROKE_WIDTH）を足した）
  const MARK_FONT_SIZE = 18; // 印の文字の大きさ（ピクセル）
  const MARK_STROKE_WIDTH = 0.8; // 印の文字の縁取りの太さ（ピクセル）。文字と同じ色で縁取って、線を太く見せる
  const MARK_GAP = 18; // 五線（または、五線より下に出た音符）の下端から、印の文字の下端までの間（ピクセル）
  const MARK_GAP_ABOVE = 6; // 五線（または、五線より上に出た音符）の上端から、上に出す印の文字の下端までの間（ピクセル）（ステップD）

  // SVG の部品を作るときに使う決まった名前（createElementNS に渡す）
  const SVG_NS = "http://www.w3.org/2000/svg";

  // 流れる縦線の見た目（ステップC-2）
  const CURSOR_COLOR = "#e65100"; // 色（「通し」の今の音と同じオレンジ）
  const CURSOR_WIDTH = 2; // 線の太さ（ピクセル）
  const CURSOR_EXTEND = 12; // 五線の上と下に、どれだけはみ出させるか（ピクセル）
  const CURSOR_END_INSET = 3; // 小節の右端の目じるしを、小節線からどれだけ左に置くか（ピクセル。小節線と重ならないように）

  // 流れるモードの設定（ステップE-2）
  const FLOW_CURSOR_OFFSET = 100; // 縦線を置く位置：札の右端から、これだけ右（ピクセル）
  // （前は「帯の幅の4分の1」にしていたが、PC などの広い画面では、始める前の空白が広くなりすぎたので、決まった距離にした）
  const FLOW_LABEL_PADDING = 8; // 札の、調号の右に空けるすき間（ピクセル）

  // この部品の名札（流れるモードで、下の帯から上の帯の絵を <use> で指すときの id に使う。1つのページに2つあっても重ならないように）
  const uid = "staff-" + Math.random().toString(36).slice(2);

  // ===== 描くのに使う値 =====

  // VexFlow の部品一式（読み込みが終わるまでは null）
  // $state を付けると、読み込みが終わって値が入ったときに、下の $effect がもう一度動いて描く
  let VF = $state(null);

  // 枠の幅（ピクセル）。幅が変わったときに入れ直す（$state なので、変わると描き直す）
  let width = $state(0);

  // 五線譜を入れる枠（bind:this で、部品そのものが入る）。この枠の中でスクロールする
  let wrapper = $state(null);

  // 五線譜（SVG）を描き込む場所
  let container = $state(null);

  // 重ねる層（透明な SVG）（ステップC-1）
  let overlay = $state(null);

  // 流れる縦線を描く、もう1枚の重ねる層と、その中の縦線（ステップC-2）
  let cursorLayer = $state(null);
  let cursorLine = $state(null);

  // 流れる縦線の目じるしを、五線譜の上の位置にしたもの [{ time, x, top }, ...]（ステップC-2）
  // 五線譜を描き直したとき・目じるしが変わったときに作り直す（毎回作ると重いので、作っておいて使い回す）
  let cursorPoints = [];

  // 縦線の位置を探すときの手がかりの番号（前から順に進むので、毎回最初から探さなくてよいように）（ステップC-2）
  let cursorSearchIndex = 0;

  // 最後に描いたときの、音符ごとの当たり判定の四角の一覧（renderScore が返すもの）（ステップB）
  // タップした音符を探すのと、自動スクロールで段の位置を調べるのに使う（画面には出さないので $state は付けない）
  let hitBoxes = [];

  // 五線譜を描いた回数（ステップC-1）
  // 描き直したら1つ増やす。自動スクロールと重ねる層の $effect は、これが変わったときにも動き直す
  // （描き直すと、音符の位置が変わることがあるため）
  let renderVersion = $state(0);

  // ===== 流れるモードで使う値（ステップE-2） =====

  // 上の帯の枠・上の帯と下の帯の動く部分・下の帯の絵（SVG）・札の場所2つ・止まっている縦線
  let flowRow = $state(null);
  let upperTrack = $state(null);
  let lowerTrack = $state(null);
  let lowerSvg = $state(null);
  let upperLabel = $state(null);
  let lowerLabel = $state(null);
  let flowCursor = $state(null);

  // 帯1本の高さ（ピクセル）と、描いた絵の中で帯が始まる高さ（段の上端。上の余白は切り取って見せる）
  let flowRowHeight = $state(0);
  let flowLineTop = 0;

  // 指（マウス）で横にずらした量（ピクセル。右へ進めた分がプラス）と、ずらしている最中の指の位置（ステップE-2）
  let browseOffset = $state(0);
  let dragX = null;

  // 小節ごとの状態（音部記号・調）と、札の幅（ピクセル）と、最後に描いた札の中身（同じなら描き直さない）
  let flowStates = [];
  let labelWidth = 0;
  let lastLabelKey = "";

  // 最後に自動スクロールしたときの、段の上端の高さ（ステップE-1）
  // 段が変わったときだけ、今の段を枠のいちばん上に置き直すために覚えておく（画面には出さないので $state は付けない）
  let lastScrolledLineTop = null;

  // ① 五線譜を描く係：VexFlow の読み込み・枠の幅・楽譜・色・帯のどれかが変わるたびに描き直す
  // （$effect の中で使っている $state・$props の値が変わると、自動でもう一度動く）
  $effect(() => {
    // まだ準備ができていないとき（VexFlow を読み込み中・幅がまだ分からないとき）は描かない
    if (VF === null || container === null || width === 0) {
      return;
    }

    // 楽譜を描く（選択・範囲・再生中の音符・拍の線は使わないので、null・null・[]・false を渡す）
    const result = renderScore(VF, container, score, width, null, null, [], false, {
      minWidth: MIN_WIDTH, // スマホの幅で改行する
      hideNames: true, // パート名は描かない（ページの上に出しているので）
      noteColors: noteColors, // 判定から外す音の灰色・目標の音・通過した音・判定の結果などの色
      measureRange: measureRange, // 描く小節の範囲（null なら全部）（ステップD-3）
      proportional: flow, // 流れるモードなら、1本の帯で、時間に比例した位置に描く（ステップE-2）
      flowScale: flowScale, // 流れるモードの幅の倍率（ステップE-2）
    });
    hitBoxes = result.hitBoxes;

    // 流れるモードの準備（ステップE-2）
    if (flow) {
      prepareFlow(result);
    }

    // 音符の後ろに帯を敷く（ステップB-2）
    drawBands(bands);

    // 描いた回数を1つ増やす（untrack：ここで renderVersion を読んでも、この $effect が動き直さないようにする）
    untrack(() => {
      renderVersion += 1;
    });
  });

  // ② 自動スクロールの係：見せたい音符（focus）か、描いた回数が変わったときに動く（ステップC-1：①から分けた）
  // （ステップE-2：流れるモードでは、縦にスクロールしない）
  $effect(() => {
    const target = focus;
    renderVersion; // 描き直したときにも動くように、読んでおく
    if (target !== null && !flow) {
      // 画面の書き換えが終わってからスクロールする
      tick().then(() => scrollToNote(target));
    }
  });

  // ②-2 練習を始めたときの自動スクロールの係：scrollRequest が増えたときだけ動く（1画面に収める手直しの続き）
  $effect(() => {
    if (scrollRequest === 0) {
      return; // まだ一度も練習を始めていない
    }
    untrack(() => {
      if (focus === null || flow || wrapper === null) {
        return;
      }
      // 目標の音が1段目にあるときは、枠のいちばん上（テンポの文字なども見える所）までスクロールする（楽譜の先頭を見せる）
      const box = hitBoxes.find((item) => item.measure === focus.measure && item.note === focus.note);
      const firstLineTop = Math.min(...hitBoxes.map((item) => item.lineTop));
      if (box !== undefined && box.lineTop === firstLineTop) {
        lastScrolledLineTop = box.lineTop;
        wrapper.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // 2段目より後のときは、前にスクロールした段を忘れて（null）から、その段を枠のいちばん上に置き直す
      lastScrolledLineTop = null;
      scrollToNote(focus);
    });
  });

  // ③ 重ねる層の係：帯・印か、描いた回数が変わったときに、重ねる層だけを描き直す（ステップC-1）
  $effect(() => {
    const bandsToDraw = overlayBands;
    const marksToDraw = overlayMarks;
    renderVersion; // 描き直したときにも動くように、読んでおく
    if (overlay !== null) {
      drawOverlay(bandsToDraw, marksToDraw);
    }
  });

  // ④ 流れる縦線の目じるしを、五線譜の上の位置にする係：目じるしか、描いた回数が変わったときに動く（ステップC-2）
  $effect(() => {
    const keys = cursorKeys;
    renderVersion; // 描き直したときにも動くように、読んでおく
    cursorPoints = container !== null ? buildCursorPoints(keys) : [];
    cursorSearchIndex = 0;
    // 位置を作り直したら、今の時刻の位置に置き直す（untrack：cursorTime の変化では、この係は動かない）
    // （ステップE-2：流れるモードなら、帯の位置も置き直す）
    untrack(() => {
      moveCursor(cursorTime);
      moveFlow(flowTime, cursorTime);
    });
  });

  // ⑤ 流れる縦線を動かす係：時刻が変わるたびに、縦線の位置だけを変える（ステップC-2）
  $effect(() => {
    moveCursor(cursorTime);
  });

  // ⑥ 流れるモードで、帯を流す係：時刻が変わるたびに、帯の位置だけを変える（ステップE-2）
  // （横にずらした量 browseOffset も moveFlow の中で読んでいるので、ずらしたときにも動く）
  $effect(() => {
    browseOffset;
    moveFlow(flowTime, cursorTime);
  });

  // ⑦ 横にずらせなくなったら（演奏を始めたら）、ずらした量を 0 に戻す係（ステップE-2）
  $effect(() => {
    if (!flowBrowsable) {
      browseOffset = 0;
    }
  });

  // ⑧ マウスのホイール・トラックパッドの横スクロールで、帯を横にずらす係（ステップE-2）
  // （ホイールを止める preventDefault を使うので、passive: false で自分で登録する）
  $effect(() => {
    if (!flow || wrapper === null) {
      return;
    }
    const element = wrapper;
    const handleWheel = (event) => {
      if (!flowBrowsable) {
        return;
      }
      // 横の動き（または Shift を押しながらの縦の動き）だけを使う。ふつうの縦スクロールは、ページのスクロールにまかせる
      const amount = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
      if (amount === 0) {
        return;
      }
      event.preventDefault(); // ブラウザの「戻る」などの動きを止める
      browseBy(amount);
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  });

  /**
   * 流れるモードで、帯を横にずらす関数（ステップE-2）
   * 0（最初の所）より前と、帯の最後より先には、ずらさない。
   * @param {number} amount - ずらす量（ピクセル。プラスで先へ進む）
   */
  function browseBy(amount) {
    const last = cursorPoints.length > 0 ? cursorPoints[cursorPoints.length - 1].x - cursorPoints[0].x : 0;
    browseOffset = Math.min(last, Math.max(0, browseOffset + amount));
  }

  /**
   * 流れるモードで、指（マウス）を帯に置いたときの関数（ステップE-2）
   * @param {PointerEvent} event - 指を置いた出来事
   */
  function handlePointerDown(event) {
    if (!flowBrowsable) {
      return;
    }
    dragX = event.clientX;
    // 指が帯の外に出ても、動きを受け取りつづける
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  /**
   * 流れるモードで、指（マウス）を動かしたときの関数（ステップE-2）
   * 指を左へ動かすと、先（右側）が見えるようにずらす。
   * @param {PointerEvent} event - 指を動かした出来事
   */
  function handlePointerMove(event) {
    if (dragX === null) {
      return;
    }
    browseBy(dragX - event.clientX);
    dragX = event.clientX;
  }

  /**
   * 流れるモードで、指（マウス）を離したときの関数（ステップE-2）
   */
  function handlePointerUp() {
    dragX = null;
  }

  /**
   * 流れるモードの準備をする関数（ステップE-2）
   * 五線譜を描いたあとに呼ぶ。描いた絵に id を付けて下の帯から指せるようにし、帯の高さを決め、札を描き直す準備をする。
   * @param {{lineTops: number[], lineBottoms: number[]}} result - renderScore の戻り値
   */
  function prepareFlow(result) {
    const svg = container.querySelector("svg");
    if (svg === null || lowerSvg === null) {
      return;
    }

    // 下の帯は、上の帯の絵（五線譜と重ねる層）を <use> で指して、同じ絵を出す（同じ絵を2回描かなくて済む）
    svg.setAttribute("id", uid + "-main");
    lowerSvg.setAttribute("width", svg.getAttribute("width"));
    lowerSvg.setAttribute("height", svg.getAttribute("height"));

    // 帯の高さ：段の上端〜下端（はみ出した記号も入る）。上のテンポの文字などの余白は切り取る
    flowLineTop = result.lineTops[0];
    flowRowHeight = Math.ceil(result.lineBottoms[0] - result.lineTops[0]);
    [upperTrack, lowerTrack].forEach((track) => {
      if (track !== null) {
        track.style.top = -flowLineTop + "px";
      }
    });

    // 札のために、小節ごとの状態を作り直す（次に帯を動かしたときに、札を描き直す）
    flowStates = buildStates(score);
    lastLabelKey = "";
  }

  /**
   * 流れるモードの札（音部記号と調号）を、上下の帯の左端に描く関数（ステップE-2）
   * 小節の音部記号・調が、最後に描いたものと同じなら、何もしない。
   * @param {number} measure - 今の小節の番号
   */
  function drawFlowLabels(measure) {
    const state = flowStates[measure];
    const svg = container.querySelector("svg");
    if (state === undefined || svg === null || upperLabel === null || lowerLabel === null) {
      return;
    }
    const labelKey = state.clefs[0] + "|" + state.key;
    if (labelKey === lastLabelKey) {
      return;
    }
    lastLabelKey = labelKey;

    // 帯の五線の一番上の線の高さ（描いた絵の中の五線のまとまりから調べる）から、札の五線を置く高さを決める
    const staveBox = svg.querySelector(".vf-stave").getBBox();
    const staveY = staveBox.y - staffMetrics(VF).staffTop;
    const height = Number(svg.getAttribute("height"));

    [upperLabel, lowerLabel].forEach((label) => {
      label.innerHTML = "";
      const renderer = new VF.Renderer(label, VF.Renderer.Backends.SVG);
      renderer.resize(400, height);
      const context = renderer.getContext();
      // 音部記号と調号だけの五線（終わりの小節線は描かない）
      const stave = new VF.Stave(0, staveY, 400);
      stave.addClef(CLEFS[state.clefs[0]].vf);
      stave.addKeySignature(keyToVexKey(state.key));
      stave.setEndBarType(VF.Barline.type.NONE);
      labelWidth = Math.ceil(stave.getNoteStartX() + FLOW_LABEL_PADDING);
      stave.setWidth(labelWidth);
      stave.setContext(context).draw();
      renderer.resize(labelWidth, height);
      // 札も、帯と同じだけ上を切り取る
      label.style.top = -flowLineTop + "px";
      label.style.width = labelWidth + "px";
    });
  }

  /**
   * 流れるモードで、帯を時刻に合った位置にずらす関数（ステップE-2）
   * 上の帯は、その時刻の所が縦線の位置に来るようにずらす。下の帯は、上の帯の右端の続きが、札の右から始まるようにずらす。
   * @param {number|null} time - 縦線の所に来る時刻（秒）。null なら 0
   * @param {number|null} lineTime - 流れる縦線の時刻（null なら、縦線を隠す）
   */
  function moveFlow(time, lineTime) {
    if (!flow || flowRow === null || upperTrack === null || lowerTrack === null || flowCursor === null) {
      return;
    }
    const position = cursorPositionAt(time ?? 0);
    if (position === null) {
      return;
    }
    // 横にずらしているときは、その分だけ先の所を見せる（演奏中は 0）
    const contentX = position.x + browseOffset;

    // 今の小節の札を描く（音部記号・調が変わったときだけ描き直す）
    drawFlowLabels(position.measure);

    // 縦線の位置：札の右端から FLOW_CURSOR_OFFSET だけ右
    const rowWidth = flowRow.clientWidth;
    const cursorX = labelWidth + FLOW_CURSOR_OFFSET;

    // 上の帯：時刻の所（position.x）が縦線の位置に来るようにずらす
    // 下の帯：上の帯の右端に見えている所が、札の右端に来るようにずらす（帯の見える幅から札の幅を引いた分だけ先）
    const upperShift = cursorX - contentX;
    const lowerShift = upperShift - (rowWidth - labelWidth);
    // translate3d にすると、スマホでも絵を描き直さずに位置だけを動かしてくれる（なめらかに動く）
    upperTrack.style.transform = "translate3d(" + upperShift + "px, 0, 0)";
    lowerTrack.style.transform = "translate3d(" + lowerShift + "px, 0, 0)";

    // 縦線：流れる縦線のチェックが入っているときだけ出す
    flowCursor.style.left = cursorX + "px";
    flowCursor.style.visibility = lineTime !== null ? "visible" : "hidden";
  }

  /**
   * 流れる縦線の目じるしを、五線譜の上の位置（横の位置と、五線の上端の高さ）にする関数（ステップC-2）
   * 音符の目じるしは、その音符の横のまん中。小節の始まりは、その小節の最初の音符（休符も）の左端。小節の終わりは、小節線の少し左。
   * @param {{time: number, measure: number, note: number|string}[]} keys - 目じるしの並び
   * @returns {{time: number, x: number, top: number}[]} 位置の並び（見つからない目じるしは入れない）
   */
  function buildCursorPoints(keys) {
    const svg = container.querySelector("svg");
    if (svg === null) {
      return [];
    }

    // 小節ごとの五線（VexFlow は、1つのパートの五線を、小節の順に描いている）
    const staves = [...svg.querySelectorAll(".vf-stave")].map((stave) => stave.getBBox());

    // 描いた最初の小節の番号（範囲を決めていないときは 0）（ステップD-3）
    // 五線は描いた小節の分しかないので、「何番目の五線か」は、小節の番号からこれを引いて求める
    // （範囲の外の小節の目じるしは、五線が見つからないので入れない）
    const firstMeasure = measureRange !== null ? measureRange.from : 0;

    const points = [];
    keys.forEach((key) => {
      const stave = staves[key.measure - firstMeasure];
      if (stave === undefined) {
        return;
      }
      // 流れるモードでは、音符の目じるしだけを使う（ステップE-2）
      // （音符は時間に比例した位置にあるので、音符と音符の間をなめらかに動かせば、帯はいつも同じ速さで流れる。
      //   小節の始まり・終わりの目じるしを使うと、小節線の所で一瞬止まってから跳ぶように見えるため）
      if (flow && typeof key.note !== "number") {
        return;
      }
      let x = null;
      if (key.note === "end") {
        // 小節の終わり：小節線の少し左
        x = stave.x + stave.width - CURSOR_END_INSET;
      } else if (key.note === "start") {
        // 小節の始まり：その小節の最初の音符（休符も）の左端
        const first = hitBoxes.find((box) => box.measure === key.measure);
        x = first !== undefined ? first.x : stave.x;
      } else {
        // 音符：その音符の横のまん中
        const box = hitBoxes.find((item) => item.measure === key.measure && item.note === key.note);
        if (box !== undefined) {
          x = box.x + box.w / 2;
        }
      }
      if (x !== null) {
        // （ステップE-2：小節の番号も入れておく。流れるモードの札に使う）
        points.push({ time: key.time, x: x, top: stave.y, measure: key.measure });
      }
    });
    return points;
  }

  /**
   * 流れる縦線を、時刻に合った位置に動かす関数（ステップC-2）
   * 時刻の前後の目じるしの間を、時間の割合でなめらかに動かす。
   * @param {number|null} time - 時刻（秒）。null なら縦線を隠す
   */
  function moveCursor(time) {
    if (cursorLine === null) {
      return;
    }
    if (time === null || cursorPoints.length === 0) {
      cursorLine.setAttribute("visibility", "hidden");
      return;
    }

    // 重ねる層を、五線譜（SVG）とぴったり同じ位置・大きさにする
    const svg = container.querySelector("svg");
    if (svg !== null) {
      cursorLayer.setAttribute("width", svg.getAttribute("width"));
      cursorLayer.setAttribute("height", svg.getAttribute("height"));
      cursorLayer.style.left = container.offsetLeft + "px";
      cursorLayer.style.top = container.offsetTop + "px";
    }

    // 時刻に合った位置を求める（ステップE-2：流れるモードでも使うので、関数に分けた）
    const position = cursorPositionAt(time);

    cursorLine.setAttribute("x1", String(position.x));
    cursorLine.setAttribute("x2", String(position.x));
    cursorLine.setAttribute("y1", String(position.top - CURSOR_EXTEND));
    cursorLine.setAttribute("y2", String(position.top + STAFF_HEIGHT + CURSOR_EXTEND));
    cursorLine.setAttribute("visibility", "visible");
  }

  /**
   * 時刻に合った、五線譜の上の位置を求める関数（ステップE-2：moveCursor から取り出した）
   * 時刻の前後の目じるしの間を、時間の割合で求める。
   * @param {number} time - 時刻（秒）
   * @returns {{x: number, top: number, measure: number}|null} 横の位置・その段の五線の上端・小節の番号。目じるしがないときは null
   */
  function cursorPositionAt(time) {
    if (cursorPoints.length === 0) {
      return null;
    }

    // time より前（同じ時刻も）の、いちばん後ろの目じるしの番号を探す（ふつうは前回の続きなので、手がかりから進める）
    if (cursorSearchIndex >= cursorPoints.length || cursorPoints[cursorSearchIndex].time > time) {
      cursorSearchIndex = 0; // 時刻が戻ったとき（くり返しの2回目など）は、最初から探す
    }
    while (cursorSearchIndex + 1 < cursorPoints.length && cursorPoints[cursorSearchIndex + 1].time <= time) {
      cursorSearchIndex += 1;
    }
    const from = cursorPoints[cursorSearchIndex];
    const to = cursorPoints[cursorSearchIndex + 1];

    // 前後の目じるしの間を、時間の割合で動かす（同じ段のときだけ。最後の目じるしより後ろは、最後の目じるしの位置）
    let x = from.x;
    if (to !== undefined && to.top === from.top && to.time > from.time && time > from.time) {
      const rate = Math.min(1, (time - from.time) / (to.time - from.time));
      x = from.x + (to.x - from.x) * rate;
    }
    return { x: x, top: from.top, measure: from.measure };
  }

  /**
   * 音符を囲む帯の四角の位置と大きさを求める関数（ステップC-1：drawBands から取り出して、重ねる層でも使えるようにした）
   * 帯は、五線の高さ全体と、その音符（五線の外に出た玉や符尾も）を囲む大きさにする。
   * @param {{measure: number, note: number}} position - 音符の場所
   * @returns {{x: number, y: number, width: number, height: number}|null} 四角（SVG の中の位置）。音符が見つからないときは null
   */
  function bandRectOf(position) {
    // その音符の当たり判定の四角を探す（パートはいつも 0）
    const box = hitBoxes.find((item) => item.measure === position.measure && item.note === position.note);
    if (box === undefined) {
      return null;
    }

    // 帯の上下：「音符を囲む四角」と「その段の五線」の両方を含む高さにする
    // （音符が五線の中だけにあるときも、帯が五線の高さいっぱいになるように）
    const staffTop = staffTopOf(box);
    const top = Math.min(box.y, staffTop) - BAND_PADDING_Y;
    const bottom = Math.max(box.y + box.h, staffTop + STAFF_HEIGHT) + BAND_PADDING_Y;
    return { x: box.x - BAND_PADDING_X, y: top, width: box.w + BAND_PADDING_X * 2, height: bottom - top };
  }

  /**
   * 四角（帯）の SVG の部品を作る関数（ステップC-1）
   * @param {{x: number, y: number, width: number, height: number}} rect - 四角の位置と大きさ
   * @param {string} color - 色
   * @returns {SVGRectElement} 四角の部品
   */
  function createBandElement(rect, color) {
    // createElementNS は、SVG の部品を作るときの決まった書き方
    const element = document.createElementNS(SVG_NS, "rect");
    element.setAttribute("x", String(rect.x));
    element.setAttribute("y", String(rect.y));
    element.setAttribute("width", String(rect.width));
    element.setAttribute("height", String(rect.height));
    element.setAttribute("rx", "4"); // 角を少し丸くする
    element.setAttribute("fill", color);
    element.setAttribute("fill-opacity", String(BAND_OPACITY));
    element.setAttribute("stroke", "none"); // 枠線は付けない（付けないと、VexFlow の SVG の決まりで黒い枠線が付いてしまう）
    return element;
  }

  /**
   * 音符の後ろに、うすい青の帯（縦長の四角）を敷く関数（ステップB-2）
   * 描いた SVG のいちばん最初に入れるので、音符や五線より後ろ（下）に描かれる。
   * @param {{measure: number, note: number}[]} positions - 帯を敷く音符の場所の配列
   */
  function drawBands(positions) {
    const svg = container.querySelector("svg");
    if (svg === null) {
      return;
    }

    positions.forEach((position) => {
      const rect = bandRectOf(position);
      if (rect === null) {
        return;
      }
      // いちばん最初に入れて、音符や五線より後ろに描かれるようにする
      svg.insertBefore(createBandElement(rect, BAND_COLOR), svg.firstChild);
    });
  }

  /**
   * 重ねる層に、帯と印を描く関数（ステップC-1）
   * 前に描いたものを全部消してから描く。五線譜そのものは描き直さないので、すぐに終わる。
   * @param {{positions: object[], color: string}[]} bandsToDraw - 帯の配列
   * @param {{position: object, color: string, text: string}[]} marksToDraw - 印の配列
   */
  function drawOverlay(bandsToDraw, marksToDraw) {
    const svg = container.querySelector("svg");

    // 前に描いたものを消す
    overlay.innerHTML = "";

    // 五線譜がまだないときは、何も描かない
    if (svg === null) {
      return;
    }

    // 重ねる層を、五線譜（SVG）とぴったり同じ位置・大きさにする
    overlay.setAttribute("width", svg.getAttribute("width"));
    overlay.setAttribute("height", svg.getAttribute("height"));
    overlay.style.left = container.offsetLeft + "px";
    overlay.style.top = container.offsetTop + "px";

    // 帯
    bandsToDraw.forEach((band) => {
      band.positions.forEach((position) => {
        const rect = bandRectOf(position);
        if (rect !== null) {
          overlay.appendChild(createBandElement(rect, band.color));
        }
      });
    });

    // 音符の下の印
    marksToDraw.forEach((mark) => {
      const box = hitBoxes.find((item) => item.measure === mark.position.measure && item.note === mark.position.note);
      if (box === undefined) {
        return;
      }
      // 下に出す印：五線の下端か、五線より下に出た音符の下端の、低いほうの下に置く
      // 上に出す印（ステップD）：五線の上端か、五線より上に出た音符の上端の、高いほうの上に置く
      const staffTop = staffTopOf(box);
      const y = mark.placement === "above" ? Math.min(staffTop, box.y) - MARK_GAP_ABOVE : Math.max(staffTop + STAFF_HEIGHT, box.y + box.h) + MARK_GAP;
      const text = document.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(box.x + box.w / 2)); // 音符の横のまん中
      text.setAttribute("y", String(y));
      text.setAttribute("text-anchor", "middle"); // x を文字のまん中にする
      text.setAttribute("font-size", String(MARK_FONT_SIZE));
      text.setAttribute("font-weight", "bold");
      // 文字と同じ色で縁取って、線を太く見せる（ステップD-4）
      text.setAttribute("stroke", mark.color);
      text.setAttribute("stroke-width", String(MARK_STROKE_WIDTH));
      text.setAttribute("fill", mark.color);
      text.textContent = mark.text;
      overlay.appendChild(text);
    });
  }

  /**
   * 音符がある段の、五線のいちばん上の線の高さを求める関数（ステップB-2）
   * 描いた SVG の中から、その音符と同じ段・同じ小節の五線を探して、その上端の高さを返す。
   * @param {object} box - 音符の当たり判定の四角（renderScore が返したもの）
   * @returns {number} 五線のいちばん上の線の高さ（見つからないときは、音符の四角の上端）
   */
  function staffTopOf(box) {
    const svg = container.querySelector("svg");

    // VexFlow は、五線を class="vf-stave" のまとまりで描く。その中の線の高さを調べて、
    // この音符の横の位置にあり、段の上端〜下端の間にある五線を探す
    const staves = svg.querySelectorAll(".vf-stave");
    for (const stave of staves) {
      const rect = stave.getBBox(); // 五線のまとまりを囲む四角（SVG の中の位置）
      const centerX = box.x + box.w / 2;
      const inX = centerX >= rect.x && centerX <= rect.x + rect.width;
      const inLine = rect.y >= box.lineTop && rect.y + rect.height <= box.lineBottom;
      if (inX && inLine) {
        return rect.y;
      }
    }
    return box.y;
  }

  /**
   * 音符の段が枠のいちばん上に来るように、枠の中をスクロールする関数（ステップB）
   * （ステップE-1：前は「段が枠からはみ出したときだけ」スクロールしていたので、次の段は、その段に入るまで見えなかった。
   *   段が変わるたびに、今の段を枠のいちばん上に置くようにして、枠に2段以上入っていれば、次の段がいつも見えるようにした）
   * 同じ段の中で音が進むときは、動かさない（目標の音が変わるたびに画面が動くと見づらいため）。
   * ただし、同じ段でも、段が見えている範囲からはみ出しているとき（手でスクロールしたときなど）は、置き直す。
   * @param {{measure: number, note: number}} position - 見せたい音符の場所
   */
  function scrollToNote(position) {
    // その音符の当たり判定の四角を探す（パートはいつも 0）
    const box = hitBoxes.find((item) => item.measure === position.measure && item.note === position.note);
    if (box === undefined || wrapper === null) {
      return;
    }

    // 段の上端と下端を、枠の中の位置に直す（container.offsetTop は、枠の上端から SVG の上端までの距離）
    const top = container.offsetTop + box.lineTop;
    const bottom = container.offsetTop + box.lineBottom;

    // 今、枠の中で見えている範囲
    const visibleTop = wrapper.scrollTop;
    const visibleBottom = wrapper.scrollTop + wrapper.clientHeight;

    // 段が変わったか、段が見えている範囲からはみ出しているときに、段の上端が枠の上に来るようにスクロールする
    // （「じっくり」では音が進むたびに五線譜を描き直すが、段が同じなら動かさない。先の段を手で見ていても、戻されないように）
    const lineChanged = box.lineTop !== lastScrolledLineTop;
    const outOfView = top < visibleTop || bottom > visibleBottom;
    if (lineChanged || outOfView) {
      // 最後のほうの段は、枠のいちばん上まで上がりきらないこともある（scrollTo が、スクロールできる所までで止める）
      wrapper.scrollTo({ top: Math.max(0, top - SCROLL_MARGIN), behavior: "smooth" });
    }

    // 今回の段を覚えておく
    lastScrolledLineTop = box.lineTop;
  }

  /**
   * 五線譜をタップ（クリック）したときに呼ばれる関数（ステップB）
   * タップした所にある音符を探して、使う側に場所を伝える。
   * @param {MouseEvent} event - タップしたときの出来事（どこを押したかが入っている）
   */
  function handleClick(event) {
    // タップを使わないとき、まだ描いていないときは、何もしない
    if (onselect === null) {
      return;
    }
    const svg = container.querySelector("svg");
    if (svg === null) {
      return;
    }

    // 押した所を、SVG の左上からの位置に直す（getBoundingClientRect は、画面の上での位置と大きさ）
    const rect = svg.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 押した所を囲む音符を探す（まわりに HIT_MARGIN だけ広げる。重なっていたら、横のまん中がいちばん近いもの）
    let found = null;
    let bestDistance = Infinity;
    hitBoxes.forEach((box) => {
      const inside = x >= box.x - HIT_MARGIN && x <= box.x + box.w + HIT_MARGIN && y >= box.y - HIT_MARGIN && y <= box.y + box.h + HIT_MARGIN;
      if (!inside) {
        return;
      }
      const distance = Math.abs(x - (box.x + box.w / 2));
      if (distance < bestDistance) {
        bestDistance = distance;
        found = box;
      }
    });

    // 見つかったら、使う側に場所を伝える
    if (found !== null) {
      onselect({ measure: found.measure, note: found.note });
    }
  }

  // この部品が画面に表示されたら、枠の幅を見張り始めて、VexFlow を読み込む
  // （VexFlow はブラウザの中でしか動かないので、ここで読み込む）
  onMount(() => {
    // 枠の幅が変わったら、width に入れ直す（→ 上の $effect で描き直される）
    // ResizeObserver は、要素の大きさが変わったことを教えてくれる仕組み
    const observer = new ResizeObserver(() => {
      // clientWidth は、枠の内側の幅（左右の余白 padding も含む）。余白のぶんを引いて、描ける幅にする
      const style = getComputedStyle(wrapper);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      // 小数を切り捨てる（同じ幅で何度も描き直さないように、整数にそろえる）
      const newWidth = Math.floor(wrapper.clientWidth - padding);
      if (newWidth !== width) {
        width = newWidth;
      }
    });
    observer.observe(wrapper);

    // VexFlow を読み込んで、楽譜用のフォントの準備ができたら VF に入れる（→ 上の $effect で描かれる）
    (async () => {
      // VexFlow を読み込む（読み込むと、楽譜用のフォントの読み込みも始まる）
      const loaded = (await import("vexflow")).default;
      // 楽譜用のフォント（Bravura）の読み込みが終わるのを待つ（終わる前に描くと、記号が正しく出ない）
      await document.fonts.ready;
      VF = loaded;
    })();

    // この部品が画面から消えるときの後片付け（幅の見張りをやめる）
    return () => {
      observer.disconnect();
    };
  });
</script>

<!-- 五線譜が入る枠 -->
<!-- maxHeight があるときは、枠の高さに上限を付けて、はみ出した分は枠の中で縦にスクロールする（ステップB） -->
<!-- （ステップE-2：流れるモードでは、高さの上限もスクロールも使わない） -->
<div class="staff-view" class:flow bind:this={wrapper} style:max-height={flow ? null : maxHeight} style:overflow-y={!flow && maxHeight !== null ? "auto" : null}>
  <!-- VexFlow の読み込み中だけ、案内を出す -->
  {#if VF === null}
    <p class="loading">楽譜を準備しています…</p>
  {/if}

  {#if flow}
    <!-- ===== 流れるモード（ステップE-2）：上の帯（今）と下の帯（続き） ===== -->
    <!-- 上の帯：五線譜（1本の帯）と重ねる層を、左へずらして流す。左端に札、決まった位置に縦線 -->
    <!-- 演奏していないときは、指（マウス）で左右にずらして、先の所を見られる（ステップE-2） -->
    <!-- キーボードでは操作しない（楽譜を見るための補助なので）。そのことを Svelte の警告に伝えておく -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="flow-view" class:browsable={flowBrowsable} onpointerdown={handlePointerDown} onpointermove={handlePointerMove} onpointerup={handlePointerUp} onpointercancel={handlePointerUp}>
      <div class="flow-row" bind:this={flowRow} style:height="{flowRowHeight}px">
        <div class="flow-track" bind:this={upperTrack}>
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="staff-canvas" class:tappable={onselect !== null} bind:this={container} onclick={handleClick}></div>
          <svg class="overlay" id="{uid}-overlay" bind:this={overlay} aria-hidden="true"></svg>
        </div>
        <div class="flow-label" bind:this={upperLabel}></div>
        <div class="flow-cursor" bind:this={flowCursor}></div>
      </div>

      <!-- 下の帯：上の帯と同じ絵を <use> で指して出し、上の帯の続きの所までずらす -->
      <div class="flow-row lower" style:height="{flowRowHeight}px">
        <div class="flow-track" bind:this={lowerTrack}>
          <svg bind:this={lowerSvg} aria-hidden="true">
            <use href="#{uid}-main" />
            <use href="#{uid}-overlay" />
          </svg>
        </div>
        <div class="flow-label" bind:this={lowerLabel}></div>
      </div>
    </div>
  {:else}
    <!-- ここに五線譜（SVG）が描かれる。タップすると、その音符を使う側に伝える（ステップB） -->
    <!-- キーボードでの操作は、練習ページの「前の音」「次の音」ボタンで行えるので、ここでは受け取らない -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="staff-canvas" class:tappable={onselect !== null} bind:this={container} onclick={handleClick}></div>

    <!-- 重ねる層：五線譜の上にぴったり重ねる透明な SVG（ステップC-1） -->
    <!-- pointer-events: none（下の style）で、タップは下の五線譜に通す -->
    <svg class="overlay" bind:this={overlay} aria-hidden="true"></svg>

    <!-- 流れる縦線の層（ステップC-2）。縦線は1本だけ作っておき、位置だけを動かす -->
    <svg class="overlay" bind:this={cursorLayer} aria-hidden="true">
      <line bind:this={cursorLine} stroke={CURSOR_COLOR} stroke-width={CURSOR_WIDTH} stroke-linecap="round" visibility="hidden" />
    </svg>
  {/if}
</div>

<style>
  /* 五線譜の枠：白い地にうすい枠線。最低限の幅より狭い画面では、横にスクロールする */
  /* position: relative は、中の SVG の位置（offsetTop）を、この枠から測るため（ステップB） */
  /* （ステップC-1：重ねる層を、この枠を基準に置くためにも使う） */
  .staff-view {
    position: relative;
    overflow-x: auto;
    padding: 4px;
    background-color: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  /* 音符をタップできるときは、カーソルを指の形にする（ステップB） */
  .staff-canvas.tappable {
    cursor: pointer;
  }

  /* 重ねる層：五線譜の上に重ねて、タップは下に通す（ステップC-1） */
  .overlay {
    position: absolute;
    pointer-events: none;
    overflow: visible;
  }

  /* ===== 流れるモード（ステップE-2） ===== */

  /* 流れるモードの枠：横にはスクロールしない（帯の位置は、プログラムで動かす） */
  .staff-view.flow {
    overflow: hidden;
  }

  /* 上下の帯をまとめた所：横にずらせるときは、つかむ形のカーソルにする（ステップE-2） */
  /* touch-action: pan-y で、縦の指の動きはページのスクロールに、横の動きはこの部品にまかせる */
  .flow-view.browsable {
    cursor: grab;
    touch-action: pan-y;
  }

  /* 帯1本ぶんの枠：はみ出した所は見せない */
  .flow-row {
    position: relative;
    overflow: hidden;
  }

  /* 下の帯：上の帯との間に、うすい線を引く */
  .flow-row.lower {
    border-top: 1px dashed #e0e0e0;
  }

  /* 帯の動く部分：左上に置き、位置は transform でずらす（will-change で、動かす準備をブラウザに知らせておく） */
  .flow-track {
    position: absolute;
    left: 0;
    will-change: transform;
  }

  /* 札（音部記号と調号）：帯の左端に、白い地で重ねて固定する */
  .flow-label {
    position: absolute;
    left: 0;
    background-color: white;
    pointer-events: none;
  }

  /* 止まっている縦線（上の帯の決まった位置） */
  .flow-cursor {
    position: absolute;
    top: 4px;
    bottom: 4px;
    width: 2px;
    margin-left: -1px;
    background-color: #e65100;
    border-radius: 1px;
    pointer-events: none;
  }

  /* 読み込み中の案内 */
  .loading {
    margin: 12px 0;
    text-align: center;
    font-size: 0.9rem;
    color: #757575;
  }
</style>
