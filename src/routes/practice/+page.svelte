<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // 調のデータに関する設定値と関数を読み込む
  import { DEFAULT_KEY_ID, getKey, getKeyLabel } from "#lib/key.js";

  // 音律の最初の設定と、音律のデータを探す関数を読み込む
  import { DEFAULT_TEMPERAMENT_ID, getTemperament } from "#lib/tuning.js";

  // 保存された音律・作業中の楽譜・判定のレベル・開放弦の設定・練習のモードを、ブラウザから読み込む関数と、
  // 判定のレベル・開放弦の設定・練習のモードをブラウザに保存する関数を読み込む
  import { loadTemperamentId, loadCurrentScore, loadLevelId, saveLevelId, loadOpenStringEnabled, saveOpenStringEnabled, loadModeId, saveModeId } from "#lib/settings.js";

  // 判定のレベルの一覧と、レベルのデータを探す関数を読み込む
  import { LEVELS, DEFAULT_LEVEL_ID, getLevel } from "#lib/level.js";

  // 「じっくり」モードの練習の部品を読み込む
  import StepPractice from "#lib/StepPractice.svelte";

  // 「通し」モードの練習の部品を読み込む
  import RunPractice from "#lib/RunPractice.svelte";

  // 五線譜を描く部品を読み込む（区間を選ぶときに、楽譜の全体を表示するために使う）
  import Staff from "#lib/Staff.svelte";

  // 最初の音部記号と、id から音部記号を探す関数を読み込む（ビオラ版）
  import { DEFAULT_CLEF_ID, getClef } from "#lib/staff.js";

  // 保存した楽譜を探す関数、保存していない変更があるかを調べる関数、最高点を記録する関数を読み込む
  import { getSavedScore, hasUnsavedChanges, recordBestScore } from "#lib/library.js";

  // 楽譜の名前と最高点を表示する部品を読み込む
  import ScoreTitle from "#lib/ScoreTitle.svelte";

  // ===== 練習のモードに関する設定値 =====

  // 選べる練習のモードの一覧
  //   id          ：モードを区別するための名前
  //   name        ：画面に表示する名前
  //   description ：どんな練習なのかの短い説明
  const MODES = [
    { id: "step", name: "じっくり", description: "合うまで次へ進まない" },
    { id: "run", name: "通し", description: "テンポに合わせて弾く。点数が出る" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 練習する楽譜の音の並び（音のデータの配列）。画面に表示された後で、保存された楽譜を読み込む
  let notes = $state([]);

  // 楽譜の調の id
  let keyId = $state(DEFAULT_KEY_ID);

  // 楽譜の音部記号の id（編集ページで選んだもの）（ビオラ版）
  let clefId = $state(DEFAULT_CLEF_ID);

  // 楽譜のテンポ（1分間の拍の数）。「通し」モードで使う
  let tempo = $state(60);

  // 音律の id
  let temperamentId = $state(DEFAULT_TEMPERAMENT_ID);

  // 保存された楽譜の読み込みが終わったかどうか（true：終わった、false：まだ）
  // 読み込む前に「楽譜がありません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 選択中の練習のモードの id（'step'：じっくり、'run'：通し）
  let modeId = $state("step");

  // 選択中の判定のレベルの id（'normal'：ノーマル、'easy'：イージー）
  // 最初は決まった設定にしておき、画面に表示された後で、保存された設定に入れ替える
  let levelId = $state(DEFAULT_LEVEL_ID);

  // 「開放弦の高さで弾いた音もOKにする」設定（true：する、false：しない）
  // 最初は「する」にしておき、画面に表示された後で、保存された設定に入れ替える
  let openStringEnabled = $state(true);

  // 開放弦の設定の説明を表示しているかどうか（true：表示している）。「？」ボタンで切り替える
  let showsOpenStringHelp = $state(false);

  // ===== 練習する区間 =====

  // 練習する区間の、始めの音と終わりの音が何番目か（0から始まる）
  // 区間を決めていないとき（楽譜の全体を練習するとき）は、どちらも null
  let rangeStart = $state(null);
  let rangeEnd = $state(null);

  // 区間を選んでいる最中かどうか（true：選んでいる最中）
  // 選んでいる間は、練習の部品の代わりに、楽譜の全体を表示する
  let isSelectingRange = $state(false);

  // 区間を選んでいる最中に、1回目にタップした音が何番目か（0から始まる）
  // まだ1回もタップしていないときは null
  let pendingIndex = $state(null);

  // 最後の音まで行ったら、最初の音に戻ってくり返すかどうか（true：くり返す）
  let repeatEnabled = $state(false);

  // 練習する音の並び。区間を決めているときは、その区間の音だけを取り出したもの
  // notes.slice(始め, 終わりの次) は、配列の一部分を取り出して、新しい配列を作る
  let practiceNotes = $derived(rangeStart === null ? notes : notes.slice(rangeStart, rangeEnd + 1));

  // 画面に表示する、今の区間の説明（例：「全体（8音）」「3〜6番目（4音）」）
  let rangeText = $derived(rangeStart === null ? `全体（${notes.length}音）` : `${rangeStart + 1}〜${rangeEnd + 1}番目（${practiceNotes.length}音）`);

  // 区間が変わったことを見分けるための目印（例：「2-5」。全体のときは「null-null」）
  // この目印が変わると、練習の部品を作り直して、最初の音からやり直す
  let rangeKey = $derived(`${rangeStart}-${rangeEnd}`);

  // 調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 音律のデータ（名前を表示するために使う）
  let currentTemperament = $derived(getTemperament(temperamentId));

  // 「OK」とする範囲（セント）。目標の音とのズレがこの範囲に入っていれば OK
  // 選択中のレベルによって変わる（ノーマルは 10、イージーは 20）
  let tolerance = $derived(getLevel(levelId).tolerance);

  // 開放弦の設定を、画面に表示するかどうか（純正律のときだけ表示する）
  // ピタゴラス音律は開放弦と同じ高さになり、平均律も差がごく小さいので、設定が必要なのは純正律だけ
  let showsOpenStringSetting = $derived(temperamentId === "just");

  // 開放弦の高さで弾いた音を、実際に OK にするかどうか
  // 設定が画面に出ていて（純正律で）、チェックが入っているときだけ true になる
  let allowOpenString = $derived(showsOpenStringSetting && openStringEnabled);

  // ===== 楽譜の名前と最高点 =====

  // 練習する楽譜が、保存した楽譜のどれか（その id）。名前を付けて保存していない楽譜のときは null
  let savedId = $state(null);

  // 練習する楽譜の名前。名前を付けて保存していない楽譜のときは空の文字
  let scoreName = $state("");

  // この楽譜の最高点。まだ無いときは null
  let bestScore = $state(null);

  // 作業中の楽譜に、保存していない変更があるかどうか（true：ある）
  // あるときは、保存してある楽譜と中身が違うので、最高点を記録しない
  let isUnsaved = $state(false);

  // 最高点を更新した直後かどうか（true：更新した直後）。「更新しました！」と表示するために使う
  let isNewRecord = $state(false);

  // 最高点を記録できない理由（記録できるときは空の文字）
  // $derived.by を付けると、isUnsaved か rangeStart が変わるたびに、自動で決め直される
  let recordNote = $derived.by(() => {
    if (isUnsaved) {
      return "保存していない変更があるので、記録されません";
    }
    if (rangeStart !== null) {
      return "区間を指定しているときは、記録されません";
    }
    return "";
  });

  /**
   * 「通し」で最後まで弾けたときに、最高点を記録する関数
   * 「通し」の部品から、その回の点数と一緒に呼ばれる。
   * 保存した楽譜を、変更なしの状態で、全体を弾いたときだけ記録する。
   * @param {number} points - その回の点数（0〜100）
   */
  function handleRunFinish(points) {
    // 保存した楽譜でないとき・記録できない理由があるときは、何もしない
    if (savedId === null || recordNote !== "") {
      return;
    }

    // 最高点と比べて、上回っていたら記録する（楽譜が見つからないときなどは null が返る）
    const result = recordBestScore(savedId, points);
    if (result === null) {
      return;
    }

    // 画面の最高点と、「更新した直後かどうか」を入れ直す
    bestScore = result.bestScore;
    isNewRecord = result.isNewRecord;
  }

  // このページが画面に表示された直後に、保存された音律・判定のレベル・楽譜をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    temperamentId = loadTemperamentId();
    levelId = loadLevelId();
    openStringEnabled = loadOpenStringEnabled();
    modeId = loadModeId();

    // 作業中の楽譜を読み込む（保存されていないときは null が入り、何もしない）
    const savedScore = loadCurrentScore();
    if (savedScore !== null) {
      // 調（一覧にない id が保存されていた場合は、getKey がハ長調にしてくれる）
      keyId = getKey(savedScore.keyId).id;

      // 音部記号（入っていない古いデータのときは、アルト記号になる）（ビオラ版）
      clefId = getClef(savedScore.clefId).id;

      // テンポ
      tempo = savedScore.tempo;

      // 音の並び
      notes = savedScore.notes;

      // 保存した楽譜のどれを開いているかと、その名前
      savedId = savedScore.savedId;
      scoreName = savedScore.name;

      // 保存した楽譜を開いているときは、その最高点と、保存していない変更があるかどうかを調べる
      if (savedId !== null) {
        const libraryScore = getSavedScore(savedId);

        // 最高点（まだ無いとき・楽譜が見つからないときは null のまま）
        if (libraryScore !== null && typeof libraryScore.bestScore === "number") {
          bestScore = libraryScore.bestScore;
        }

        isUnsaved = hasUnsavedChanges({
          savedId: savedId,
          keyId: savedScore.keyId,
          clefId: savedScore.clefId,
          tempo: savedScore.tempo,
          temperamentId: temperamentId,
          notes: savedScore.notes,
        });
      }
    }

    // 読み込みが終わった
    isLoaded = true;
  });

  /**
   * 練習のモードを切り替える関数
   * 「じっくり」「通し」のボタンを押したときに呼ばれる。
   * 選んだモードに切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {string} id - 選んだモードの id（'step'：じっくり、'run'：通し）
   */
  function changeMode(id) {
    modeId = id;

    // ブラウザに保存する
    saveModeId(id);
  }

  /**
   * 判定のレベルを切り替える関数
   * 「ノーマル」「イージー」のボタンを押したときに呼ばれる。
   * 選んだレベルに切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {string} id - 選んだレベルの id（'normal'・'easy'）
   */
  function changeLevel(id) {
    // 選んだレベルに切り替える（これで、OK の範囲も自動で計算し直される）
    levelId = id;

    // ブラウザに保存する
    saveLevelId(id);
  }

  /**
   * 区間を選びはじめる関数
   * 区間の「変更」ボタンを押したときに呼ばれる。
   * 練習の部品の代わりに楽譜の全体を表示して、音符をタップできるようにする。
   */
  function openRangeSelector() {
    // まだ1回もタップしていない状態にしてから、選んでいる最中にする
    pendingIndex = null;
    isSelectingRange = true;
  }

  /**
   * 区間を選ぶのをやめる関数
   * 「キャンセル」ボタンを押したときに呼ばれる。区間は、選ぶ前のままにする。
   */
  function closeRangeSelector() {
    pendingIndex = null;
    isSelectingRange = false;
  }

  /**
   * 区間を選んでいる最中に、音符がタップされたときの処理をする関数
   * 1回目のタップで片方の端を覚え、2回目のタップで区間を決める。
   * @param {number} noteIndex - タップされた音が何番目か（0から始まる）
   */
  function handleRangeTap(noteIndex) {
    // 1回目のタップ：タップされた音を覚えて、2回目を待つ
    if (pendingIndex === null) {
      pendingIndex = noteIndex;
      return;
    }

    // 2回目のタップ：2つの音のうち、前にあるほうを始め、後ろにあるほうを終わりにする
    // （終わりの音を先にタップしても、正しい区間になるようにするため）
    const start = Math.min(pendingIndex, noteIndex);
    const end = Math.max(pendingIndex, noteIndex);

    if (start === 0 && end === notes.length - 1) {
      // 最初の音から最後の音までを選んだとき：「全体」と同じなので、区間を決めていない状態にする
      rangeStart = null;
      rangeEnd = null;
    } else {
      // それ以外：選んだ区間にする
      rangeStart = start;
      rangeEnd = end;
    }

    // 選ぶのを終わりにする
    closeRangeSelector();
  }

  /**
   * 区間を「全体」に戻す関数
   * 「全体に戻す」ボタンを押したときに呼ばれる。
   */
  function clearRange() {
    rangeStart = null;
    rangeEnd = null;
  }

  /**
   * 「開放弦の高さで弾いた音もOKにする」設定を切り替える関数
   * チェックボックスを押したときに呼ばれる。
   * 設定を切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {boolean} enabled - チェックが入っているかどうか（true：入っている）
   */
  function changeOpenStringEnabled(enabled) {
    openStringEnabled = enabled;

    // ブラウザに保存する
    saveOpenStringEnabled(enabled);
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る -->
  <title>練習｜ビオラ音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>練習</h1>
  </div>

  {#if !isLoaded}
    <!-- 楽譜を読み込むまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if notes.length === 0}
    <!-- 楽譜に音が1つもないとき：編集ページへ案内する -->
    <p class="message">楽譜に音がありません。先に音を入れてください。</p>
    <a class="link-button" href="/score">楽譜の編集へ</a>
  {:else}
    <!-- 楽譜の調と音律（編集ページで決めたものを表示するだけで、ここでは変えられない） -->
    <!-- 調と音律の表示と、指板の図へのリンクを横に並べる -->
    <div class="score-info-row">
      <!-- （ビオラ版：音部記号の名前も表示する） -->
      <p class="score-info">{getKeyLabel(currentKey)}・{getClef(clefId).name}・{currentTemperament.name}</p>

      <!-- 指板の図へのリンク。アドレスの最後に「?key=調の id」を付けて、楽譜の調を引き継ぐ -->
      <a class="fingerboard-link" href="/fingerboard?key={keyId}">指板で見る →</a>
    </div>

    <!-- 楽譜の名前と最高点：保存した楽譜を開いているときだけ表示する -->
    {#if savedId !== null}
      <ScoreTitle name={scoreName} {bestScore} {isNewRecord} {recordNote} />
    {/if}

    <!-- 練習する区間：今の区間の説明と、「変更」「全体に戻す」のボタンを横に並べる -->
    <div class="range-row">
      <span class="range-caption">区間</span>
      <span class="range-text">{rangeText}</span>

      <!-- 「全体に戻す」ボタン：区間を決めているときだけ表示する -->
      {#if rangeStart !== null}
        <button class="range-button" disabled={isSelectingRange} onclick={clearRange}> 全体に戻す </button>
      {/if}

      <!-- 「変更」ボタン：区間を選びはじめる（選んでいる最中は押せない） -->
      <button class="range-button" disabled={isSelectingRange} onclick={openRangeSelector}> 変更 </button>
    </div>

    <!-- くり返しの設定 -->
    <!-- label で囲むと、文字の部分を押してもチェックを切り替えられる -->
    <!-- bind:checked を付けると、チェックの状態と repeatEnabled の値が、いつも同じになる -->
    <label class="repeat-row">
      <input type="checkbox" bind:checked={repeatEnabled} />
      くり返す（最後の音まで行ったら、最初の音に戻る）
    </label>

    <!-- 練習のモードの切り替え：名前と短い説明を付けたボタンを横に並べる -->
    <div class="mode-row">
      {#each MODES as mode (mode.id)}
        <!-- 選択中のモードには selected クラスを付けて色を変える -->
        <button class="mode-button" class:selected={modeId === mode.id} onclick={() => changeMode(mode.id)}>
          <span class="mode-name">{mode.name}</span>
          <span class="mode-description">{mode.description}</span>
        </button>
      {/each}
    </div>

    <!-- 判定のレベルの切り替え（ノーマル・イージー） -->
    <div class="level-row">
      <span class="level-caption">判定</span>

      {#each LEVELS as level (level.id)}
        <!-- 選択中のレベルには selected クラスを付けて色を変える -->
        <!-- ボタンには、レベルの名前と、OK の範囲（±10 など）を表示する -->
        <button class="level-button" class:selected={levelId === level.id} onclick={() => changeLevel(level.id)}>
          {level.name}（±{level.tolerance}）
        </button>
      {/each}
    </div>

    <!-- 開放弦の設定：純正律のときだけ表示する -->
    {#if showsOpenStringSetting}
      <!-- チェックボックスと「？」ボタンを横に並べる -->
      <div class="open-string-row">
        <!-- label で囲むと、文字の部分を押してもチェックを切り替えられる -->
        <label class="open-string-label">
          <!-- event.currentTarget.checked は、押したあとにチェックが入っているかどうか -->
          <input type="checkbox" checked={openStringEnabled} onchange={(event) => changeOpenStringEnabled(event.currentTarget.checked)} />
          開放弦の高さで弾いた音もOKにする（ド3・ソ3・レ4・ラ4）
        </label>

        <!-- 「？」ボタン：押すたびに、説明を表示する・隠すを切り替える -->
        <!-- label の外に置いているのは、中に置くと、押したときにチェックまで切り替わってしまうため -->
        <!-- aria-label と aria-expanded は、読み上げで操作する人のための設定（ボタンの説明と、開いているかどうか） -->
        <button class="help-button" aria-label="開放弦の設定の説明" aria-expanded={showsOpenStringHelp} onclick={() => (showsOpenStringHelp = !showsOpenStringHelp)}> ？ </button>
      </div>

      <!-- 説明：「？」ボタンを押して、表示にしているときだけ出す -->
      {#if showsOpenStringHelp}
        <p class="help-text">
          開放弦（指で押さえない弦）は、調弦で高さが決まっていて、弾きながら変えられません。<br />
          純正律では、調によって、ド3・ソ3・レ4・ラ4 の「正しい高さ」が開放弦の高さと少し違うことがあります（最大で約24セント）。<br />
          チェックを入れると、この4つの音は、開放弦の高さで弾いても正解になります。隣の弦で純正律の高さで弾いても、もちろん正解です。
        </p>
      {/if}
    {/if}

    {#if isSelectingRange}
      <!-- 区間を選んでいる最中：練習の部品の代わりに、楽譜の全体を表示する -->
      <!-- （練習の部品は画面から消えるので、練習の途中だった場合は、マイクも自動で止まる） -->
      <div class="range-selector">
        <!-- 案内：1回目のタップの前と後で、文を変える -->
        <p class="range-guide">
          {#if pendingIndex === null}
            区間の<strong>始めの音</strong>をタップしてください
          {:else}
            区間の<strong>終わりの音</strong>をタップしてください（{pendingIndex + 1}番目から）
          {/if}
        </p>

        <!-- 楽譜の全体。1回目にタップした音は、選択中の青い帯で表示する -->
        <Staff {notes} signature={currentKey.signature} {clefId} selectedIndex={pendingIndex} onselect={handleRangeTap} />

        <!-- 選ぶのをやめるボタン -->
        <button class="range-cancel-button" onclick={closeRangeSelector}>キャンセル</button>
      </div>
    {:else}
      <!-- 選択中のモードの練習の部品を表示する -->
      <!-- モードを切り替えると、前のモードの部品は画面から消え、マイクも自動で止まる -->
      <!-- key で囲むと、rangeKey（区間の目印）が変わったときに、中の部品が作り直される -->
      <!-- （区間を変えたら、前の区間での進み具合や結果を消して、最初の音からやり直すため） -->
      {#key rangeKey}
        {#if modeId === "step"}
          <!-- 「じっくり」モード：練習する音・調・音律・OK の範囲・開放弦を OK にするかどうか・くり返すかどうかを渡す -->
          <!-- （ビオラ版：音部記号も渡す） -->
          <StepPractice notes={practiceNotes} {currentKey} {temperamentId} {tolerance} {allowOpenString} {repeatEnabled} {clefId} />
        {:else}
          <!-- 「通し」モード：練習する音・調・最初のテンポ・音律・OK の範囲・開放弦を OK にするかどうか・くり返すかどうかを渡す -->
          <!-- ontempochange：「通し」の中でテンポを変えたら、このページの tempo も同じ値にする -->
          <!-- （区間やモードを変えて部品を作り直しても、変えたテンポのまま始められるようにするため） -->
          <RunPractice
            notes={practiceNotes}
            {currentKey}
            {clefId}
            initialTempo={tempo}
            {temperamentId}
            {tolerance}
            {allowOpenString}
            {repeatEnabled}
            ontempochange={(value) => (tempo = value)}
            onfinish={handleRunFinish}
          />
        {/if}
      {/key}
    {/if}

    <!-- 編集ページへのリンク -->
    <a class="edit-link" href="/score">楽譜を編集する</a>
  {/if}
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
    margin-bottom: 8px;
  }

  /* ホームへ戻るリンク */
  .back-link {
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 「読み込み中」「楽譜に音がありません」などのメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* 編集ページへ案内するリンク（ボタンのような見た目にする） */
  .link-button {
    display: block;
    padding: 12px;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }

  /* 楽譜の調と音律：小さくグレーで表示する */
  .score-info {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 調と音律の表示と、指板の図へのリンクを横に並べる（表示は左、リンクは右） */
  .score-info-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  /* 指板の図へのリンク：小さな青い文字。途中で折り返さない */
  .fingerboard-link {
    flex-shrink: 0;
    font-size: 0.85rem;
    color: #1976d2;
    text-decoration: none;
    white-space: nowrap;
  }

  /* 練習する区間の行：「区間」の文字・今の区間・ボタンを横に並べる */
  .range-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* 「区間」の文字 */
  .range-caption {
    font-size: 0.85rem;
    color: #616161;
    flex-shrink: 0;
  }

  /* 今の区間の説明：残りの横幅を使って、ボタンを右に寄せる */
  .range-text {
    flex: 1;
    font-size: 0.95rem;
    /* 数字の幅をそろえる */
    font-variant-numeric: tabular-nums;
  }

  /* 区間の「変更」「全体に戻す」ボタン：白地に青い枠の、小さめのボタン */
  button.range-button {
    flex-shrink: 0;
    padding: 6px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 押せない状態のボタン：薄く表示する */
  button.range-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* くり返しの設定：チェックボックスと文字を横に並べ、小さくグレーで表示する */
  .repeat-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    font-size: 0.85rem;
    color: #616161;
    cursor: pointer;
  }

  /* 区間を選ぶエリア：薄い青の枠で囲んで、ふだんの練習の画面と違うことが分かるようにする */
  .range-selector {
    margin-top: 12px;
    padding: 8px;
    border: 2px solid #90caf9;
    border-radius: 8px;
  }

  /* 区間を選ぶときの案内の文 */
  .range-guide {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
  }

  /* 案内の中の強調する部分（「始めの音」「終わりの音」）：青い太字にする */
  .range-guide strong {
    color: #0d47a1;
  }

  /* 「キャンセル」ボタン：横幅いっぱいの、グレーの枠のボタン */
  button.range-cancel-button {
    width: 100%;
    margin-top: 4px;
    padding: 8px 0;
    font-size: 0.9rem;
    color: #616161;
    background-color: white;
    border: 2px solid #9e9e9e;
  }

  /* 練習のモードの切り替え：2つのボタンを横に並べる */
  .mode-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  /* ボタン共通 */
  button {
    border-radius: 8px;
    cursor: pointer;
  }

  /* モードのボタン（選択前）：白地に青い枠。名前と説明を縦に並べる */
  button.mode-button {
    /* 2つのボタンで横幅を半分ずつ使う。flex: 1 だけだと中の文字の長さで幅が変わるので、基準の幅を 0 にする */
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* モードのボタン（選択中）：青く塗る */
  button.mode-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* モードの名前：大きめの太字 */
  .mode-name {
    font-size: 1.1rem;
    font-weight: bold;
  }

  /* モードの説明：小さい字 */
  .mode-description {
    font-size: 0.75rem;
  }

  /* 判定のレベルの切り替え：「判定」の文字と、2つのボタンを横に並べる */
  .level-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* 「判定」の文字 */
  .level-caption {
    font-size: 0.85rem;
    color: #616161;
    flex-shrink: 0;
  }

  /* レベルのボタン（選択前）：白地に青い枠。小さめにする */
  button.level-button {
    flex: 1;
    padding: 6px 0;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* レベルのボタン（選択中）：青く塗る */
  button.level-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 開放弦の設定の行：チェックボックスの部分と「？」ボタンを横に並べる */
  .open-string-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  /* チェックボックスと文字：横に並べ、小さくグレーで表示する */
  .open-string-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    color: #616161;
    cursor: pointer;
  }

  /* 「？」ボタン：小さな丸いボタンにする */
  button.help-button {
    /* 横幅が足りないときも、つぶれて楕円にならないようにする */
    flex-shrink: 0;
    width: 26px;
    height: 26px;
    padding: 0;
    font-size: 0.85rem;
    font-weight: bold;
    line-height: 1;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    /* 50% にすると、正方形が丸になる */
    border-radius: 50%;
  }

  /* 説明の文章：薄い青の地に、小さめの文字で表示する */
  .help-text {
    margin: 6px 0 0 0;
    padding: 8px 10px;
    font-size: 0.8rem;
    line-height: 1.6;
    color: #424242;
    background-color: #e3f2fd;
    border-radius: 8px;
  }

  /* 編集ページへのリンク：小さく、右に寄せて表示する */
  .edit-link {
    display: block;
    margin-top: 16px;
    color: #1976d2;
    font-size: 0.9rem;
    text-align: right;
    text-decoration: none;
  }
</style>
