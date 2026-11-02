<script>
  // MusicXML を読み込むときに出す窓の部品（ステップA-1a）
  // 名前・パート・長調か短調かを選んでもらい、知らせること（重音・判定から外す音など）を表示する。
  // ［読み込む］を押すと、保存する楽譜の形を作って、使う側（読み込んだ楽譜の一覧ページ）に渡す。
  // （ステップA-1b：同じ名前の楽譜がもうあるときは、窓の中で「上書き」か「別に追加」かを聞く）

  // untrack：値を「最初の1回だけ」読むための仕組み（下の name などで使う）
  import { untrack } from "svelte";

  // 調の名前を作る関数を読み込む
  import { getKeyLabel } from "#lib/key.js";

  // パートの一覧・調の候補・最初の名前・知らせることを作る関数と、保存する形を作る関数を読み込む
  // （ステップA-1b：同じ名前の楽譜を探す関数も読み込む）
  // （ビオラ版：最初に選んでおくパートを決める関数（getDefaultPartIndex）も読み込む）
  import { getPartChoices, getDefaultPartIndex, getKeyChoices, getDefaultName, analyzePart, buildImportedScore, findImportedScoreByName } from "#lib/imported.js";

  // この部品を使う側から受け取る値
  // score    ：楽譜作成アプリの形の楽譜データ（musicXMLToScore で読み込んだもの）
  // warnings ：読み込みのときに分かった、知らせることの文の配列（musicXMLToScore が返したもの）
  // onconfirm：読み込むことが決まったときに呼ぶ関数。{ record, action, targetId } を渡す（ステップA-1b）
  //            record  ：保存する楽譜の形
  //            action  ：'add'（新しく足す）か 'overwrite'（同じ名前の楽譜に上書きする）
  //            targetId：上書きする楽譜の id（'add' のときは null）
  // oncancel ：［やめる］を押したときに呼ぶ関数
  let { score, warnings, onconfirm, oncancel } = $props();

  // ===== 選ぶもの（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // パートの一覧（パートの番号と名前）
  // untrack で囲むのは、「窓を開いたときの楽譜で1回だけ作る」ことをSvelteにはっきり伝えるため
  const partChoices = untrack(() => getPartChoices(score));

  // 調の候補（[長調, 長調と同じ調号の短調]）
  const keyChoices = untrack(() => getKeyChoices(score));

  // 最初に選んでおくパートの番号（ビオラのパートがあれば、その中のいちばん上。なければ1つ目のパート）（ビオラ版）
  const defaultPartIndex = untrack(() => getDefaultPartIndex(score));

  // 選んだパートの番号（最初は、上で決めたパート）
  let partIndex = $state(defaultPartIndex);

  // 選んだ調の id（最初は長調）
  let keyId = $state(untrack(() => keyChoices[0].id));

  // 名前（最初は「タイトル（最初に選んでおくパートの名前）」）
  let name = $state(untrack(() => getDefaultName(score, defaultPartIndex)));

  // 名前を自分で書き換えたかどうか（true：書き換えた）
  // 書き換えていなければ、パートを選び直したときに、名前も「タイトル（そのパート名）」に変える
  let isNameEdited = $state(false);

  // 選んだパートを調べた結果（知らせる文と、判定できる音の数）
  // $derived を付けると、partIndex が変わるたびに自動で計算し直される
  let analysis = $derived(analyzePart(score, partIndex));

  // 窓に出す、知らせる文の全部（読み込みのときに分かったこと ＋ 選んだパートを調べて分かったこと）
  let allNotices = $derived([...warnings, ...analysis.notices]);

  // ［読み込む］を押せるかどうか（名前が空でなく、判定できる音が1つ以上あるとき）
  // trim() は、前後の空白を取りのぞく命令
  let canConfirm = $derived(name.trim() !== "" && analysis.judgeableCount > 0);

  // 同じ名前の楽譜（［読み込む］を押したときに見つかったもの）。確認を出していないときは null（ステップA-1b）
  // これが入っている間は、窓の下のボタンが［やめる］［別に追加］［上書き］に変わる
  let sameNameScore = $state(null);

  /**
   * パートを選び直したときに呼ばれる関数
   * 名前を自分で書き換えていなければ、名前も「タイトル（そのパート名）」に変える。
   */
  function handlePartChange() {
    if (!isNameEdited) {
      name = getDefaultName(score, partIndex);
    }
  }

  /**
   * 名前の欄に文字を入力したときに呼ばれる関数
   * 自分で書き換えた印を付ける（パートを選び直しても、名前を変えないようにするため）。
   */
  function handleNameInput() {
    isNameEdited = true;
  }

  /**
   * ［読み込む］を押したときに呼ばれる関数
   * 同じ名前の楽譜がなければ、そのまま「新しく足す」として使う側に渡す。
   * あれば、確認を出す（ボタンが［やめる］［別に追加］［上書き］に変わる）。（ステップA-1b）
   */
  function confirmImport() {
    const found = findImportedScoreByName(name.trim());
    if (found === null) {
      // 同じ名前がない：そのまま新しく足す
      onconfirm({ record: buildImportedScore(score, partIndex, keyId, name.trim()), action: "add", targetId: null });
    } else {
      // 同じ名前がある：確認を出す
      sameNameScore = found;
    }
  }

  /**
   * 確認で［上書き］を押したときに呼ばれる関数（ステップA-1b）
   * 同じ名前の楽譜に上書きするように、使う側に渡す。
   */
  function overwrite() {
    onconfirm({ record: buildImportedScore(score, partIndex, keyId, name.trim()), action: "overwrite", targetId: sameNameScore.id });
  }

  /**
   * 確認で［別に追加］を押したときに呼ばれる関数（ステップA-1b）
   * 新しく足すように、使う側に渡す（名前のうしろに (2) などを付けるのは、使う側で行う）。
   */
  function addSeparately() {
    onconfirm({ record: buildImportedScore(score, partIndex, keyId, name.trim()), action: "add", targetId: null });
  }

  /**
   * 確認で［やめる］を押したときに呼ばれる関数（ステップA-1b）
   * 確認を閉じて、窓に戻る（名前を直してから、もう一度［読み込む］を押せる）。
   */
  function backToForm() {
    sameNameScore = null;
  }
