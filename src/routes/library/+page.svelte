<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // 保存した楽譜の一覧を読み込む関数、削除する関数、保存していない変更があるかを調べる関数を読み込む
  import { loadSavedScores, deleteSavedScore, hasUnsavedChanges } from "#lib/library.js";

  // 作業中の楽譜を読み込む関数・保存する関数と、音律を読み込む関数・保存する関数を読み込む
  import { loadCurrentScore, saveCurrentScore, loadTemperamentId, saveTemperamentId } from "#lib/settings.js";

  // 調のデータを探す関数と、調の名前を作る関数を読み込む
  import { getKey, getKeyLabel } from "#lib/key.js";

  // 音律のデータを探す関数を読み込む
  import { getTemperament } from "#lib/tuning.js";

  // ===== 並び順に関する設定値 =====

  // 選べる並び順の一覧
  //   id   ：並び順を区別するための名前
  //   name ：画面に表示する名前
  const SORTS = [
    { id: "newest", name: "保存日の新しい順" },
    { id: "oldest", name: "保存日の古い順" },
    { id: "name", name: "名前順" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 保存した楽譜の一覧。画面に表示された後で、ブラウザから読み込む
  let scores = $state([]);

  // 読み込みが終わったかどうか（true：終わった）
  // 読み込む前に「まだありません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 選択中の並び順の id（最初は、保存日の新しい順）
  let sortId = $state("newest");

  // 作業中の楽譜が、保存した楽譜のどれを開いているか（その id）。どれも開いていないときは null
  // 一覧の中で「編集中」の印を付けるために使う
  let currentSavedId = $state(null);

  // 並び順に合わせて並べ替えた一覧
  // $derived.by を付けると、scores か sortId が変わるたびに、自動で並べ替え直される
  let sortedScores = $derived.by(() => {
    // 元の配列を変えないように、コピーしてから並べ替える
    const copy = [...scores];

    if (sortId === "name") {
      // 名前順：日本語の並び順で比べる
      // numeric: true を付けると、名前の中の数字を「数」として比べる（「2」が「10」より前になる）
      copy.sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
    } else if (sortId === "oldest") {
      // 保存日の古い順：保存した日時（数字）の小さいほうを前にする
      copy.sort((a, b) => a.savedAt - b.savedAt);
    } else {
      // 保存日の新しい順：保存した日時（数字）の大きいほうを前にする
      copy.sort((a, b) => b.savedAt - a.savedAt);
    }

    return copy;
  });

  // このページが画面に表示された直後に、保存した楽譜の一覧をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    scores = loadSavedScores();

    // 作業中の楽譜が、どの保存した楽譜を開いているかを調べる
    const currentScore = loadCurrentScore();
    if (currentScore !== null) {
      currentSavedId = currentScore.savedId;
    }

    isLoaded = true;
  });

  /**
   * 保存した日時を、表示用の文字にする関数
   * @param {number} savedAt - 保存した日時（ミリ秒の数字）
   * @returns {string} 表示用の文字（例：'2026/10/06 05:07'）。日時が入っていないときは空の文字
   */
  function formatDate(savedAt) {
    // 数字でないとき（古いデータなどで日時が入っていないとき）は、何も表示しない
    if (typeof savedAt !== "number") {
      return "";
    }

    const date = new Date(savedAt);

    // 月・日・時・分は、1けたのときに頭に 0 を付けて2けたにする（padStart は、足りない分を埋める命令）
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return year + "/" + month + "/" + day + " " + hours + ":" + minutes;
  }

  /**
   * 保存した楽譜を開く関数
   * 「開く」ボタンを押したときに呼ばれる。
   * 作業中の楽譜をこの楽譜に入れ替え、音律もこの楽譜のものに切り替えてから、編集ページへ移る。
   * @param {object} score - 開く楽譜
   */
  function openScore(score) {
    // 確認の文を作る。今編集中の楽譜を開くときと、別の楽譜を開くときで、文を変える
    let confirmText;
    if (score.id === currentSavedId) {
      // 編集中の楽譜を開く：最後に「保存」を押したときの状態に戻ることになる
      confirmText = "「" + score.name + "」を、最後に保存したときの状態に戻します。そのあとに加えた変更は消えます。よろしいですか？";
    } else {
      // 別の楽譜を開く：今編集中の楽譜は閉じることになる
      confirmText = "「" + score.name + "」を開きます。今編集中の楽譜は閉じます（保存していない変更は消えます）。よろしいですか？";
    }

    // 作業中の楽譜に、保存していない変更があるかどうかを調べる
    // （音律は作業中の楽譜とは別に保存してあるので、読み込んで一緒に渡す）
    const currentScore = loadCurrentScore();
    const isUnsaved =
      currentScore !== null &&
      hasUnsavedChanges({
        savedId: currentScore.savedId,
        keyId: currentScore.keyId,
        tempo: currentScore.tempo,
        temperamentId: loadTemperamentId(),
        notes: currentScore.notes,
      });

    // 保存していない変更があるときだけ、消えてしまう前に確認する（「キャンセル」を押すと、何もせずに終わる）
    if (isUnsaved && !confirm(confirmText)) {
      return;
    }

    // 作業中の楽譜を、この楽譜の内容に入れ替える
    // savedId と name も入れておくので、編集ページで「保存」を押すと、この楽譜に上書きされる
    saveCurrentScore({
      keyId: score.keyId,
      tempo: score.tempo,
      notes: score.notes,
      savedId: score.id,
      name: score.name,
    });

    // 音律を、この楽譜を保存したときの音律に切り替える
    saveTemperamentId(score.temperamentId);

    // 編集ページへ移る（location.href に行き先を入れると、そのページが開く）
    location.href = "/score";
  }

  /**
   * 保存した楽譜を削除する関数
   * 「削除」ボタンを押したときに呼ばれる。押し間違いを防ぐために、先に確認する。
   * @param {object} score - 削除する楽譜
   */
  function removeScore(score) {
    // 確認の画面を出す（「キャンセル」を押すと、何もせずに終わる）
    if (!confirm("「" + score.name + "」を削除します。元に戻せません。よろしいですか？")) {
      return;
    }

    // 一覧から削除する
    deleteSavedScore(score.id);

    // 作業中の楽譜がこの楽譜を開いていたときは、「まだ保存していない楽譜」に戻す
    // （音の並びは残す。次に「保存」を押すと、名前を聞かれる）
    if (currentSavedId === score.id) {
      const currentScore = loadCurrentScore();
      if (currentScore !== null) {
        saveCurrentScore({
          keyId: currentScore.keyId,
          tempo: currentScore.tempo,
          notes: currentScore.notes,
          savedId: null,
          name: "",
        });
      }
      currentSavedId = null;
    }

    // 画面の一覧を、削除した後のものに読み込み直す
    scores = loadSavedScores();
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る -->
  <title>保存した楽譜｜ビオラ音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>保存した楽譜</h1>
  </div>

  {#if !isLoaded}
    <!-- 一覧を読み込むまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if scores.length === 0}
    <!-- 1つも保存していないとき：編集ページへ案内する -->
    <p class="message">保存した楽譜はまだありません。楽譜の編集ページの「保存」で保存できます。</p>
    <a class="link-button" href="/score">楽譜の編集へ</a>
  {:else}
    <!-- 件数と、並び順のメニューを横に並べる -->
    <div class="sort-row">
      <span class="count">{scores.length}件</span>

      <!-- 並び順のメニュー。bind:value を付けると、選んだ並び順の id が sortId に自動で入る -->
      <!-- aria-label は、読み上げで操作する人のための、メニューの説明 -->
      <select class="sort-select" aria-label="並び順" bind:value={sortId}>
        {#each SORTS as sort (sort.id)}
          <option value={sort.id}>{sort.name}</option>
        {/each}
      </select>
    </div>

    <!-- 楽譜の一覧 -->
    <ul class="score-list">
      <!-- 並べ替えた一覧から、楽譜を1つずつ取り出して表示する -->
      {#each sortedScores as score (score.id)}
        <!-- 作業中の楽譜が開いている楽譜には current クラスを付けて、枠の色を変える -->
        <li class="score-item" class:current={score.id === currentSavedId}>
          <!-- 楽譜の名前と説明 -->
          <div class="score-text">
            <p class="score-name">
              {score.name}
              <!-- 作業中の楽譜が開いている楽譜には、「編集中」の印を付ける -->
              {#if score.id === currentSavedId}
                <span class="current-mark">編集中</span>
              {/if}
            </p>

            <!-- 調・音律 -->
            <p class="score-detail">{getKeyLabel(getKey(score.keyId))}・{getTemperament(score.temperamentId).name}</p>

            <!-- 音の数・テンポ・保存した日時 -->
            <p class="score-detail">{score.notes.length}音・♩＝{score.tempo}・{formatDate(score.savedAt)}</p>

            <!-- 「通し」の最高点：記録があるときだけ表示する -->
            {#if typeof score.bestScore === "number"}
              <p class="score-detail best">最高点 {score.bestScore}点</p>
            {/if}
          </div>

          <!-- 開く・削除のボタンを縦に並べる -->
          <div class="score-buttons">
            <button class="open-button" onclick={() => openScore(score)}>開く</button>
            <button class="delete-button" onclick={() => removeScore(score)}>削除</button>
          </div>
        </li>
      {/each}
    </ul>
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

  /* 「読み込み中」「まだありません」などのメッセージ */
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

  /* 件数と、並び順のメニューを横に並べる */
  .sort-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* 件数：残りの横幅を使って、メニューを右に寄せる */
  .count {
    flex: 1;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 並び順のメニュー：指で押しやすい大きさにする */
  .sort-select {
    padding: 8px 4px;
    font-size: 0.95rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 楽譜の一覧：縦に並べる */
  .score-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0 0 0;
    padding: 0;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 楽譜1つぶん：名前などの文字と、ボタンを横に並べる */
  .score-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
  }

  /* 作業中の楽譜が開いている楽譜：枠を青くする */
  .score-item.current {
    border-color: #1976d2;
    background-color: #e3f2fd;
  }

  /* 名前などの文字：残りの横幅を使う */
  .score-text {
    flex: 1;
    /* min-width: 0 を付けると、名前が長くても、ボタンを押し出さずに折り返す */
    min-width: 0;
  }

  /* 楽譜の名前：太字。長いときは折り返す */
  .score-name {
    margin: 0;
    font-size: 1rem;
    font-weight: bold;
    /* 英数字が長く続く名前でも、枠からはみ出さずに折り返す */
    overflow-wrap: anywhere;
  }

  /* 「編集中」の印：小さな青い札 */
  .current-mark {
    margin-left: 4px;
    padding: 1px 6px;
    font-size: 0.7rem;
    font-weight: normal;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    /* 印の途中で折り返さない */
    white-space: nowrap;
  }

  /* 調・音律・音の数・テンポ・保存した日時：小さくグレーで表示する */
  .score-detail {
    margin: 2px 0 0 0;
    font-size: 0.8rem;
    color: #616161;
    /* 数字の幅をそろえる */
    font-variant-numeric: tabular-nums;
  }

  /* 最高点：緑の字にする */
  .score-detail.best {
    color: #2e7d32;
  }

  /* 開く・削除のボタンを縦に並べる */
  .score-buttons {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }

  /* ボタン共通 */
  button {
    padding: 6px 14px;
    font-size: 0.9rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 「開く」ボタン：青 */
  button.open-button {
    color: white;
    background-color: #1976d2;
    border: 2px solid #1976d2;
  }

  /* 「削除」ボタン：白地に赤い枠（押し間違えると困るので、目立たせすぎない） */
  button.delete-button {
    color: #c62828;
    background-color: white;
    border: 1px solid #c62828;
  }
</style>
