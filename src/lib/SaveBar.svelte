<script>
  // 楽譜の名前の表示と、「保存」「新規」「別の名前で保存」のボタンをまとめた部品
  // 楽譜の編集ページの上のほうに置いて使う。
  // 保存していない変更があるときは、名前の横に「変更あり」の印を付ける。

  // onDestroy：この部品が画面から消えるときに後片付けをするための仕組み
  import { onDestroy } from "svelte";

  // 保存した楽譜の一覧を扱う関数を読み込む
  import { loadSavedScores, isNameUsed, addSavedScore, updateSavedScore, hasUnsavedChanges } from "#lib/library.js";

  // この部品を使う側（編集ページ）から受け取る値
  // keyId         ：楽譜の調の id
  // tempo         ：楽譜のテンポ
  // temperamentId ：音律の id
  // notes         ：音の並び（音のデータの配列）
  // savedId       ：今開いている楽譜が、保存した楽譜のどれか（その id）。まだ保存していないときは null
  // name          ：今開いている楽譜の名前。まだ保存していないときは空の文字
  // onsaved       ：新しく保存できたときに呼ぶ関数。保存した楽譜の id と名前を渡す
  // onnew         ：「新規」を押して、新しい楽譜を作ることになったときに呼ぶ関数
  let { keyId, tempo, temperamentId, notes, savedId, name, onsaved, onnew } = $props();

  // ===== 設定値 =====

  // 名前の長さの上限（文字の数）
  const NAME_MAX_LENGTH = 40;

  // 「保存しました」のメッセージを表示しておく時間（ミリ秒）
  const MESSAGE_MILLISECONDS = 3000;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 名前の入力欄を表示しているかどうか（true：表示している）
  let isNaming = $state(false);

  // 名前の入力欄に入っている文字
  let nameInput = $state("");

  // 「保存しました」などのメッセージ（ないときは空の文字）
  let message = $state("");

  // エラーメッセージ（ないときは空の文字）
  let errorMessage = $state("");

  // 保存した回数。保存するたびに1増やす
  // 下の isUnsaved を、保存した直後に計算し直させるための目印として使う
  // （保存先のブラウザの中身が変わっても、Svelte は自動では気づけないため）
  let saveCount = $state(0);

  // 保存していない変更があるかどうか（true：ある）
  // $derived.by の中で使っている値（調・テンポ・音律・音の並び・saveCount など）が変わるたびに、自動で調べ直される
  let isUnsaved = $derived.by(() => {
    // saveCount を読んでおくことで、保存した直後にも調べ直されるようにする（値そのものは使わない）
    saveCount;

    return hasUnsavedChanges({
      savedId: savedId,
      keyId: keyId,
      tempo: tempo,
      temperamentId: temperamentId,
      notes: notes,
    });
  });

  // 名前の入力欄の部品そのもの。入力欄にカーソルを入れるために使う
  // 入力欄が画面に出ていないときは null
  let nameInputElement = $state(null);

  // 名前の入力欄が画面に出たら、すぐ入力できるように、カーソルを入れる
  // $effect の中で使っている値（nameInputElement）が変わるたびに、自動で実行される
  $effect(() => {
    if (nameInputElement !== null) {
      // focus：入力欄にカーソルを入れる（スマホでは、文字入力のキーボードも出る）
      nameInputElement.focus();

      // select：すでに入っている文字を全部選んだ状態にする（そのまま打てば、入れ替えられる）
      nameInputElement.select();
    }
  });

  // ===== 画面には表示しない値 =====

  // メッセージを消すための予約の番号（予約を取り消すために使う）
  let messageTimer = null;

  // この部品が画面から消えるときに、メッセージを消す予約を取り消す
  onDestroy(() => {
    clearMessageTimer();
  });

  /**
   * メッセージを消す予約を取り消す関数
   */
  function clearMessageTimer() {
    if (messageTimer !== null) {
      clearTimeout(messageTimer);
      messageTimer = null;
    }
  }

  /**
   * 「保存しました」のメッセージを表示して、少したったら消す関数
   */
  function showSavedMessage() {
    // 保存した楽譜が今いくつあるかも一緒に表示する
    message = "保存しました（保存した楽譜：" + loadSavedScores().length + "件）";

    // 保存した回数を1増やす（「変更あり」の印を、調べ直して消すため）
    saveCount = saveCount + 1;

    // 前の予約が残っていたら取り消してから、新しく予約する
    clearMessageTimer();
    messageTimer = setTimeout(() => {
      message = "";
      messageTimer = null;
    }, MESSAGE_MILLISECONDS);
  }

  /**
   * 今の楽譜の内容を、保存用のデータにまとめる関数
   * @returns {{keyId: string, tempo: number, temperamentId: string, notes: Array}} 保存する内容
   */
  function getScoreData() {
    return {
      keyId: keyId,
      tempo: tempo,
      temperamentId: temperamentId,
      // $state.snapshot は、画面と連動している配列から、ふつうの配列のコピーを作る
      notes: $state.snapshot(notes),
    };
  }

  /**
   * 「保存」ボタンを押したときの処理をする関数
   * 保存済みの楽譜を開いているときは、同じ名前のまま上書きする。
   * まだ保存していない楽譜のときは、名前の入力欄を表示する。
   */
  function handleSave() {
    // 前のメッセージを消す
    message = "";
    errorMessage = "";

    if (savedId !== null) {
      // 保存済みの楽譜を開いているとき：上書きする
      const updated = updateSavedScore(savedId, getScoreData());
      if (updated !== null) {
        showSavedMessage();
        return;
      }

      // 上書きできなかったとき（一覧から削除されていたときなど）は、新しく保存する流れに進む
    }

    // 名前の入力欄を表示する（前の名前があれば、最初から入れておく）
    nameInput = name;
    isNaming = true;
  }

  /**
   * 「別の名前で保存」ボタンを押したときの処理をする関数
   * 元の楽譜は残したまま、今の内容を、別の名前の新しい楽譜として保存する。
   * 名前の入力欄を表示するだけで、実際の保存は「保存する」を押したときに行う。
   */
  function handleSaveAs() {
    // 前のメッセージを消す
    message = "";
    errorMessage = "";

    // 名前の入力欄を表示する（今の名前を入れておくので、少し直すだけで済む）
    nameInput = name;
    isNaming = true;
  }

  /**
   * 入力した名前で、新しく保存する関数
   * 名前の入力欄の「保存する」ボタンを押したとき（または Enter キーを押したとき）に呼ばれる。
   * @param {SubmitEvent} event - フォームを送信したときの情報
   */
  function saveWithName(event) {
    // フォームを送信すると、ふつうはページが再読み込みされてしまうので、それを止める
    event.preventDefault();

    errorMessage = "";

    // 名前の前後の空白を取り除く
    const trimmedName = nameInput.trim();

    // 名前が空のときは保存しない
    if (trimmedName === "") {
      errorMessage = "名前を入力してください";
      return;
    }

    // 同じ名前の楽譜がすでにあるときは保存しない（一覧で見分けがつかなくなるため）
    if (isNameUsed(trimmedName, null)) {
      errorMessage = "同じ名前の楽譜があります。別の名前にしてください";
      return;
    }

    // 新しく保存する
    const saved = addSavedScore({ name: trimmedName, ...getScoreData() });
    if (saved === null) {
      errorMessage = "保存できませんでした";
      return;
    }

    // 入力欄を閉じて、保存できたことを編集ページに伝える
    isNaming = false;
    onsaved(saved.id, saved.name);
    showSavedMessage();
  }

  /**
   * 名前を入力するのをやめる関数
   * 名前の入力欄の「キャンセル」ボタンを押したときに呼ばれる。
   */
  function cancelNaming() {
    isNaming = false;
    errorMessage = "";
  }

  /**
   * 「新規」ボタンを押したときの処理をする関数
   * 今の楽譜を閉じて、何も入っていない新しい楽譜にする。
   * 保存していない変更があるときだけ、消えてしまう前に確認する。
   */
  function handleNew() {
    // 保存していない変更があるとき：確認の画面を出す（「キャンセル」を押すと false が返るので、何もせずに終わる）
    // && は「左が true のときだけ右を調べる」ので、変更がないときは確認を出さずに先へ進む
    if (isUnsaved && !confirm("今の楽譜を閉じて、新しい楽譜を作ります。保存していない変更は消えます。よろしいですか？")) {
      return;
    }

    // 入力欄やメッセージを片付けてから、編集ページに伝える
    isNaming = false;
    message = "";
    errorMessage = "";
    onnew();
  }