</script>

<!-- 窓の後ろの、画面全体をうすく暗くする部分 -->
<div class="backdrop">
  <!-- 窓 -->
  <!-- role="dialog" と aria-modal は、読み上げで操作する人に「窓が開いている」と伝えるための印 -->
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="import-dialog-title">
    <h2 id="import-dialog-title">MusicXMLの読み込み</h2>

    <!-- 名前 -->
    <label class="field">
      <span class="field-label">名前</span>
      <!-- bind:value を付けると、入力した文字が name に自動で入る -->
      <!-- 同じ名前の確認を出している間は、書き換えられないようにする（ステップA-1b） -->
      <input class="text-input" type="text" bind:value={name} oninput={handleNameInput} disabled={sameNameScore !== null} />
    </label>

    <!-- パート：パートが2つ以上あるときだけ選ばせる -->
    {#if partChoices.length > 1}
      <label class="field">
        <span class="field-label">練習するパート</span>
        <select class="select" bind:value={partIndex} onchange={handlePartChange} disabled={sameNameScore !== null}>
          {#each partChoices as choice (choice.index)}
            <option value={choice.index}>{choice.name}</option>
          {/each}
        </select>
      </label>
    {:else}
      <!-- パートが1つのとき：名前だけ表示する -->
      <p class="field">
        <span class="field-label">パート</span>
        <span>{partChoices[0].name}</span>
      </p>
    {/if}

    <!-- 長調か短調か：同じ調号の2つから選ぶ -->
    <fieldset class="field">
      <legend class="field-label">調（純正律の計算に使います）</legend>
      <div class="key-choices">
        {#each keyChoices as key (key.id)}
          <!-- bind:group を付けると、選んだほうの value（調の id）が keyId に自動で入る -->
          <label class="key-choice">
            <input type="radio" name="import-key" value={key.id} bind:group={keyId} disabled={sameNameScore !== null} />
            {getKeyLabel(key)}
          </label>
        {/each}
      </div>
    </fieldset>

    <!-- 知らせること：1つ以上あるときだけ表示する -->
    {#if allNotices.length > 0}
      <ul class="notices">
        {#each allNotices as notice}
          <li>{notice}</li>
        {/each}
      </ul>
    {/if}

    <!-- 判定できる音が1つもないときの注意 -->
    {#if analysis.judgeableCount === 0}
      <p class="error">このパートには、判定できる音がありません。ほかのパートを選んでください。</p>
    {/if}

    {#if sameNameScore === null}
      <!-- やめる・読み込むのボタン -->
      <div class="button-row">
        <button class="cancel-button" onclick={oncancel}>やめる</button>
        <button class="confirm-button" disabled={!canConfirm} onclick={confirmImport}>読み込む</button>
      </div>
    {:else}
      <!-- 同じ名前の楽譜があるときの確認（ステップA-1b） -->
      <div class="same-name">
        <p class="same-name-text">「{sameNameScore.name}」はもう読み込んであります。</p>
        <p class="same-name-note">
          ［上書き］：前の楽譜を入れ替えます（楽譜の中身が変わっていたら、最高点は消えます）<br />
          ［別に追加］：名前のうしろに (2) などを付けて、もう1つ保存します<br />
          ［やめる］：名前を直して、もう一度［読み込む］を押せます
        </p>
      </div>
      <div class="button-row">
        <button class="cancel-button" onclick={backToForm}>やめる</button>
        <button class="cancel-button" onclick={addSeparately}>別に追加</button>
        <button class="confirm-button" onclick={overwrite}>上書き</button>
      </div>
    {/if}
  </div>
</div>

<style>
  /* 窓の後ろ：画面全体をおおって、うすく暗くする */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background-color: rgba(0, 0, 0, 0.4);
  }

  /* 窓：白い角丸の四角。中身が多いときは窓の中でスクロールする */
  .dialog {
    width: 100%;
    max-width: 440px;
    max-height: 100%;
    overflow-y: auto;
    padding: 16px;
    background-color: white;
    border-radius: 12px;
    box-sizing: border-box;
    font-family: sans-serif;
  }

  /* 窓のタイトル */
  h2 {
    margin: 0 0 12px 0;
    font-size: 1.1rem;
  }

  /* 項目1つぶん（名前・パート・調）：縦に並べる */
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0 0 12px 0;
    padding: 0;
    border: none;
  }

  /* 項目の名前：小さくグレーで表示する */
  .field-label {
    padding: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 名前の入力欄・パートのメニュー：指で押しやすい大きさにする */
  /* font-size を 16px 以上にしておくと、iPhone で入力欄を押したときに画面が勝手に拡大されない */
  .text-input,
  .select {
    padding: 8px;
    font-size: 16px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 調の2つの選択肢：縦に並べる */
  .key-choices {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* 調の選択肢1つぶん */
  .key-choice {
    font-size: 0.95rem;
  }

  /* 知らせることの一覧：うすい黄色の地に表示する */
  .notices {
    margin: 0 0 12px 0;
    padding: 8px 10px 8px 1.6em;
    font-size: 0.8rem;
    line-height: 1.6;
    background-color: #fff8e1;
    border-radius: 8px;
  }

  /* 判定できる音がないときの注意：赤い字 */
  .error {
    margin: 0 0 12px 0;
    font-size: 0.85rem;
    color: #c62828;
  }

  /* 同じ名前の楽譜があるときの確認：うすい青の地に表示する（ステップA-1b） */
  .same-name {
    margin: 0 0 12px 0;
    padding: 8px 10px;
    background-color: #e3f2fd;
    border-radius: 8px;
  }

  /* 確認の文 */
  .same-name-text {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
    font-weight: bold;
    overflow-wrap: anywhere;
  }

  /* 確認のボタンの説明：小さく表示する */
  .same-name-note {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.6;
    color: #424242;
  }

  /* やめる・読み込むのボタンを右寄せで横に並べる */
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  /* ボタン共通 */
  button {
    padding: 10px 18px;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 「やめる」ボタン：白地に灰色の枠 */
  .cancel-button {
    color: #424242;
    background-color: white;
    border: 1px solid #bdbdbd;
  }

  /* 「読み込む」ボタン：青 */
  .confirm-button {
    color: white;
    background-color: #1976d2;
    border: 2px solid #1976d2;
  }
</style>
