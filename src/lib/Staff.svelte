<script>
  // 五線譜の設定値と、位置を計算する関数を読み込む
  import {
    STAFF_WIDTH,
    ROW_HEIGHT,
    LINE_POSITIONS,
    C_LINE_POSITION,
    CLEF_X,
    NOTES_PER_ROW,
    STEM_WIDTH,
    GLYPH_FONT_SIZE,
    GLYPHS,
    positionToY,
    splitIntoRows,
    layoutKeySignature,
    layoutNote,
  } from "#lib/staff.js";

  // この部品を使う側から受け取る値
  // notes         ：表示する音の並び（音のデータの配列）
  // signature     ：調号の数（プラスは♯の数、マイナスは♭の数、0 は調号なし）
  // selectedIndex ：選択中の音が何番目か（0から始まる）。選択していないときは null
  // playingIndex  ：再生中の音が何番目か（0から始まる）。再生していないときは null
  // passed        ：それぞれの音を通過したかどうか（notes と同じ順番で、true か false が並ぶ配列）
  // statuses      ：それぞれの音の判定の結果（notes と同じ順番で並ぶ配列）
  //                 "ok"（OK）・"high"（高い）・"low"（低い）・"none"（音なし）のどれか。まだ判定していない音は入っていない
  // onselect      ：音符がタップされたときに呼ぶ関数。何番目の音かを渡す
  // selectedIndex・playingIndex・passed・statuses・onselect は、渡されなかったときのための初期値を決めておく
  let { notes, signature, selectedIndex = null, playingIndex = null, passed = [], statuses = [], onselect = () => {} } = $props();

  // 判定の結果の種類ごとの、段の下に表示する記号の形（OK は色だけで、記号は付けない）
  // 文字の「↑」は端末によって細かったり形が違ったりするので、線で描く。
  // 中身は「線の描き方」の指示で、記号の中心を (0, 0) とした座標で書いてある
  //   M x y：ペンを (x, y) に移動する　　L x y：(x, y) まで線を引く
  //   V y  ：縦に y まで線を引く　　　　　H x  ：横に x まで線を引く
  const STATUS_MARK_PATHS = {
    // 高い：上向きの矢印（縦の線と、上の「へ」の形）
    high: "M0 5 V-5 M-4 -1 L0 -5 L4 -1",
    // 低い：下向きの矢印（縦の線と、下の「V」の形）
    low: "M0 -5 V5 M-4 1 L0 5 L4 1",
    // 音なし：横の線
    none: "M-4 0 H4",
  };

  // 判定の結果の記号の、中心の縦の位置（段の一番下）
  // 一番低い音（ド3）よりも下なので、どの高さの音符とも重ならない
  const STATUS_MARK_Y = ROW_HEIGHT - 7;

  // 音の並びを、1段ぶん（8音）ずつに分けたもの
  // $derived を付けると、notes が変わるたびに自動で分け直される
  let rows = $derived(splitIntoRows(notes));

  // 調号の記号それぞれの、文字と位置
  // 調号はどの段でも同じなので、段ごとではなくここで1回だけ計算する
  let keySignatureSymbols = $derived(layoutKeySignature(signature));

  /**
   * 音符の上でキーが押されたときの処理をする関数
   * キーボードで操作する人のために、Enter キーかスペースキーでも音符を選べるようにする。
   * @param {KeyboardEvent} event - キーが押されたときの情報
   * @param {number} noteIndex - 何番目の音か（0から始まる）
   */
  function handleKeydown(event, noteIndex) {
    if (event.key === "Enter" || event.key === " ") {
      // スペースキーで画面がスクロールしてしまうのを防ぐ
      event.preventDefault();

      // タップされたときと同じように、選ばれたことを伝える
      onselect(noteIndex);
    }
  }
</script>

