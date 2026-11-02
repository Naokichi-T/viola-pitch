<script>
  // 「読み込んだ楽譜」のページ（ステップA-1a）
  // ［MusicXMLを読み込む］でファイルを選ぶと、読み込むときの窓を出し、［読み込む］で保存して一覧に足す。
  // 読み込んだ楽譜は練習専用（編集ページでは直さない）。手で入力した楽譜（「保存した楽譜」のページ）とは別に並べる。
  // （ステップA-1b：同じ名前のときの上書き・別に追加、並び替え、削除、MusicXML を作れるアプリの紹介を足した）
  // （ステップA-2：楽譜ごとに［練習］ボタンを足した。押すと練習ページ /imported/practice?id=○○ が開く）
  // （ステップC-1：最高点を「最高点（音程）」として出すようにした（bestPitchScore））
  // （ステップD：リズムの最高点（bestRhythmScore）も並べて出すようにした）

  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount } from "svelte";

  // MusicXML のファイルを読む関数・楽譜データにする関数・ファイル名からタイトルを作る関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { readMusicXMLFile, musicXMLToScore, titleFromFileName } from "#lib/musicxml/musicxmlImport.js";

  // 読み込んだ楽譜の一覧を読み込む関数・新しく足す関数・上書きする関数・削除する関数・名前に (2) を付ける関数を読み込む
  import { loadImportedScores, addImportedScore, replaceImportedScore, deleteImportedScore, getUniqueName } from "#lib/imported.js";

  // 調のデータを探す関数と、調の名前を作る関数を読み込む
  import { getKey, getKeyLabel } from "#lib/key.js";

  // 読み込むときの窓の部品を読み込む
  import ImportDialog from "#lib/ImportDialog.svelte";

  // ===== 並び順に関する設定値（ステップA-1b） =====

  // 選べる並び順の一覧
  //   id   ：並び順を区別するための名前
  //   name ：画面に表示する名前
  const SORTS = [
    { id: "newest", name: "読み込んだ日の新しい順" },
    { id: "oldest", name: "読み込んだ日の古い順" },
    { id: "name", name: "名前順" },
  ];

  // ===== MusicXML を作れるアプリの紹介（ステップA-1b） =====
  //   name ：アプリの名前
  //   url  ：アプリのページのアドレス
  //   text ：ひとことの説明
  const MAKER_APPS = [
    { name: "MuseScore", url: "https://musescore.org/ja", text: "無料の楽譜作成ソフト（パソコン用）" },
    { name: "Flat", url: "https://flat.io/ja", text: "ブラウザやアプリで使える楽譜作成サービス" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 読み込んだ楽譜の一覧。画面に表示された後で、ブラウザから読み込む
  let scores = $state([]);

  // 一覧の読み込みが終わったかどうか（true：終わった）
  // 読み込む前に「まだありません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 窓に渡す、ファイルから読み込んだ楽譜の情報 { score, warnings }。窓を出していないときは null
  let pending = $state(null);

  // ファイルを読んでいる最中かどうか（true：読んでいる。大きいファイルだと少し時間がかかるため）
  let isReading = $state(false);

  // エラーメッセージ（ファイルが読めなかったときなどに表示する）
  let errorMessage = $state("");

  // 読み込みが終わったときのメッセージ（「○○を読み込みました」）
  let doneMessage = $state("");

  // ファイルを選ぶための部品（画面には出さず、ボタンを押したときに、この部品を押したことにする）
  // bind:this を付けると、この変数に部品そのものが入る
  let fileInput = $state(null);

  // 選択中の並び順の id（最初は、読み込んだ日の新しい順）（ステップA-1b）
  let sortId = $state("newest");

  // 並び順に合わせて並べ替えた一覧（ステップA-1b：並び順を選べるようにした）
  // $derived.by を付けると、scores か sortId が変わるたびに、自動で並べ替え直される
  let sortedScores = $derived.by(() => {
    // 元の配列を変えないように、コピーしてから並べ替える
    const copy = [...scores];

    if (sortId === "name") {
      // 名前順：日本語の並び順で比べる
      // numeric: true を付けると、名前の中の数字を「数」として比べる（「2」が「10」より前になる）
      copy.sort((a, b) => a.name.localeCompare(b.name, "ja", { numeric: true }));
    } else if (sortId === "oldest") {
      // 古い順：読み込んだ日時（数字）の小さいほうを前にする
      copy.sort((a, b) => a.importedAt - b.importedAt);
    } else {
      // 新しい順：読み込んだ日時（数字）の大きいほうを前にする
      copy.sort((a, b) => b.importedAt - a.importedAt);
    }

    return copy;
  });

  // このページが画面に表示された直後に、読み込んだ楽譜の一覧をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    scores = loadImportedScores();
    isLoaded = true;
  });

  /**
   * 読み込んだ日時を、表示用の文字にする関数
   * @param {number} importedAt - 読み込んだ日時（ミリ秒の数字）
   * @returns {string} 表示用の文字（例：'2026/10/18 05:07'）。日時が入っていないときは空の文字
   */
  function formatDate(importedAt) {
    // 数字でないとき（日時が入っていないとき）は、何も表示しない
    if (typeof importedAt !== "number") {
      return "";
    }

    const date = new Date(importedAt);

    // 月・日・時・分は、1けたのときに頭に 0 を付けて2けたにする（padStart は、足りない分を埋める命令）
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");

    return year + "/" + month + "/" + day + " " + hours + ":" + minutes;
  }

  /**
   * ［MusicXMLを読み込む］ボタンを押したときに呼ばれる関数
   * 画面に出していない「ファイルを選ぶ部品」を押したことにして、ファイルを選ぶ画面を出す。
   */
  function chooseFile() {
    errorMessage = "";
    doneMessage = "";
    fileInput.click();
  }

  /**
   * ファイルが選ばれたときに呼ばれる関数
   * ファイルを読んで楽譜データにし、読み込むときの窓を出す。
   * @param {Event} event - ファイルを選んだときの出来事（どのファイルを選んだかが入っている）
   */
  async function handleFileChange(event) {
    // 選ばれたファイル（選ばずに閉じたときは、何もしない）
    const file = event.currentTarget.files[0];
    if (!file) {
      return;
    }

    // 同じファイルをもう一度選んでも「選ばれた」と分かるように、選んだ記録を消しておく
    event.currentTarget.value = "";

    isReading = true;
    try {
      // ファイルから MusicXML の文字を取り出す（.mxl なら解凍する）
      // await は「終わるまで待つ」という意味
      const text = await readMusicXMLFile(file);

      // MusicXML の文字を、楽譜作成アプリの形の楽譜データにする（タイトルがなければ、ファイル名をタイトルにする）
      const { score, warnings } = musicXMLToScore(text, titleFromFileName(file.name));

      // 窓を出す
      pending = { score: score, warnings: warnings };
    } catch (error) {
      // 読めなかったとき（MusicXML ではないファイルなど）。メッセージは読み込みの関数が日本語にしてくれている
      errorMessage = error.message;
    } finally {
      // うまくいっても、いかなくても、読んでいる最中の印を消す
      isReading = false;
    }
  }

  /**
   * 窓で読み込むことが決まったときに呼ばれる関数
   * 楽譜を保存して（新しく足すか、上書きするか）、一覧を読み込み直す。
   * （ステップA-1b：上書きと、同じ名前のときに (2) などを付けて足すのを入れた）
   * @param {{record: object, action: string, targetId: string|null}} result - 窓から渡されたもの
   *   record：保存する楽譜の形、action：'add'（新しく足す）か 'overwrite'（上書き）、targetId：上書きする楽譜の id
   */
  function handleConfirm(result) {
    let saved;
    if (result.action === "overwrite") {
      // 上書き：同じ名前の楽譜を入れ替える
      saved = replaceImportedScore(result.targetId, result.record);
    } else {
      // 新しく足す：同じ名前があれば、名前のうしろに (2) などを付ける
      saved = addImportedScore({ ...result.record, name: getUniqueName(result.record.name) });
    }

    // 窓を閉じる
    pending = null;

    // 保存できなかったとき（保存領域がいっぱいのときなど）
    if (saved === null) {
      errorMessage = "保存できませんでした。ブラウザの保存領域がいっぱいかもしれません。";
      return;
    }

    // 一覧を読み込み直して、終わったことを知らせる
    scores = loadImportedScores();
    doneMessage = "「" + saved.name + "」を" + (result.action === "overwrite" ? "上書きしました。" : "読み込みました。");
  }

  /**
   * 読み込んだ楽譜を削除する関数（ステップA-1b）
   * 「削除」ボタンを押したときに呼ばれる。押し間違いを防ぐために、先に確認する。
   * @param {object} score - 削除する楽譜
   */
  function removeScore(score) {
    // 確認の画面を出す（「キャンセル」を押すと、何もせずに終わる）
    if (!confirm("「" + score.name + "」を削除します。元に戻せません。よろしいですか？")) {
      return;
    }

    // 一覧から削除して、画面の一覧を読み込み直す
    deleteImportedScore(score.id);
    scores = loadImportedScores();

    // 前のメッセージ（「○○を読み込みました」など）は消す
    doneMessage = "";
  }

  /**
   * 窓で［やめる］を押したときに呼ばれる関数
   * 何も保存せずに、窓を閉じる。
   */
  function handleCancel() {
    pending = null;
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る -->
  <title>読み込んだ楽譜｜ビオラ音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>読み込んだ楽譜</h1>
  </div>

  <!-- このページでできることの説明：音程に加えて、リズムも判定することを伝える -->
  <p class="lead">MusicXML の楽譜を読み込んで練習できます。「じっくり」では1音ずつ音程を、「通し」ではテンポに合わせて弾いた音程とリズム（弾き始めのタイミング）を判定して、点数を出します。</p>

  <!-- 読み込むボタン（ファイルを読んでいる最中は押せない） -->
  <button class="import-button" disabled={isReading} onclick={chooseFile}>
    {isReading ? "読み込み中…" : "MusicXMLを読み込む"}
  </button>

  <!-- ファイルを選ぶ部品（画面には出さない）。accept は付けない -->
  <!-- （iPhone では、accept に .musicxml などを書くと、ファイルが選べない灰色になることがあるため。中身で見分ける） -->
  <input class="file-input" type="file" bind:this={fileInput} onchange={handleFileChange} />

  <!-- 説明：どんなファイルを読み込めるか -->
  <p class="hint">楽譜作成アプリなどで書き出した MusicXML（.musicxml・.xml・.mxl）を選んでください。</p>

  <!-- MusicXML を作れるアプリの紹介（ステップA-1b） -->
  <!-- まだ1つも読み込んでいないときは開いておき、読み込んだ楽譜があるときは閉じておく（一覧が下に追いやられないように） -->
  <details class="makers" open={isLoaded && scores.length === 0}>
    <summary>MusicXML の楽譜の作り方</summary>

    <!-- 姉妹アプリ -->
    <div class="maker sister">
      <p class="maker-name">
        <!-- target="_blank" で新しいタブに開く。rel="noopener" は、開いた先のページからこのページを操作されないようにするための決まり文句 -->
        <a href="https://string-score.vercel.app/" target="_blank" rel="noopener">string-score</a>
        <span class="sister-mark">姉妹アプリ</span>
      </p>
      <p class="maker-text">弦楽器の楽譜作成アプリ。ブラウザで楽譜を入力・再生でき、MusicXML で書き出せます（パソコン・タブレット向け）。</p>
      <!-- 無料・アカウント登録不要であることを、目立つ札で出す（ステップA-1b） -->
      <p class="maker-tags">
        <span class="maker-tag">無料</span>
        <span class="maker-tag">アカウント登録不要</span>
      </p>
    </div>

    <!-- そのほかのアプリ -->
    <p class="maker-lead">ほかの楽譜作成アプリで作った楽譜も読み込めます。たとえば：</p>
    <ul class="maker-list">
      {#each MAKER_APPS as app (app.name)}
        <li>
          <a href={app.url} target="_blank" rel="noopener">{app.name}</a>
          <span class="maker-text">：{app.text}</span>
        </li>
      {/each}
    </ul>
    <p class="maker-note">MusicXML で書き出せるアプリなら、ほかのものでも使えます（書き出しのやり方や、使える機能は、アプリやプランによって違います）。</p>
  </details>

  <!-- エラーメッセージ：エラーがあるときだけ表示する -->
  {#if errorMessage !== ""}
    <p class="error">{errorMessage}</p>
  {/if}

  <!-- 読み込みが終わったときのメッセージ -->
  {#if doneMessage !== ""}
    <p class="done">{doneMessage}</p>
  {/if}

  {#if !isLoaded}
    <!-- 一覧を読み込むまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if scores.length === 0}
    <!-- 1つも読み込んでいないとき -->
    <p class="message">読み込んだ楽譜はまだありません。</p>
  {:else}
    <!-- 件数と、並び順のメニューを横に並べる（ステップA-1b：並び順のメニューを足した） -->
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
        <li class="score-item">
          <!-- 楽譜の名前と説明 -->
          <div class="score-text">
            <!-- 楽譜の名前 -->
            <p class="score-name">{score.name}</p>

            <!-- 調・読み込んだ日時 -->
            <p class="score-detail">{getKeyLabel(getKey(score.keyId))}・{formatDate(score.importedAt)}</p>

            <!-- 「通し」の最高点：記録があるときだけ表示する（ステップC-1 は音程、ステップD でリズムも足した） -->
            {#if typeof score.bestPitchScore === "number" || typeof score.bestRhythmScore === "number"}
              <p class="score-detail best">
                最高点
                {#if typeof score.bestPitchScore === "number"}
                  音程 {score.bestPitchScore}点
                {/if}
                {#if typeof score.bestRhythmScore === "number"}
                  ・リズム {score.bestRhythmScore}点
                {/if}
              </p>
            {/if}
          </div>

          <!-- 練習・削除のボタンを縦に並べる（削除はステップA-1b、練習はステップA-2） -->
          <div class="score-buttons">
            <!-- 練習ページへのリンク（ボタンのような見た目にする）。URL の id で、どの楽譜を開くかを伝える -->
            <a class="practice-button" href={"/imported/practice?id=" + score.id}>練習</a>
            <button class="delete-button" onclick={() => removeScore(score)}>削除</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<!-- 読み込むときの窓：ファイルを読み終わったら出す -->
{#if pending !== null}
  <ImportDialog score={pending.score} warnings={pending.warnings} onconfirm={handleConfirm} oncancel={handleCancel} />
{/if}

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
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 読み込むボタン：横幅いっぱいの青いボタン */
  .import-button {
    display: block;
    width: 100%;
    padding: 14px;
    font-size: 1.1rem;
    color: white;
    background-color: #1976d2;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  .import-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ファイルを選ぶ部品：画面には出さない */
  .file-input {
    display: none;
  }

  /* 説明：小さくグレーで表示する */
  /* ページの説明：見出しと読み込むボタンの間に置く */
  .lead {
    margin: 0 0 12px 0;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #424242;
  }

  .hint {
    margin: 6px 0 0 0;
    font-size: 0.8rem;
    color: #757575;
  }

  /* エラーメッセージ：赤い字 */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* 読み込みが終わったときのメッセージ：緑の字 */
  .done {
    margin: 12px 0 0 0;
    color: #2e7d32;
  }

  /* 「読み込み中」「まだありません」などのメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* MusicXML の楽譜の作り方（開け閉めできる枠）（ステップA-1b） */
  .makers {
    margin: 12px 0 0 0;
    padding: 8px 10px;
    font-size: 0.85rem;
    line-height: 1.6;
    color: #424242;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  /* 「MusicXML の楽譜の作り方」の文字：押せることが分かるように、カーソルを指の形にする */
  .makers summary {
    cursor: pointer;
    color: #1976d2;
  }

  /* アプリの紹介1つぶん（姉妹アプリ）：うすい青の地にする */
  .maker.sister {
    margin: 8px 0 0 0;
    padding: 6px 8px;
    background-color: #e3f2fd;
    border-radius: 6px;
  }

  /* アプリの名前の行 */
  .maker-name {
    margin: 0;
    font-weight: bold;
  }

  /* 「姉妹アプリ」の印：小さな青い札 */
  .sister-mark {
    margin-left: 4px;
    padding: 1px 6px;
    font-size: 0.7rem;
    font-weight: normal;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
  }

  /* アプリの説明 */
  .maker-text {
    margin: 0;
  }

  /* 「無料」「アカウント登録不要」の札を横に並べる（ステップA-1b） */
  .maker-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin: 4px 0 0 0;
  }

  /* 札1つぶん：白地に緑の枠と字 */
  .maker-tag {
    padding: 1px 8px;
    font-size: 0.75rem;
    color: #2e7d32;
    background-color: white;
    border: 1px solid #2e7d32;
    border-radius: 8px;
  }

  /* 「ほかの楽譜作成アプリで…」の文 */
  .maker-lead {
    margin: 8px 0 0 0;
  }

  /* ほかのアプリの一覧：左の字下げを小さめにする */
  .maker-list {
    margin: 2px 0 0 0;
    padding-left: 1.4em;
  }

  /* 紹介の中のリンク */
  .makers a {
    color: #1976d2;
  }

  /* 「MusicXML で書き出せるアプリなら…」の注意：小さくグレーで表示する */
  .maker-note {
    margin: 6px 0 0 0;
    font-size: 0.75rem;
    color: #757575;
  }

  /* 件数と、並び順のメニューを横に並べる（ステップA-1b） */
  .sort-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 20px 0 0 0;
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

  /* 楽譜1つぶん：名前などの文字と、ボタンを横に並べる（ステップA-1b：ボタンを足したので横並びにした） */
  .score-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
  }

  /* 名前などの文字：残りの横幅を使う */
  .score-text {
    flex: 1;
    /* min-width: 0 を付けると、名前が長くても、ボタンを押し出さずに折り返す */
    min-width: 0;
  }

  /* 練習・削除のボタンを縦に並べる */
  .score-buttons {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }

  /* 「練習」ボタン：青（リンクだが、ボタンのような見た目にする）（ステップA-2） */
  .practice-button {
    padding: 6px 14px;
    font-size: 0.9rem;
    color: white;
    background-color: #1976d2;
    border: 2px solid #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }

  /* 「削除」ボタン：白地に赤い枠（押し間違えると困るので、目立たせすぎない） */
  .delete-button {
    padding: 6px 14px;
    font-size: 0.9rem;
    color: #c62828;
    background-color: white;
    border: 1px solid #c62828;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 楽譜の名前：太字。長いときは折り返す */
  .score-name {
    margin: 0;
    font-size: 1rem;
    font-weight: bold;
    /* 英数字が長く続く名前でも、枠からはみ出さずに折り返す */
    overflow-wrap: anywhere;
  }

  /* 調・読み込んだ日時：小さくグレーで表示する */
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
</style>
