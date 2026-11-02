<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onMount, onDestroy } from "svelte";

  // 調のデータに関する設定値と関数を読み込む
  import { KEYS, DEFAULT_KEY_ID, getKey, getKeyMenuLabel, getScaleNames } from "#lib/key.js";

  // 作業中の楽譜を読み込む関数（最初に表示する調を決めるために使う）と、保存された音律を読み込む関数を読み込む
  import { loadCurrentScore, loadTemperamentId } from "#lib/settings.js";

  // 音律の一覧と最初の設定、周波数を計算する関数、開放弦の周波数を返す関数を読み込む
  import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID, getFrequency, getOpenStringFrequency } from "#lib/tuning.js";

  // 指定した周波数の音を鳴らす関数と、鳴っている音を止める関数を読み込む
  import { playTone, stopTone, startVoice, stopVoice, unlockAudio } from "#lib/audio.js";

  // 今の基準の音（ラ4 の周波数）を返す関数を読み込む（注意書きに表示するために使う）
  import { getReferenceFrequency } from "#lib/reference.svelte.js";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // 弦の一覧（どの弦の音かを表示するために使う）、ポジションの一覧と最初の設定、印の id を作る関数を読み込む
  import { STRINGS, POSITIONS, DEFAULT_POSITION_ID, getMarkerId } from "#lib/fingerboard.js";

  // 指板の図を描く部品を読み込む
  import Fingerboard from "#lib/Fingerboard.svelte";

  // ===== メニューに並べる調の一覧（長調と短調に分けておく） =====

  // 長調だけを取り出した一覧
  const majorKeys = KEYS.filter((key) => key.mode === "major");

  // 短調だけを取り出した一覧
  const minorKeys = KEYS.filter((key) => key.mode === "minor");

  // ===== 印の中に書くものの選択肢 =====

  //   id   ：選択肢を区別するための名前
  //   name ：画面に表示する名前
  const LABEL_MODES = [
    { id: "name", name: "音名" },
    { id: "finger", name: "指番号" },
  ];

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 選択中の調の id（最初はハ長調）
  let keyId = $state(DEFAULT_KEY_ID);

  // 選択中のポジションの番号（最初は第1ポジション）
  let positionId = $state(DEFAULT_POSITION_ID);

  // 印の中に書くもの（"name"：音名、"finger"：指番号）
  let labelMode = $state("name");

  // 選択中の音律の id。印を押したときに鳴らす音の高さを決めるために使う
  // 最初は決まった設定にしておき、画面に表示された後で、保存された設定に入れ替える
  // （このページで変えても保存はしない。楽譜の編集ページの音律には影響しない）
  let temperamentId = $state(DEFAULT_TEMPERAMENT_ID);

  // 最後に押した印のデータ。まだ押していないときは null
  let selectedMarker = $state(null);

  // 最後に鳴らした音の周波数（Hz）。まだ鳴らしていないときは null
  let playedFrequency = $state(null);

  // ===== 指で押している間、音を鳴らし続けるための設定値と覚えておく値 =====

  // 指で押し続けたときに、鳴らし続ける長さの上限（秒）
  // 指が離れたことをスマホが伝えそこねたときに、鳴りっぱなしになるのを防ぐ
  const HOLD_MAX_SECONDS = 30;

  // 軽くタップしただけのときでも、最低これだけは鳴らす長さ（秒）
  // ピチカート（弦を指ではじく弾き方）のような、短い音になる
  const HOLD_MIN_SECONDS = 0.3;

  // 指で押さえている印の一覧（画面には表示しないので $state は付けない）
  // キーは指の番号（ブラウザが指1本ごとに付ける番号）、値はその指で押さえている印のデータ
  // Map は、「キー → 値」の組をいくつもためておける入れ物
  const holds = new Map();

  // 弦ごとに、今鳴らしている音の一覧（画面には表示しないので $state は付けない）
  // キーは弦の番号（0 が C線、3 が A線）、値は { marker：鳴らしている印、voice：鳴らしている音、frequency：周波数（Hz） }
  // 1本の弦では、1つの音しか鳴らさない（同じ弦を2本以上の指で押さえているときは、一番高い音だけを鳴らす）
  const voices = new Map();

  // 指で押さえている印の id の一覧。図の中で、押さえている印を全部目立たせるために渡す
  // （同じ弦で、高い音に隠れて鳴っていない指も含む。指を置いている場所が分かるようにするため）
  let heldIds = $state([]);

  // 今鳴っている音の一覧（画面に表示するためのもの）。低い音から順に並べる
  // 1つぶんは { marker：鳴らしている印、frequency：周波数（Hz） }
  let soundingNotes = $state([]);

  // 選択中の印の id（押していないときは null）。図の中で、その印を目立たせるために渡す
  // 指で押さえている印があるときは、押さえている印（heldIds）だけを目立たせるので、null にする
  let selectedId = $derived(selectedMarker === null || heldIds.length > 0 ? null : getMarkerId(selectedMarker));

  // 選択中の調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 選択中の調の音階（文字の配列）。例：['ラ', 'シ', 'ド♯', 'レ', 'ミ', 'ファ♯', 'ソ♯', 'ラ']
  let scaleNames = $derived(getScaleNames(currentKey));

  // このページが画面に表示された直後に、最初に表示する調を決める
  // 1. アドレスの最後に「?key=A-dur」のように調が付いていれば、その調にする（ほかのページから来たとき）
  // 2. 付いていなければ、作業中の楽譜の調にする
  // 3. どちらもなければ、ハ長調のまま
  onMount(() => {
    // 保存された音律を読み込む
    temperamentId = loadTemperamentId();

    // アドレスの「?」より後ろの部分から、key の値を取り出す（付いていないときは null）
    const keyFromAddress = new URLSearchParams(location.search).get("key");

    // その id の調が、調の一覧にあるかどうかを確かめる（でたらめな値が付いていたときに備える）
    const isValidKey = KEYS.some((key) => key.id === keyFromAddress);
    if (isValidKey) {
      keyId = keyFromAddress;
      return;
    }

    // 作業中の楽譜があれば、その調にする（一覧にない id のときは、getKey がハ長調にしてくれる）
    const currentScore = loadCurrentScore();
    if (currentScore !== null) {
      keyId = getKey(currentScore.keyId).id;
    }
  });

  // ページのどこかで、指を離す・キーを押す、という操作があったら、音を出せる状態にしておく
  // （調を選ぶなど、印を押す前に何か操作をしていれば、最初に印を押したときから、押している間ずっと鳴らせる）
  onMount(() => {
    window.addEventListener("pointerup", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    // onMount の中で関数を返すと、このページが画面から消えるときに、その関数が呼ばれる（後片付け）
    return () => {
      window.removeEventListener("pointerup", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  });

  // このページが画面から消えるときに、鳴っている音を止める
  // （止めないと、別のページに移っても音が鳴り続けてしまうため）
  onDestroy(() => {
    // 鳴らしている音を、全部すぐに止める
    voices.forEach((sounding) => stopVoice(sounding.voice));
    voices.clear();
    holds.clear();

    stopTone();
  });

  // 調かポジションが変わったら、印の選択を解除する
  // （前に押した印が、変えたあとでは別の音になっていたり、無くなっていたりするため）
  // $effect の中で使っている値（keyId と positionId）が変わるたびに、自動で実行される
  $effect(() => {
    // keyId と positionId を読んでおくことで、変わったときに実行されるようにする（値そのものは使わない）
    keyId;
    positionId;

    selectedMarker = null;
    playedFrequency = null;
  });

  /**
   * 印の音の周波数を求める関数
   * 開放弦の印は、開放弦の高さ（基準の音のラ4 から5度ずつ合わせた高さ）にする。
   * それ以外の印（音階にない場所の点も含む）は、選択中の調と音律での高さにする。
   * @param {object} marker - 印のデータ
   * @returns {number} 周波数（Hz）
   */
  function getMarkerFrequency(marker) {
    if (marker.semitones === 0) {
      // 開放弦：調弦で決まっている高さ（音律に関係なく、いつも同じ）
      // 弦の一覧に入っている、開放弦の音のデータから求める
      return getOpenStringFrequency(STRINGS[marker.stringIndex].openNote);
    }

    // 指で押さえる音：選択中の調と音律での高さ
    return getFrequency(marker.note, currentKey, temperamentId);
  }

  /**
   * 印がマウスでクリックされたとき（またはキーボードで選ばれたとき）に、その音を短く鳴らす関数
   * @param {object} marker - 押された印のデータ
   */
  function playMarker(marker) {
    // 長さを渡さないので、決まった長さ（0.8秒）で鳴る
    const frequency = getMarkerFrequency(marker);
    playTone(frequency);

    // どの印を押したかと、鳴らした周波数を覚えておく（図の印を目立たせて、下に周波数を表示する）
    selectedMarker = marker;
    playedFrequency = frequency;
  }

  /**
   * 印が指で押されたとき（スマホなど）に呼ばれる関数
   * 押さえた指を覚えて、その弦で鳴らす音を決め直す（離れたときの処理は stopHold）。
   * 弦ごとに別の音として鳴らすので、ほかの弦の音は止めない（重音になる）。
   * @param {object} marker - 押された印のデータ
   * @param {number} pointerId - 押した指の番号
   */
  function startHold(marker, pointerId) {
    // 同じ指が、まだどこかを押さえていることになっていたら、先に離したことにする（念のため）
    stopHold(pointerId);

    // どの指で、どの印を押さえたかを覚える
    holds.set(pointerId, marker);

    // その弦で鳴らす音を決め直す
    updateString(marker.stringIndex, 0);

    // 画面の表示を作り直す
    updateDisplay();
  }

  /**
   * 印を押さえていた指が離れたときに呼ばれる関数
   * 指を忘れて、その弦で鳴らす音を決め直す。
   * その弦を押さえている指がなくなったときは音を止めるが、鳴らしはじめてから 0.3秒たっていなければ、0.3秒まで鳴らす。
   * ページを開いて最初の操作で、押している間に音を出せなかったときも、指を離したここで 0.3秒鳴る
   * （指を離したときなら、ブラウザが音を出させてくれるため）。
   * @param {number} pointerId - 離れた指の番号
   */
  function stopHold(pointerId) {
    // その指で押さえていた印を探す。なければ、何もしない
    const marker = holds.get(pointerId);
    if (marker === undefined) {
      return;
    }

    // 指を忘れて、その弦で鳴らす音を決め直す（音を止めるときは、最低の長さは鳴らす）
    holds.delete(pointerId);
    updateString(marker.stringIndex, HOLD_MIN_SECONDS);

    // 画面の表示を作り直す
    updateDisplay();
  }

  /**
   * 1本の弦で鳴らす音を決め直す関数
   * 本物のビオラと同じく、その弦を押さえている指のうち、一番高い音（駒に近い指）だけを鳴らす。
   * 例：ドとレを両方押さえていればレ。レの指を離せばドに戻る。
   * @param {number} stringIndex - 弦の番号（0 が C線、3 が A線）
   * @param {number} minSeconds - 押さえている指がなくなって音を止めるとき、最低でも鳴らす長さ（秒）
   */
  function updateString(stringIndex, minSeconds) {
    // その弦を押さえている印のうち、一番高い音（開放弦から半音いくつ分上か、が一番大きいもの）を探す
    let top = null;
    holds.forEach((marker) => {
      if (marker.stringIndex === stringIndex && (top === null || marker.semitones > top.semitones)) {
        top = marker;
      }
    });

    // 今その弦で鳴らしている音
    const current = voices.get(stringIndex);

    // 鳴らす音が変わらないときは、何もしない
    if (current !== undefined && top !== null && getMarkerId(current.marker) === getMarkerId(top)) {
      return;
    }

    // 今鳴らしている音を止める
    // 押さえている指がなくなったとき（top が null）は、最低の長さは鳴らす。別の音に変わるときは、すぐに止める
    if (current !== undefined) {
      stopVoice(current.voice, top === null ? minSeconds : 0);
      voices.delete(stringIndex);
    }

    // 新しく鳴らす音があれば、上限の長さで鳴らしはじめる
    if (top !== null) {
      const frequency = getMarkerFrequency(top);
      const voice = startVoice(frequency, HOLD_MAX_SECONDS);
      voices.set(stringIndex, { marker: top, voice: voice, frequency: frequency });
    }
  }

  /**
   * 押さえている印と、鳴っている音の表示を、作り直す関数
   * 鳴っている音が1つだけのときは、下の表示を、その音の詳しい表示にする。
   */
  function updateDisplay() {
    // 押さえている印の id の一覧（[...holds.values()] で、Map の値だけを取り出して、ふつうの配列にする）
    heldIds = [...holds.values()].map((marker) => getMarkerId(marker));

    // 鳴っている音の一覧を、周波数の低い順に並べる
    soundingNotes = [...voices.values()].map((sounding) => ({ marker: sounding.marker, frequency: sounding.frequency })).sort((a, b) => a.frequency - b.frequency);

    // 鳴っている音が1つだけのときは、その音を「最後に押した音」として、詳しい表示にする
    if (soundingNotes.length === 1) {
      selectedMarker = soundingNotes[0].marker;
      playedFrequency = soundingNotes[0].frequency;
    }
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブと、検索結果の見出しに出る -->
  <title>指板の図（ポジションごとの音の場所）｜ビオラ音程チェック</title>

  <!-- description：検索結果で、見出しの下に出る説明文 -->
  <meta name="description" content="ビオラの第１〜第７ポジションで、調ごとの音階の音が指板のどこにあるかを図で表示します。音名と指番号を切り替えられ、印を押すと、その音が鳴ります。" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>指板の図</h1>
  </div>

  <!-- 調のメニューと、印の中に書くものの切り替えを横に並べる -->
  <div class="control-row">
    <!-- 調のメニュー。aria-label は、読み上げで操作する人のための、メニューの説明 -->
    <!-- bind:value を付けると、選んだ調の id が keyId に自動で入る -->
    <select class="key-select" aria-label="調" bind:value={keyId}>
      <!-- optgroup は、メニューの中の見出し付きのグループ -->
      <optgroup label="長調">
        {#each majorKeys as key (key.id)}
          <option value={key.id}>{getKeyMenuLabel(key)}</option>
        {/each}
      </optgroup>
      <optgroup label="短調">
        {#each minorKeys as key (key.id)}
          <option value={key.id}>{getKeyMenuLabel(key)}</option>
        {/each}
      </optgroup>
    </select>

    <!-- 印の中に書くものの切り替え（音名・指番号） -->
    {#each LABEL_MODES as mode (mode.id)}
      <!-- 選択中のほうに selected クラスを付けて色を変える -->
      <button class="choice" class:selected={labelMode === mode.id} onclick={() => (labelMode = mode.id)}>
        {mode.name}
      </button>
    {/each}
  </div>

  <!-- 選択中の調の音階 -->
  <p class="scale">{scaleNames.join(" ")}</p>

  <!-- ポジションのメニューと、音律のメニューを横に並べる -->
  <div class="menu-row">
    <!-- ポジションのメニュー。bind:value で、選んだポジションの番号が positionId に入る -->
    <select class="position-select" aria-label="ポジション" bind:value={positionId}>
      {#each POSITIONS as position (position.id)}
        <option value={position.id}>{position.name}</option>
      {/each}
    </select>

    <!-- 音律のメニュー（印を押したときの、音の高さを決める）。bind:value で、選んだ音律の id が temperamentId に入る -->
    <select class="temperament-select" aria-label="音律" bind:value={temperamentId}>
      {#each TEMPERAMENTS as temperament (temperament.id)}
        <option value={temperament.id}>{temperament.name}</option>
      {/each}
    </select>
  </div>

  <!-- 押した音の表示：まだ押していないときは、押せることを案内する -->
  <!-- 2つ以上を押さえているとき（重音）は、音名と周波数だけを、低い順に1行で並べる -->
  <p class="played-info">
    {#if soundingNotes.length >= 2}
      {soundingNotes.map((held) => noteToText(held.marker.note) + "(" + held.frequency.toFixed(1) + ")").join(" ・ ")}
    {:else if selectedMarker === null}
      印や点を押すと、音が鳴ります
    {:else}
      <!-- どの弦の、何の音か -->
      <strong>{STRINGS[selectedMarker.stringIndex].id}線 {noteToText(selectedMarker.note)}</strong>

      <!-- 開放弦か、何の指で押さえるか -->
      {selectedMarker.semitones === 0 ? "開放弦" : selectedMarker.finger + "の指"}

      <!-- 鳴らした周波数（小数第1位まで） -->
      {playedFrequency.toFixed(1)} Hz
    {/if}
  </p>

  <!-- 指板の図（調・ポジション・印の中に書くもの・選択中の印を渡す） -->
  <!-- マウスでクリックされたら playMarker（短く鳴らす）を呼んでもらう -->
  <!-- 指で押されたら startHold（鳴らしはじめる）、指が離れたら stopHold（止める）を呼んでもらう -->
  <!-- heldIds は、指で押さえている印の一覧（重音のとき、押さえている印を全部目立たせる） -->
  <Fingerboard key={currentKey} position={positionId} {labelMode} {selectedId} {heldIds} onselect={playMarker} onpress={startHold} onrelease={stopHold} />

  <!-- 図の見方 -->
  <ul class="legend">
    <li><span class="sample tonic"></span>主音（音階の最初の音）</li>
    <li><span class="sample"></span>音階の音</li>
    <li><span class="sample open"></span>開放弦（指で押さえない）</li>
    <li><span class="sample outside"></span>音階にない音（押すと鳴る）</li>
  </ul>

  <p class="note">
    印の位置は、半音ごとの目安です（実際の指の間隔は、高い音ほど少しずつ狭くなります）。<br />
    第２ポジションより上では、ナットと最初の行の間を省略しています（ギザギザの切れ目）。開放弦は、どのポジションでも一番上に出します。<br />
    それぞれのポジションの一番上の行は、1の指をナットのほうへ引いて押さえる場所です。<br />
    開放弦は、調弦の高さ（ラ＝{getReferenceFrequency()}Hz から5度ずつ）で鳴ります。それ以外は、選んだ調と音律での高さで鳴ります。<br />
    音階にない音は、♯ の付く調と調号のない調では ♯ の音として、♭ の付く調では ♭ の音として扱います。<br />
    指番号の 0 は開放弦です。♯や♭の多い調では、指番号は目安として見てください。<br />
    短調は、調号どおりの音（自然短音階）を表示しています。<br />
    iPhone で音が出ないときは、消音モードを解除してから、ページを開き直してください。
  </p>
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
    flex-shrink: 0;
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* タイトル */
  h1 {
    font-size: 1.1rem;
    margin: 0;
  }

  /* 調のメニューと、切り替えのボタンを横に並べる */
  .control-row {
    display: flex;
    gap: 6px;
  }

  /* 調のメニュー：残りの横幅を使う。指で押しやすい大きさにする */
  .key-select {
    flex: 1;
    /* min-width: 0 を付けると、中の文字が長くても、ボタンを押し出さずに縮む */
    min-width: 0;
    padding: 8px 4px;
    font-size: 0.95rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 切り替えのボタン（選択前）：白地に青い枠 */
  button.choice {
    flex-shrink: 0;
    padding: 8px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 切り替えのボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 選択中の調の音階：小さくグレーで表示する */
  .scale {
    margin: 6px 0 10px 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* ポジションのメニューと、音律のメニューを横に並べる */
  .menu-row {
    display: flex;
    gap: 6px;
  }

  /* ポジションと音律のメニュー共通：指で押しやすい大きさにする */
  .position-select,
  .temperament-select {
    /* min-width: 0 を付けると、中の文字が長くても、決めた割合より広がらない */
    min-width: 0;
    padding: 8px 4px;
    font-size: 0.9rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* ポジションのメニュー：名前が長いので、音律のメニューより広くする（横幅を 3：2 に分ける） */
  .position-select {
    flex: 3;
  }

  /* 音律のメニュー */
  .temperament-select {
    flex: 2;
  }

  /* 押した音の表示 */
  .played-info {
    margin: 8px 0;
    font-size: 0.85rem;
    color: #616161;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
    /* いつも1行にする（行が増えて、下の指板の図がずれないようにするため） */
    white-space: nowrap;
    /* 1行に入りきらないときは、はみ出した部分を隠して、最後を「…」にする */
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 押した音の、弦と音名：黒い太字 */
  .played-info strong {
    color: #212121;
  }

  /* 図の見方：横に並べて、入りきらないときは折り返す */
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    margin: 12px 0 0 0;
    padding: 0;
    font-size: 0.8rem;
    color: #424242;
    /* リストの先頭の「・」を消す */
    list-style: none;
  }

  /* 図の見方の1つぶん：見本の丸と文字を横に並べる */
  .legend li {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* 見本の丸（音階の音）：青 */
  .sample {
    display: inline-block;
    width: 14px;
    height: 14px;
    background-color: #1976d2;
    border: 2px solid #1976d2;
    border-radius: 50%;
    /* 枠の太さを、幅と高さの中に含める（丸の大きさが変わらないようにする） */
    box-sizing: border-box;
  }

  /* 見本の丸（主音）：オレンジ */
  .sample.tonic {
    background-color: #ef6c00;
    border-color: #ef6c00;
  }

  /* 見本の丸（開放弦）：白地に青い枠 */
  .sample.open {
    background-color: white;
  }

  /* 見本の点（音階にない音）：小さなグレーの丸 */
  .sample.outside {
    width: 9px;
    height: 9px;
    background-color: #9e9e9e;
    border-color: #9e9e9e;
  }

  /* 注意書き：小さくグレーで表示する */
  .note {
    margin: 10px 0 0 0;
    font-size: 0.75rem;
    line-height: 1.6;
    color: #757575;
  }
</style>