<!-- 段を1つずつ取り出して、段ごとに1つのSVGを描く -->
{#each rows as row, rowIndex (rowIndex)}
  <!-- viewBox で「中の座標の範囲」を決めておくと、画面の幅に合わせて全体が拡大・縮小される -->
  <svg class="staff" viewBox="0 0 {STAFF_WIDTH} {ROW_HEIGHT}">
    <!-- 五線：5本の線を、通し番号から縦の位置を計算して引く -->
    {#each LINE_POSITIONS as position (position)}
      <line class="staff-line" x1="0" y1={positionToY(position)} x2={STAFF_WIDTH} y2={positionToY(position)} />
    {/each}

    <!-- アルト記号（ハ音記号）：楽譜用フォントの文字として表示する -->
    <!-- 文字の基準の位置（y）をドの線（真ん中の線）に合わせると、記号のくびれの真ん中がドの線に重なる -->
    <text class="glyph" x={CLEF_X} y={positionToY(C_LINE_POSITION)} font-size={GLYPH_FONT_SIZE}>
      {GLYPHS.cClef}
    </text>

    <!-- 調号：アルト記号の右に、♯か♭を決まった順番と高さで並べる -->
    {#each keySignatureSymbols as symbol, symbolIndex (symbolIndex)}
      <text class="glyph" x={symbol.x} y={symbol.y} font-size={GLYPH_FONT_SIZE}>
        {symbol.glyph}
      </text>
    {/each}

    <!-- 音符：段の中の音を1つずつ取り出して描く -->
    {#each row as note, indexInRow (indexInRow)}
      <!-- この音符の玉・棒・加線・変化記号の位置をまとめて計算する -->
      <!-- 調号の数によって音符の横の位置が変わるので、signature も渡す -->
      {@const layout = layoutNote(note, indexInRow, signature)}

      <!-- 楽譜全体の中で何番目の音か（段の番号 × 1段の音符の数 ＋ 段の中での順番） -->
      {@const noteIndex = rowIndex * NOTES_PER_ROW + indexInRow}

      <!-- この音の判定の結果（まだ判定していない音は undefined になる） -->
      {@const status = statuses[noteIndex]}

      <!-- 音符1つぶんのグループ。g は、SVGの中で複数の図形をまとめるための入れ物 -->
      <!-- このグループのどこをタップしても、この音が選ばれる -->
      <!-- role・tabindex・aria-label・onkeydown は、キーボードや読み上げで操作する人のための設定 -->
      <g
        class="note"
        class:selected={noteIndex === selectedIndex}
        class:playing={noteIndex === playingIndex}
        class:passed={passed[noteIndex] === true}
        class:status-ok={status === "ok"}
        class:status-high={status === "high"}
        class:status-low={status === "low"}
        class:status-none={status === "none"}
        role="button"
        tabindex="0"
        aria-label="{noteIndex + 1}番目の音"
        onclick={() => onselect(noteIndex)}
        onkeydown={(event) => handleKeydown(event, noteIndex)}
      >
        <!-- タップできる範囲：音符が入っている縦の帯の全体 -->
        <!-- ふだんは透明で、選択中だけ薄い青になる。玉が小さくても押しやすくするためのもの -->
        <rect class="hit-area" x={layout.hitX} y="0" width={layout.hitWidth} height={ROW_HEIGHT} />

        <!-- 加線：五線からはみ出した音にだけ、必要な本数ぶん引く -->
        {#each layout.ledgerYs as ledgerY (ledgerY)}
          <line class="ledger-line" x1={layout.ledgerX1} y1={ledgerY} x2={layout.ledgerX2} y2={ledgerY} />
        {/each}

        <!-- 棒：付け根から先端まで、まっすぐな線を引く -->
        <line class="stem" x1={layout.stemX} y1={layout.stemY1} x2={layout.stemX} y2={layout.stemY2} stroke-width={STEM_WIDTH} />

        <!-- 玉：楽譜用フォントの文字として表示する -->
        <!-- text-anchor="middle" を付けると、x の位置が文字の横の中心になる -->
        <text class="glyph" x={layout.x} y={layout.y} font-size={GLYPH_FONT_SIZE} text-anchor="middle">
          {GLYPHS.notehead}
        </text>

        <!-- 変化記号：調号と違う音にだけ、♯・♭・♮を玉の左に表示する -->
        <!-- text-anchor="end" を付けると、x の位置が文字の右端になる -->
        {#if layout.accidentalGlyph !== ""}
          <text class="glyph" x={layout.accidentalX} y={layout.y} font-size={GLYPH_FONT_SIZE} text-anchor="end">
            {layout.accidentalGlyph}
          </text>
        {/if}

        <!-- 判定の結果の記号：高い（↑）・低い（↓）・音なし（−）のときだけ、段の一番下に表示する -->
        <!-- STATUS_MARK_PATHS に形がない結果（OK と、まだ判定していない音）は、何も表示しない -->
        <!-- transform の translate で、記号の中心を「音符の真下・段の一番下」に移動する -->
        {#if STATUS_MARK_PATHS[status] !== undefined}
          <path class="status-mark" d={STATUS_MARK_PATHS[status]} transform="translate({layout.x} {STATUS_MARK_Y})" />
        {/if}
      </g>
    {/each}
  </svg>
{/each}

<style>
  /* 楽譜用フォント（Bravura）を読み込む */
  /* static フォルダの中のファイルは、「/fonts/〜」のように先頭に / を付けて指定する */
  @font-face {
    font-family: "Bravura";
    src: url("/fonts/bravura.woff2") format("woff2");
    /* フォントが読み込まれるまでは、文字を表示しない（別のフォントで変な記号が出るのを防ぐ） */
    font-display: block;
  }

  /* 五線譜1段ぶん：横幅いっぱいに表示する（高さは横幅に合わせて自動で決まる） */
  .staff {
    display: block;
    width: 100%;
    height: auto;
    /* 記号は文字として表示しているが、文章ではないので、選択できないようにする */
    /* （タップしたときに、ブラウザが文字入力用のカーソルを出すのを防ぐ） */
    user-select: none;
    -webkit-user-select: none;
  }

  /* 五線の線 */
  .staff-line {
    stroke: #212121;
    stroke-width: 1;
  }

  /* 加線（五線より少し太くして、見やすくする） */
  .ledger-line {
    stroke: #212121;
    stroke-width: 1.2;
  }

  /* 音符の棒（太さは staff.js の設定値を使うので、ここでは色だけ決める） */
  .stem {
    stroke: #212121;
  }

  /* 楽譜用フォントで表示する記号（アルト記号・調号・玉・変化記号） */
  .glyph {
    font-family: "Bravura";
    fill: #212121;
  }

  /* 音符1つぶんのグループ：押せることが分かるように、マウスの形を指にする */
  .note {
    cursor: pointer;
    /* タップしたときにブラウザが付ける枠や色を消す（選択中の表示は自分で付けるため） */
    outline: none;
    -webkit-tap-highlight-color: transparent;
    /* 文字入力用のカーソルが出てしまった場合でも、見えないようにする */
    caret-color: transparent;
  }

  /* タップできる範囲：ふだんは透明 */
  /* fill を none にするとタップに反応しなくなるので、「透明な色で塗る」指定にしている */
  .hit-area {
    fill: transparent;
  }

  /* 通過した音符：玉と変化記号を緑にする */
  /* 選択中・再生中のスタイルより前に書いているので、重なったときは選択中・再生中の色が優先される */
  .note.passed .glyph {
    fill: #2e7d32;
  }

  /* 通過した音符：棒と加線を緑にする */
  .note.passed .stem,
  .note.passed .ledger-line {
    stroke: #2e7d32;
  }

  /* 判定の結果の記号（↑ ↓ −）：太めの線で描く。色は、下の結果ごとのスタイルで決める */
  .status-mark {
    /* 線だけで描くので、中は塗らない */
    fill: none;
    stroke-width: 2.4;
    /* 線の端と、線のつなぎ目を丸くする */
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* 判定が OK の音符：玉と変化記号を緑にする */
  /* 選択中・再生中のスタイルより前に書いているので、重なったときは選択中・再生中の色が優先される */
  .note.status-ok .glyph {
    fill: #2e7d32;
  }

  /* 判定が OK の音符：棒と加線を緑にする */
  .note.status-ok .stem,
  .note.status-ok .ledger-line {
    stroke: #2e7d32;
  }

  /* 判定が「高い」の音符：玉と変化記号を赤にする */
  .note.status-high .glyph {
    fill: #c62828;
  }

  /* 判定が「高い」の音符：棒・加線・記号（↑）を赤にする */
  .note.status-high .stem,
  .note.status-high .ledger-line,
  .note.status-high .status-mark {
    stroke: #c62828;
  }

  /* 判定が「低い」の音符：玉と変化記号を青にする */
  .note.status-low .glyph {
    fill: #1565c0;
  }

  /* 判定が「低い」の音符：棒・加線・記号（↓）を青にする */
  .note.status-low .stem,
  .note.status-low .ledger-line,
  .note.status-low .status-mark {
    stroke: #1565c0;
  }

  /* 判定が「音なし」の音符：玉と変化記号をグレーにする */
  .note.status-none .glyph {
    fill: #9e9e9e;
  }

  /* 判定が「音なし」の音符：棒・加線・記号（−）をグレーにする */
  .note.status-none .stem,
  .note.status-none .ledger-line,
  .note.status-none .status-mark {
    stroke: #9e9e9e;
  }

  /* 選択中の音符：帯を、透ける青にする */
  /* 帯は五線の線の上に重なるので、透けない色で塗ると線が隠れてしまう。 */
  /* fill-opacity で透け具合を決める（0 は完全に透明、1 はまったく透けない） */
  .note.selected .hit-area {
    fill: #1976d2;
    fill-opacity: 0.25;
  }

  /* 選択中の音符：玉と変化記号を青にする */
  .note.selected .glyph {
    fill: #0d47a1;
  }

  /* 選択中の音符：棒と加線を青にする */
  .note.selected .stem,
  .note.selected .ledger-line {
    stroke: #0d47a1;
  }

  /* 再生中の音符：帯を、透けるオレンジにする */
  /* 選択中のスタイルより後に書いているので、選択中の音が再生されたときはオレンジが優先される */
  .note.playing .hit-area {
    fill: #fb8c00;
    fill-opacity: 0.3;
  }

  /* 再生中の音符：玉と変化記号をオレンジにする */
  .note.playing .glyph {
    fill: #e65100;
  }

  /* 再生中の音符：棒と加線をオレンジにする */
  .note.playing .stem,
  .note.playing .ledger-line {
    stroke: #e65100;
  }

  /* キーボードで音符に移動したとき：どの音符にいるか分かるように、帯に枠を付ける */
  .note:focus-visible .hit-area {
    stroke: #1976d2;
    stroke-width: 2;
  }
</style>