</script>

<!-- 楽譜の名前と、「新規」「保存」のボタンを横に並べる -->
<div class="save-bar">
  <!-- 楽譜の名前（まだ保存していないときは「（名前なし）」と薄く表示する） -->
  <span class="score-name" class:unnamed={name === ""}>{name === "" ? "（名前なし）" : name}</span>

  <!-- 保存していない変更があるときだけ、「変更あり」の印を表示する -->
  {#if isUnsaved}
    <span class="unsaved-mark">変更あり</span>
  {/if}

  <!-- 新しい楽譜を作るボタン -->
  <button class="bar-button" onclick={handleNew}>新規</button>

  <!-- 保存するボタン（音が1つもないときと、名前を入力している最中は押せない） -->
  <button class="bar-button primary" disabled={notes.length === 0 || isNaming} onclick={handleSave}>保存</button>
</div>

<!-- 「別の名前で保存」：保存した楽譜を開いていて、名前を入力していないときだけ表示する -->
{#if savedId !== null && !isNaming}
  <div class="save-as-row">
    <button class="save-as-button" disabled={notes.length === 0} onclick={handleSaveAs}>別の名前で保存</button>
  </div>
{/if}

<!-- 名前の入力欄：新しく保存するときだけ表示する -->
{#if isNaming}
  <!-- form で囲むと、入力欄で Enter キーを押したときにも保存できる -->
  <form class="name-form" onsubmit={saveWithName}>
    <!-- bind:value を付けると、入力した文字が nameInput に自動で入る -->
    <!-- aria-label は、読み上げで操作する人のための、入力欄の説明 -->
    <!-- bind:this を付けると、この入力欄そのものが nameInputElement に入り、カーソルを入れられる -->
    <input class="name-input" type="text" aria-label="楽譜の名前" placeholder="楽譜の名前（例：001.きらきら星）" maxlength={NAME_MAX_LENGTH} bind:value={nameInput} bind:this={nameInputElement} />

    <!-- type="submit" のボタンを押すと、フォームが送信されて saveWithName が呼ばれる -->
    <button class="bar-button primary" type="submit">保存する</button>

    <!-- type="button" にしておくと、押してもフォームは送信されない -->
    <button class="bar-button" type="button" onclick={cancelNaming}>キャンセル</button>
  </form>
{/if}

<!-- エラーメッセージ：あるときだけ表示する -->
{#if errorMessage !== ""}
  <p class="save-error">{errorMessage}</p>
{/if}

<!-- 「保存しました」のメッセージ：あるときだけ表示する -->
{#if message !== ""}
  <p class="save-message">{message}</p>
{/if}

<style>
  /* 楽譜の名前とボタンを横に並べる */
  .save-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  /* 楽譜の名前：残りの横幅を使い、長いときは「…」で省略する */
  .score-name {
    flex: 1;
    /* min-width: 0 を付けると、名前が長くても、ボタンを押し出さずに縮む */
    min-width: 0;
    font-size: 1rem;
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* まだ保存していないときの「（名前なし）」：薄いグレーの細い字にする */
  .score-name.unnamed {
    font-weight: normal;
    color: #9e9e9e;
  }

  /* 「変更あり」の印：小さなオレンジの札 */
  .unsaved-mark {
    flex-shrink: 0;
    padding: 1px 6px;
    font-size: 0.7rem;
    color: white;
    background-color: #ef6c00;
    border-radius: 8px;
    white-space: nowrap;
  }

  /* 「別の名前で保存」の行：ボタンを右に寄せる */
  .save-as-row {
    display: flex;
    justify-content: flex-end;
    margin: -4px 0 8px 0;
  }

  /* 「別の名前で保存」ボタン：あまり使わないので、枠のない小さな文字だけのボタンにする */
  button.save-as-button {
    padding: 2px 4px;
    font-size: 0.8rem;
    color: #1976d2;
    background-color: transparent;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }

  /* 押せない状態の「別の名前で保存」ボタン：薄く表示する */
  button.save-as-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 「新規」「保存」などのボタン共通：白地に青い枠の、小さめのボタン */
  button.bar-button {
    flex-shrink: 0;
    padding: 6px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 「保存」「保存する」ボタン：青く塗って、主なボタンだと分かるようにする */
  button.bar-button.primary {
    color: white;
    background-color: #1976d2;
  }

  /* 押せない状態のボタン：薄く表示する */
  button.bar-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 名前の入力欄とボタン：1行目に入力欄、2行目にボタンを並べる */
  .name-form {
    display: flex;
    /* 入りきらないものは、次の行に折り返す */
    flex-wrap: wrap;
    /* 2行目のボタンを、右に寄せる */
    justify-content: flex-end;
    gap: 6px;
    margin-bottom: 8px;
  }

  /* 名前の入力欄：1行をまるごと使う（横幅いっぱい。ボタンは次の行に折り返される） */
  .name-input {
    flex: 1 1 100%;
    min-width: 0;
    /* 枠と内側の余白を、幅の中に含める（横幅いっぱいにしたときに、はみ出さないようにする） */
    box-sizing: border-box;
    padding: 8px;
    /* 文字が 16px より小さいと、スマホで入力欄を押したときに画面が勝手に拡大されることがあるので、1rem にする */
    font-size: 1rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
  }

  /* エラーメッセージ：赤 */
  .save-error {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
    color: #c62828;
  }

  /* 「保存しました」のメッセージ：緑 */
  .save-message {
    margin: 0 0 8px 0;
    font-size: 0.85rem;
    color: #2e7d32;
  }
</style>
