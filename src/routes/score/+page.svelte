<script>
  // onMount：このページが画面に表示された直後に処理をするための仕組み
  // onDestroy：このページが画面から消えるときに後片付けをするための仕組み
  import { onMount, onDestroy } from "svelte";

  // 楽譜のデータに関する設定値と関数を読み込む
  import { STEP_NAMES, OCTAVES, isInRange, noteToText, accidentalToText } from "#lib/score.js";

  // 調のデータに関する設定値と関数を読み込む
  import { KEYS, DEFAULT_KEY_ID, getKey, getKeyMenuLabel, getScaleNames, getSignatureAccidentals } from "#lib/key.js";

  // 音律の一覧と、周波数や平均律からのズレを計算する関数を読み込む
  import { TEMPERAMENTS, DEFAULT_TEMPERAMENT_ID, getTemperament, getFrequency, getCentsFromEqual } from "#lib/tuning.js";

  // 設定（音律、音を鳴らすかどうか）と、作業中の楽譜を、
  // ブラウザに保存する関数と、読み込む関数を読み込む
  import { loadTemperamentId, saveTemperamentId, loadSoundEnabled, saveSoundEnabled, loadCurrentScore, saveCurrentScore } from "#lib/settings.js";

  // 指定した周波数の音を鳴らす関数と、鳴っている音を止める関数を読み込む
  import { playTone, stopTone } from "#lib/audio.js";

  // ズレ（セント）を「+3」「−8」のような表示用の文字にする関数を読み込む
  import { formatCents } from "#lib/note.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

  // 楽譜の名前の表示と、「保存」「新規」のボタンをまとめた部品を読み込む
  import SaveBar from "#lib/SaveBar.svelte";

  // ===== メニューに並べる調の一覧（長調と短調に分けておく） =====

  // 長調だけを取り出した一覧
  const majorKeys = KEYS.filter((key) => key.mode === "major");

  // 短調だけを取り出した一覧
  const minorKeys = KEYS.filter((key) => key.mode === "minor");

  // ===== 再生に関する設定値 =====

  // テンポ（1分間の拍の数）の最小・最大・最初の値と、ボタン1回で変わる量
  const TEMPO_MIN = 40;
  const TEMPO_MAX = 200;
  const TEMPO_DEFAULT = 60;
  const TEMPO_STEP = 5;

  // 1拍の長さのうち、実際に音を鳴らす割合
  // 1拍ぶん全部を鳴らすと次の音とつながってしまうので、少し短くして音の区切りを作る
  const NOTE_LENGTH_RATIO = 0.9;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 登録した音の並び（音のデータの配列）。最初は空
  let notes = $state([]);

  // 選択中の調の id（最初はハ長調）
  let keyId = $state(DEFAULT_KEY_ID);

  // 選択中の調のデータ
  // $derived を付けると、keyId が変わるたびに自動で探し直される
  let currentKey = $derived(getKey(keyId));

  // 選択中の調の音階（文字の配列）。例：['ラ', 'シ', 'ド♯', 'レ', 'ミ', 'ファ♯', 'ソ♯', 'ラ']
  let scaleNames = $derived(getScaleNames(currentKey));

  // 選択中の調の調号で、7つの音名それぞれに付く変化記号（1 が♯、-1 が♭、0 がなし）
  // 例：ニ長調のとき [1, 0, 0, 1, 0, 0, 0]（ドとファに♯）
  let keyAccidentals = $derived(getSignatureAccidentals(currentKey.signature));

  // 選択中の音律の id
  // 最初は決まった設定にしておき、画面に表示された後で、保存された設定に入れ替える
  let temperamentId = $state(DEFAULT_TEMPERAMENT_ID);

  // 選択中の音律のデータ（説明の文を表示するために使う）
  let currentTemperament = $derived(getTemperament(temperamentId));

  // 音を入れたとき・選んだときに、音を鳴らすかどうか（true：鳴らす、false：鳴らさない）
  // 最初は「鳴らす」にしておき、画面に表示された後で、保存された設定に入れ替える
  let soundEnabled = $state(true);

  // 選択中のオクターブ（最初は4）
  let selectedOctave = $state(4);

  // 選択中の変化記号。次の4つのどれかが入る
  //   null：選択なし（調号どおりの音になる）
  //   1   ：♯
  //   -1  ：♭
  //   0   ：♮（調号を打ち消して、何も付かない音にする）
  let selectedAccidental = $state(null);

  // 選択中の音が何番目か（0から始まる）。選択していないときは null
  let selectedIndex = $state(null);

  // 選んだ音に対して、音名ボタンで何をするか
  //   'replace'：選んだ音を置き換える
  //   'insert' ：選んだ音の前に挿入する
  // 音を選んでいないときは使わない（そのときは、いつも最後に追加する）
  let editMode = $state("replace");

  // テンポ（1分間の拍の数）。四分音符1つが1拍
  let tempo = $state(TEMPO_DEFAULT);

  // 楽譜を再生しているかどうか（true：再生中、false：停止中）
  let isPlaying = $state(false);

  // 再生中に、今鳴っている音が何番目か（0から始まる）。再生していないときは null
  let playingIndex = $state(null);

  // ===== 再生のために覚えておく値（画面には表示しないので $state は付けない） =====

  // 次の音を鳴らすための予約の番号（停止するときに、予約を取り消すために使う）
  let playbackTimer = null;

  // 再生を始めた時刻（ページを開いてからのミリ秒）
  let playbackStartTime = 0;

  // 再生を始めた音が何番目か
  let playbackStartIndex = 0;

  // 保存された楽譜の読み込みが終わったかどうか（true：終わった、false：まだ）
  // 読み込む前に自動保存が動くと、保存されていた楽譜を空の楽譜で上書きしてしまうので、
  // 読み込みが終わるまでは保存しないようにするための目印
  let isLoaded = $state(false);

  // 今開いている楽譜が、保存した楽譜のどれか（その id）。まだ名前を付けて保存していないときは null
  // 「保存」を押したときに、どの楽譜を上書きするかを決めるために使う
  let savedId = $state(null);

  // 今開いている楽譜の名前。まだ名前を付けて保存していないときは空の文字
  let scoreName = $state("");

  // このページが画面に表示された直後に、保存された設定と楽譜をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    temperamentId = loadTemperamentId();
    soundEnabled = loadSoundEnabled();

    // 作業中の楽譜を読み込む（保存されていないときは null が入り、何もしない）
    const savedScore = loadCurrentScore();
    if (savedScore !== null) {
      // 調（一覧にない id が保存されていた場合は、getKey がハ長調にしてくれる）
      keyId = getKey(savedScore.keyId).id;

      // テンポ（最小と最大の間に収まるようにする）
      tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, savedScore.tempo));

      // 音の並び
      notes = savedScore.notes;

      // 保存した楽譜のどれを開いているかと、その名前
      savedId = savedScore.savedId;
      scoreName = savedScore.name;
    }

    // 読み込みが終わったので、ここから先は自動保存を動かす
    isLoaded = true;
  });

  // 楽譜（調・テンポ・音の並び・どの保存した楽譜を開いているか・名前）が変わるたびに、ブラウザに自動で保存する
  // $effect の中で使っている値が変わるたびに、自動で実行される
  $effect(() => {
    // 読み込みが終わるまでは保存しない
    if (!isLoaded) {
      return;
    }

    saveCurrentScore({
      keyId: keyId,
      tempo: tempo,
      notes: notes,
      savedId: savedId,
      name: scoreName,
    });
  });

  /**
   * 新しい楽譜を作る関数
   * 「新規」ボタンを押して、確認で「OK」を選んだときに呼ばれる。
   * 音の並びを空にして、どの保存した楽譜も開いていない状態にする。調・テンポ・音律はそのまま残す。
   * （保存してある楽譜は消えない。消えるのは、作業中の楽譜の中身だけ）
   */
  function createNewScore() {
    // 再生中なら止める
    stopPlayback();

    // 音の並びを空にして、選択も解除する
    notes = [];
    selectedIndex = null;
    editMode = "replace";

    // どの保存した楽譜も開いていない状態にする（次に「保存」を押すと、名前を聞かれる）
    savedId = null;
    scoreName = "";
  }

  /**
   * 音をすべて消す関数
   * 「すべて消す」ボタンを押したときに呼ばれる。
   * 押し間違いを防ぐために、消す前に確認する。調とテンポはそのまま残す。
   */
  function clearAllNotes() {
    // 確認の画面を出す（「キャンセル」を押すと false が返るので、何もせずに終わる）
    if (!confirm(notes.length + "音をすべて消します。よろしいですか？")) {
      return;
    }

    // 再生中なら止める
    stopPlayback();

    // 音の並びを空にして、選択も解除する
    notes = [];
    selectedIndex = null;
    editMode = "replace";
  }

  // このページが画面から消えるときに、再生を止める
  // （止めないと、別のページに移っても音が鳴り続けてしまうため）
  onDestroy(() => {
    stopPlayback();
  });

  // 文字の一覧（横にスクロールする枠）の部品そのもの。スクロール位置を動かすために使う
  // 画面に表示されるまでは null
  let noteListElement = $state(null);

  // 文字の一覧を、注目している音が見える位置まで自動で横にスクロールする
  // $effect の中で使っている値（再生中の音、選択中の音、音の数）が変わるたびに、自動で実行される
  $effect(() => {
    // 注目する音を決める（再生中の音 → 選択中の音 → 最後の音 の順で優先する）
    // ?? は「左側が null のときだけ右側を使う」という書き方
    const index = playingIndex ?? selectedIndex ?? notes.length - 1;

    // 枠がまだ画面にないときや、音が1つもないときは、何もしない
    if (noteListElement === null || index < 0) {
      return;
    }

    // 注目する音のボタンを取り出す（見つからないときは何もしない）
    const item = noteListElement.children[index];
    if (!item) {
      return;
    }

    // そのボタンが枠の中央に来るように、横のスクロール位置を決める
    // offsetLeft：枠の左端からボタンの左端までの距離、clientWidth：枠の見えている幅
    noteListElement.scrollLeft = item.offsetLeft - noteListElement.clientWidth / 2 + item.offsetWidth / 2;
  });

  /**
   * 音を鳴らすかどうかを切り替える関数
   * チェックボックスを切り替えたときに呼ばれる。
   * 設定を切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
   */
  function changeSoundEnabled(enabled) {
    // 設定を切り替える
    soundEnabled = enabled;

    // ブラウザに保存する
    saveSoundEnabled(enabled);
  }

  /**
   * 音律を切り替える関数
   * 音律のメニューで選び直したときに呼ばれる。
   * 選んだ音律に切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {string} id - 選んだ音律の id（'just'・'pythagorean'・'equal'）
   */
  function changeTemperament(id) {
    // 選んだ音律に切り替える
    temperamentId = id;

    // ブラウザに保存する
    saveTemperamentId(id);
  }

  /**
   * 今選んでいるオクターブと変化記号で、音のデータを作る関数
   * 実際に追加するとき、ボタンを押せるかどうかを調べるとき、ボタンの文字を作るときに使う。
   * 変化記号を選んでいないときは、調号の変化記号を付ける。
   * @param {number} step - 音名の番号（0〜6。0 がド、6 がシ）
   * @returns {{step: number, accidental: number, octave: number}} 音のデータ
   */
  function createNote(step) {
    // 変化記号を決める
    let accidental;
    if (selectedAccidental === null) {
      // 選択なしのとき：調号でこの音名に付く変化記号を使う
      accidental = keyAccidentals[step];
    } else {
      // ♯・♭・♮を選んでいるとき：調号より優先して、選んだものを使う
      accidental = selectedAccidental;
    }

    return {
      step: step,
      accidental: accidental,
      octave: selectedOctave,
    };
  }

  /**
   * 音名ボタンに表示する文字を作る関数
   * ボタンを押したときに実際に追加される音を、オクターブなしで表示する。
   * 例：ニ長調で何も選んでいないとき、ファのボタンは「ファ♯」になる。
   * @param {number} step - 音名の番号（0〜6。0 がド、6 がシ）
   * @returns {string} ボタンに表示する文字（例：'ファ♯'、'シ♭'、'ソ'）
   */
  function getStepButtonText(step) {
    // 今の選択で作られる音のデータから、音名と変化記号を文字にする
    const note = createNote(step);
    return STEP_NAMES[note.step] + accidentalToText(note.accidental);
  }

  /**
   * 音を1つ鳴らす関数
   * 音のデータから、選択中の調と音律での周波数を求めて、その高さの音を鳴らす。
   * 音を鳴らさない設定のときは、何もしない。
   * @param {{step: number, accidental: number, octave: number}} note - 音のデータ
   */
  function playNote(note) {
    // 「鳴らさない」の設定のときは、ここで終わる
    if (!soundEnabled) {
      return;
    }

    playTone(getFrequency(note, currentKey, temperamentId));
  }

  /**
   * 音を追加する、選んだ音を置き換える、または選んだ音の前に挿入する関数
   * 音名ボタンを押したときに呼ばれる。
   * 今選んでいるオクターブと変化記号で音を作る。
   * 音を選んでいないときは並びの最後に追加する。
   * 音を選んでいるときは、editMode に合わせて置き換えるか、前に挿入する。
   * @param {number} step - 音名の番号（0〜6。0 がド、6 がシ）
   */
  function addNote(step) {
    // 音のデータを作る
    const note = createNote(step);

    // 音域の外の音は追加しない（ボタンも押せなくしているが、念のためここでも確認する）
    if (!isInRange(note)) {
      return;
    }

    if (selectedIndex === null) {
      // 音を選んでいないとき：並びの最後に追加する
      notes.push(note);
    } else if (editMode === "replace") {
      // 置き換えのとき：選んだ位置の音を、新しい音に入れ替える
      // 押し間違えたときにすぐ押し直せるように、選択はそのまま残す
      notes[selectedIndex] = note;
    } else {
      // 前に挿入のとき：選んだ位置に新しい音を入れる（選んだ音から後ろは、1つずつ後ろにずれる）
      // splice(位置, 0, 入れるもの) は、何も取り除かずに、その位置へ入れる命令
      notes.splice(selectedIndex, 0, note);

      // 元の音は1つ後ろにずれたので、選択の番号も1つ増やして、同じ音を選んだままにする
      // （続けて押したときに、押した順に並ぶようにするため）
      selectedIndex = selectedIndex + 1;
    }

    // 変化記号の選択を解除する（♯・♭・♮は次の1音にだけ付けるため）
    selectedAccidental = null;

    // 入れた音を鳴らす（追加・置き換え・挿入のどの場合も、耳で確かめられるようにする）
    playNote(note);
  }

  /**
   * 変化記号の選択を切り替える関数
   * ♯ボタン・♭ボタン・♮ボタンを押したときに呼ばれる。
   * すでに選ばれているものをもう一度押すと、解除される。
   * @param {number} value - 押したボタンの変化記号（1 が♯、-1 が♭、0 が♮）
   */
  function toggleAccidental(value) {
    if (selectedAccidental === value) {
      // 同じものをもう一度押したとき：解除する
      selectedAccidental = null;
    } else {
      // 選ばれていないものを押したとき：それを選ぶ
      selectedAccidental = value;
    }
  }

  /**
   * 音を選ぶ関数
   * 五線譜の音符か、文字の一覧の音をタップしたときに呼ばれる。
   * すでに選ばれている音をもう一度タップすると、選択を解除する。
   * @param {number} index - タップされた音が何番目か（0から始まる）
   */
  function selectNote(index) {
    if (selectedIndex === index) {
      // 同じ音をもう一度タップしたとき：解除する
      selectedIndex = null;
    } else {
      // 別の音をタップしたとき：その音を選ぶ
      selectedIndex = index;

      // オクターブのボタンを、選んだ音のオクターブに合わせる
      // （同じオクターブの中で直すことが多いので、選び直す手間を減らすため）
      selectedOctave = notes[index].octave;

      // 選んだ音を鳴らす
      playNote(notes[index]);
    }

    // 選び直したときも、解除したときも、「置き換え」に戻す
    // （「前に挿入」のままになっていることに気づかず、音を増やしてしまうのを防ぐため）
    editMode = "replace";
  }

  /**
   * 音を消す関数
   * 消すボタンを押したときに呼ばれる。
   * 音を選んでいないときは最後の1音を消し、選んでいるときはその音を消す。
   */
  function removeNote() {
    if (selectedIndex === null) {
      // 音を選んでいないとき：並びの最後の1つを取り除く
      notes.pop();
    } else {
      // 音を選んでいるとき：選んだ位置から1つ取り除く（後ろの音は自動で前に詰まる）
      // splice(位置, 個数) は、配列の途中から指定した個数を取り除く命令
      notes.splice(selectedIndex, 1);

      // 選択を解除する（続けて押したときに、次の音まで消してしまわないようにするため）
      selectedIndex = null;

      // 選択を解除したので、「置き換え」に戻す
      editMode = "replace";
    }
  }

  /**
   * テンポを変える関数
   * テンポの「−」「＋」ボタンを押したときに呼ばれる。
   * @param {number} amount - 変える量（遅くするときはマイナス、速くするときはプラス）
   */
  function changeTempo(amount) {
    // 変えた後の値が、最小と最大の間に収まるようにする
    tempo = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo + amount));
  }

  /**
   * 楽譜の再生を始める関数
   * 再生ボタンを押したときに呼ばれる。
   * 音を選んでいるときはその音から、選んでいないときは最初から再生する。
   */
  function startPlayback() {
    // 音が1つもないときは、何もしない
    if (notes.length === 0) {
      return;
    }

    // 再生を始める位置を決める（音を選んでいればその音、選んでいなければ最初の音）
    playbackStartIndex = selectedIndex === null ? 0 : selectedIndex;

    // 再生を始めた時刻を覚えておく（それぞれの音を鳴らす時刻を計算するために使う）
    // performance.now() は、ページを開いてからの時間をミリ秒で返す
    playbackStartTime = performance.now();

    // 再生中にする
    isPlaying = true;

    // 最初の音を鳴らす（そのあとは playStep が、次の音を順に予約していく）
    playStep(playbackStartIndex);
  }

  /**
   * 再生中に、音を1つ鳴らして、次の音を予約する関数
   * 1拍ごとに呼ばれて、最後の音まで順に進む。
   * @param {number} index - 鳴らす音が何番目か（0から始まる）
   */
  function playStep(index) {
    // 最後の音まで鳴らし終わったとき（または途中で音が減ったとき）は、再生を終わる
    if (index >= notes.length) {
      stopPlayback();
      return;
    }

    // 今鳴っている音の位置を更新する（五線譜と文字の一覧に色が付く）
    playingIndex = index;

    // 1拍の長さ（秒）。テンポ60なら1秒、テンポ120なら0.5秒
    const beatSeconds = 60 / tempo;

    // この音を、選択中の調と音律での高さで鳴らす
    // 再生は、「音を入れたとき・選んだときに音を鳴らす」の設定に関係なく鳴らす
    const frequency = getFrequency(notes[index], currentKey, temperamentId);
    playTone(frequency, beatSeconds * NOTE_LENGTH_RATIO);

    // 次の音を鳴らす時刻を、再生を始めた時刻から計算する
    // （「今から1拍後」と数えていくと、少しずつ遅れが積み重なるため）
    const beatsFromStart = index - playbackStartIndex + 1;
    const nextTime = playbackStartTime + beatsFromStart * beatSeconds * 1000;

    // 次の音までの待ち時間（ミリ秒）。すでに過ぎていたら、すぐに鳴らす
    const delay = Math.max(0, nextTime - performance.now());

    // 待ち時間のあとに、次の音でこの関数をもう一度呼ぶように予約する
    playbackTimer = setTimeout(() => playStep(index + 1), delay);
  }

  /**
   * 楽譜の再生を止める関数
   * 停止ボタンを押したとき、最後まで再生し終わったとき、ページを離れるときに呼ばれる。
   */
  function stopPlayback() {
    // 次の音の予約を取り消す
    if (playbackTimer !== null) {
      clearTimeout(playbackTimer);
      playbackTimer = null;
    }

    // 鳴っている音を止める
    stopTone();

    // 停止中に戻し、音符の色も元に戻す
    isPlaying = false;
    playingIndex = null;
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る -->
  <title>楽譜の編集｜ビオラ音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<main>
  <!-- 画面の上の行：ホームへ戻るリンクと、ページのタイトルを横に並べる -->
  <div class="header-row">
    <a class="back-link" href="/">← ホーム</a>
    <h1>楽譜の編集</h1>
  </div>

  <!-- 楽譜の名前と、「新規」「保存」のボタン -->
  <!-- onsaved：新しく保存できたら、その楽譜の id と名前を覚える（次からは同じ楽譜に上書きされる） -->
  <!-- onnew：「新規」を押して確認で「OK」を選んだら、新しい楽譜にする -->
  <SaveBar
    {keyId}
    {tempo}
    {temperamentId}
    {notes}
    {savedId}
    name={scoreName}
    onsaved={(id, name) => {
      savedId = id;
      scoreName = name;
    }}
    onnew={createNewScore}
  />

  <!-- 調と音律の選択：2つのメニューを横に並べる -->
  <div class="select-row">
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

    <!-- 音律のメニュー -->
    <!-- value で今の音律をメニューに表示し、選び直されたら changeTemperament を呼ぶ -->
    <!-- event.currentTarget.value に、選ばれた音律の id が入っている -->
    <select class="temperament-select" aria-label="音律" value={temperamentId} onchange={(event) => changeTemperament(event.currentTarget.value)}>
      {#each TEMPERAMENTS as temperament (temperament.id)}
        <option value={temperament.id}>{temperament.name}</option>
      {/each}
    </select>
  </div>

  <!-- 選択中の調の音階（どの音に♯・♭が付くかを確認するための表示）と、指板の図へのリンクを横に並べる -->
  <div class="scale-row">
    <p class="scale">{scaleNames.join(" ")}</p>

    <!-- 指板の図へのリンク。アドレスの最後に「?key=調の id」を付けて、今選んでいる調を引き継ぐ -->
    <a class="fingerboard-link" href="/fingerboard?key={keyId}">指板で見る →</a>
  </div>

  <!-- あまり使わない設定：ふだんはたたんでおき、「設定」を押したときだけ開く -->
  <!-- details と summary は、押すと開いたり閉じたりする部品を作るためのタグ -->
  <details class="settings">
    <summary>設定</summary>

    <!-- 選択中の音律の説明 -->
    <p class="settings-text">{currentTemperament.name}：{currentTemperament.description}</p>

    <!-- 音を入れたとき・選んだときに、音を鳴らすかどうかの切り替え -->
    <!-- label で囲むと、文字の部分を押してもチェックを切り替えられる -->
    <label class="sound-toggle">
      <!-- checked で今の設定を表示し、切り替えられたら changeSoundEnabled を呼ぶ -->
      <!-- event.currentTarget.checked に、チェックが入っているか（true・false）が入っている -->
      <input type="checkbox" checked={soundEnabled} onchange={(event) => changeSoundEnabled(event.currentTarget.checked)} />
      音を入れたとき・選んだときに音を鳴らす
    </label>

    <!-- 音をすべて消すボタン（音が1つもないときは押せない） -->
    <!-- 押し間違えると困るので、ふだんは見えない「設定」の中に置いている -->
    <button class="clear-button" disabled={notes.length === 0} onclick={clearAllNotes}> 音をすべて消す </button>
  </details>

  <!-- 五線譜（登録した音の並びと、調号の数を渡して表示する） -->
  <!-- selectedIndex で選択中の音を、playingIndex で再生中の音を伝える -->
  <!-- 音符がタップされたら selectNote を呼んでもらう -->
  <Staff {notes} signature={currentKey.signature} {selectedIndex} {playingIndex} onselect={selectNote} />

  <!-- 登録した音の一覧（1行だけ表示して、はみ出した分は横にスクロールする。タップして音を選べる） -->
  <!-- こちらは調号に関係なく、実際に鳴る音をそのまま表示する -->
  <!-- bind:this を付けると、この部品そのものが noteListElement に入り、スクロール位置を動かせる -->
  <div class="note-list" bind:this={noteListElement}>
    {#if notes.length === 0}
      <span class="empty">まだ音がありません</span>
    {:else}
      <!-- 音を1つずつ取り出して、押せるボタンにして並べる -->
      {#each notes as note, index (index)}
        <!-- 選択中の音には selected クラス、再生中の音には playing クラスを付けて色を変える -->
        <button class="note-item" class:selected={selectedIndex === index} class:playing={playingIndex === index} onclick={() => selectNote(index)}>
          {noteToText(note)}
        </button>
      {/each}
    {/if}
  </div>

  <!-- 音の数と、選んだ音の周波数（選択中の音律での周波数と、平均律からのズレ） -->
  <p class="selected-info">
    {#if selectedIndex === null}
      全{notes.length}音。音を選ぶと周波数を表示します
    {:else}
      <!-- 選んだ音のデータを、短い名前で使えるようにしておく -->
      {@const selectedNote = notes[selectedIndex]}
      {noteToText(selectedNote)}　{getFrequency(selectedNote, currentKey, temperamentId).toFixed(1)} Hz（平均律より
      {formatCents(getCentsFromEqual(selectedNote, currentKey, temperamentId))} セント）
    {/if}
  </p>

  <!-- 再生（テンポの指定と、再生・停止のボタン） -->
  <div class="playback-row">
    <!-- 今のテンポ。♩＝60 は「四分音符を1分間に60回」という意味 -->
    <span class="tempo-text">♩＝{tempo}</span>

    <!-- テンポを遅くするボタン（再生中と、これ以上遅くできないときは押せない） -->
    <!-- aria-label は、読み上げで操作する人のための、ボタンの説明 -->
    <button class="tempo-button" aria-label="テンポを遅くする" disabled={isPlaying || tempo <= TEMPO_MIN} onclick={() => changeTempo(-TEMPO_STEP)}> − </button>

    <!-- テンポを速くするボタン（再生中と、これ以上速くできないときは押せない） -->
    <button class="tempo-button" aria-label="テンポを速くする" disabled={isPlaying || tempo >= TEMPO_MAX} onclick={() => changeTempo(TEMPO_STEP)}> ＋ </button>

    <!-- 再生中は「停止」ボタン、停止中は「再生」ボタンを表示する -->
    {#if isPlaying}
      <button class="play-button stop" onclick={stopPlayback}>■ 停止</button>
    {:else}
      <!-- 音が1つもないときは押せない -->
      <!-- 音を選んでいるかどうかで、どこから再生するかをボタンの文字で案内する -->
      <button class="play-button start" disabled={notes.length === 0} onclick={startPlayback}>
        {#if selectedIndex === null}
          ▶ 最初から再生
        {:else}
          ▶ {selectedIndex + 1}番目から再生
        {/if}
      </button>
    {/if}
  </div>

  <!-- 練習ページへのリンク（楽譜は自動で保存されているので、そのまま練習ページで使える） -->
  <a class="practice-link" href="/practice">この楽譜で練習する →</a>
</main>

<!-- 入力パネル：音を入れるためのボタンを、画面の下に固定して表示する -->
<!-- 楽譜が長くなってスクロールしても、ボタンはいつも同じ場所にある -->
<div class="input-panel">
  <!-- パネルの中身（画面が広いときも、上の部分と同じ幅にそろえる） -->
  <div class="input-panel-inner">
    <!-- 1行目：オクターブと変化記号を横に並べる -->
    <div class="option-row">
      <!-- オクターブの選択 -->
      <div class="option-group octave-group">
        <span class="option-caption">オクターブ</span>
        <div class="button-row">
          {#each OCTAVES as octave (octave)}
            <!-- 選択中のオクターブには selected クラスを付けて色を変える -->
            <button class="choice" class:selected={selectedOctave === octave} onclick={() => (selectedOctave = octave)}>
              {octave}
            </button>
          {/each}
        </div>
      </div>

      <!-- 変化記号の選択（押すと次の1音にだけ付く。もう一度押すと解除） -->
      <!-- 何も選んでいないときは、調号どおりの音になる -->
      <div class="option-group accidental-group">
        <span class="option-caption">変化記号（次の1音だけ）</span>
        <div class="button-row">
          <button class="choice" class:selected={selectedAccidental === 1} onclick={() => toggleAccidental(1)}> ♯ </button>
          <button class="choice" class:selected={selectedAccidental === -1} onclick={() => toggleAccidental(-1)}> ♭ </button>
          <button class="choice" class:selected={selectedAccidental === 0} onclick={() => toggleAccidental(0)}> ♮ </button>
        </div>
      </div>
    </div>

    <!-- 2行目：音名ボタンを押すとどうなるかの案内 -->
    <p class="input-hint">
      {#if selectedIndex === null}
        音名：最後に追加します
      {:else if editMode === "replace"}
        <!-- 最後に追加する動きではないことに気づきやすいように、赤字にする -->
        <span class="replace-hint">音名：{selectedIndex + 1}番目の「{noteToText(notes[selectedIndex])}」を置き換えます</span>
      {:else}
        <span class="replace-hint">音名：{selectedIndex + 1}番目の「{noteToText(notes[selectedIndex])}」の前に挿入します</span>
      {/if}
    </p>

    <!-- 3行目：音名ボタン（押すと、音が追加されるか、選んだ音が置き換わるか、選んだ音の前に入る） -->
    <div class="step-row">
      {#each STEP_NAMES as stepName, step (step)}
        <!-- 今の選択で音域の外になる音は、ボタンを押せなくする -->
        <!-- ボタンの文字は、押したときに実際に追加される音にする（例：ニ長調のファは「ファ♯」） -->
        <button class="step" disabled={!isInRange(createNote(step))} onclick={() => addNote(step)}>
          {getStepButtonText(step)}
        </button>
      {/each}
    </div>

    <!-- 4行目：選んだ音をどうするかの切り替えと、消すボタン -->
    <!-- 音を選んでいないときも場所を確保しておき、パネルの高さが変わらないようにする -->
    <div class="edit-row">
      <!-- 置き換え・前に挿入の切り替え（音を選んでいないときは押せない） -->
      <!-- 選ばれているほうに selected クラスを付けて色を変える -->
      <button class="choice" class:selected={selectedIndex !== null && editMode === "replace"} disabled={selectedIndex === null} onclick={() => (editMode = "replace")}> 置き換え </button>
      <button class="choice" class:selected={selectedIndex !== null && editMode === "insert"} disabled={selectedIndex === null} onclick={() => (editMode = "insert")}> 前に挿入 </button>

      <!-- 消すボタン（音が1つもないときは押せない） -->
      <!-- 音を選んでいるかどうかで、ボタンの文字を切り替える -->
      <button class="remove" disabled={notes.length === 0} onclick={removeNote}>
        {#if selectedIndex === null}
          最後を消す
        {:else}
          選んだ音を消す
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  /* 画面の上の部分（スクロールする部分）：スマホで見やすいように幅を制限して中央に寄せる */
  main {
    max-width: 480px;
    margin: 0 auto;
    /* 下の余白を大きく取っているのは、画面の下に固定した入力パネルに、最後の部分が隠れないようにするため */
    padding: 12px 16px 230px 16px;
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

  /* 調と音律のメニューを横に並べる */
  .select-row {
    display: flex;
    gap: 8px;
  }

  /* メニュー共通：指で押しやすい大きさにする */
  .key-select,
  .temperament-select {
    /* min-width: 0 を付けると、中の文字が長くても、決めた割合より広がらない */
    min-width: 0;
    padding: 8px 4px;
    font-size: 0.95rem;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    background-color: white;
  }

  /* 調のメニュー：名前が長いので、音律のメニューより広くする（横幅を 3：2 に分ける） */
  .key-select {
    flex: 3;
  }

  /* 音律のメニュー */
  .temperament-select {
    flex: 2;
  }

  /* 選択中の調の音階：小さくグレーで表示する */
  .scale {
    margin: 6px 0 0 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 音階と、指板の図へのリンクを横に並べる（音階は左、リンクは右） */
  .scale-row {
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

  /* あまり使わない設定（ふだんはたたんである） */
  .settings {
    margin-top: 4px;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 「設定」の文字（押すと開く部分） */
  .settings summary {
    cursor: pointer;
  }

  /* 設定の中の説明文 */
  .settings-text {
    margin: 6px 0 0 0;
  }

  /* 音を鳴らすかどうかのチェックボックス */
  .sound-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    cursor: pointer;
  }

  /* 「音をすべて消す」ボタン：小さく、赤い枠で表示する */
  button.clear-button {
    margin-top: 10px;
    padding: 6px 12px;
    font-size: 0.85rem;
    color: #c62828;
    background-color: white;
    border: 1px solid #c62828;
  }

  /* 登録した音の一覧：1行だけ表示して、はみ出した分は横にスクロールする */
  .note-list {
    /* 中のボタンの位置を、この枠を基準にして調べられるようにする（スクロール位置の計算に使う） */
    position: relative;
    display: flex;
    gap: 6px;
    padding: 6px;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    /* 横にはみ出した分をスクロールできるようにする */
    overflow-x: auto;
  }

  /* 音が1つもないときのメッセージ（一覧のボタンと同じ高さになるように、上下の余白をそろえる） */
  .empty {
    padding: 6px 4px;
    font-size: 0.95rem;
    color: #757575;
  }

  /* 一覧の中の1音（選択前） */
  /* 枠は透明にしておき、選択中だけ色を付ける（枠の有無で大きさが変わらないようにするため） */
  button.note-item {
    /* 横幅が足りなくてもボタンを縮めない（縮めずに、横スクロールさせる） */
    flex-shrink: 0;
    padding: 6px 8px;
    font-size: 0.95rem;
    color: #212121;
    background-color: #e3f2fd;
    border: 2px solid transparent;
    border-radius: 6px;
  }

  /* 一覧の中の1音（選択中）：五線譜の選択中の色に合わせて、濃い青の枠と文字にする */
  button.note-item.selected {
    color: #0d47a1;
    background-color: #bbdefb;
    border-color: #0d47a1;
  }

  /* 一覧の中の1音（再生中）：五線譜の再生中の色に合わせて、オレンジの枠と文字にする */
  /* 選択中のスタイルより後に書いているので、選択中の音が再生されたときはオレンジが優先される */
  button.note-item.playing {
    color: #e65100;
    background-color: #ffe0b2;
    border-color: #e65100;
  }

  /* 音の数と、選んだ音の周波数の表示 */
  .selected-info {
    margin: 6px 0 0 0;
    font-size: 0.85rem;
    color: #424242;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 再生のエリア：テンポの表示・テンポのボタン・再生ボタンを横に並べる */
  .playback-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
  }

  /* テンポの表示（♩＝60） */
  .tempo-text {
    /* テンポが3けたになっても横幅が変わらないように、幅を決めておく */
    min-width: 4.5em;
    font-size: 1rem;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* 再生の行のボタン共通：高さを数値で決めて、3つのボタンの高さをそろえる */
  /* （文字の高さに任せると、「−」と「＋」でフォントが違うときに、ボタンの高さがずれるため） */
  .playback-row button {
    height: 44px;
    /* 高さを決めたので、上下の余白はなくす */
    padding: 0;
    /* 文字の行の高さを文字の大きさと同じにして、文字による高さの違いをなくす */
    line-height: 1;
  }

  /* テンポの「−」「＋」ボタン：正方形にする */
  button.tempo-button {
    width: 44px;
    flex-shrink: 0;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 再生・停止ボタン：残りの横幅いっぱいに広げる */
  button.play-button {
    flex: 1;
    color: white;
    border: none;
  }

  /* 再生ボタン（緑） */
  button.play-button.start {
    background-color: #2e7d32;
  }

  /* 停止ボタン（赤） */
  button.play-button.stop {
    background-color: #c62828;
  }

  /* 練習ページへのリンク：白地に青い枠のボタンのような見た目にする */
  .practice-link {
    display: block;
    margin-top: 10px;
    padding: 10px;
    color: #1976d2;
    border: 2px solid #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }

  /* 入力パネル：画面の下に固定する */
  .input-panel {
    /* position: fixed を付けると、スクロールしても画面の同じ場所に表示され続ける */
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: white;
    border-top: 1px solid #bdbdbd;
    /* 上に薄い影を付けて、楽譜の上に重なっていることが分かるようにする */
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
    font-family: sans-serif;
  }

  /* 入力パネルの中身：上の部分と同じ幅にそろえて、中央に寄せる */
  .input-panel-inner {
    max-width: 480px;
    margin: 0 auto;
    /* 下の余白には、スマホの画面の下にある操作用のすき間（ホームバーなど）の分を足す */
    padding: 8px 16px calc(8px + env(safe-area-inset-bottom, 0px)) 16px;
  }

  /* オクターブと変化記号を横に並べる */
  .option-row {
    display: flex;
    gap: 12px;
  }

  /* オクターブ、変化記号それぞれのまとまり：小さな見出しとボタンを縦に並べる */
  .option-group {
    display: flex;
    flex-direction: column;
    gap: 2px;
    /* min-width: 0 を付けると、中の文字が長くても、決めた割合より広がらない */
    min-width: 0;
  }

  /* オクターブはボタンが4つ、変化記号は3つなので、横幅を 4：3 に分ける */
  .octave-group {
    flex: 4;
  }

  .accidental-group {
    flex: 3;
  }

  /* オクターブ、変化記号の小さな見出し */
  .option-caption {
    font-size: 0.7rem;
    color: #616161;
    /* 幅が足りないときは、折り返さずに1行で表示する */
    white-space: nowrap;
  }

  /* ボタンを横に並べる（オクターブ、変化記号で使う） */
  .button-row {
    display: flex;
    gap: 4px;
  }

  /* 音名ボタンを押すとどうなるかの案内 */
  .input-hint {
    margin: 6px 0 4px 0;
    font-size: 0.8rem;
    color: #424242;
    /* 長くなっても折り返さず、はみ出した分は「…」で省略する（パネルの高さが変わらないようにするため） */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 「〇番目の音を置き換えます」の案内：赤い太字にして目立たせる */
  .replace-hint {
    color: #c62828;
    font-weight: bold;
  }

  /* 音名ボタンを7つ、同じ幅で横に並べる */
  .step-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
  }

  /* 置き換え・前に挿入・消すのボタンを横に並べる */
  .edit-row {
    display: flex;
    gap: 4px;
    margin-top: 6px;
  }

  /* ボタン共通：縦を短くしつつ、指で押せる大きさは保つ */
  button {
    padding: 10px 0;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 切り替えのボタン（選択前）：白地に青い枠 */
  button.choice {
    flex: 1;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 切り替えのボタン（選択中）：青く塗る */
  button.choice.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 音名ボタン：緑。一番よく押すので、ほかのボタンより少し縦を長くする */
  button.step {
    padding: 12px 0;
    color: white;
    background-color: #2e7d32;
    border: none;
    /* 「ファ♯」が3文字になるので、狭い画面でも1行に収まるように小さめにする */
    font-size: 0.9rem;
    /* 文字が2行に折り返されないようにする */
    white-space: nowrap;
  }

  /* 置き換え・前に挿入・消すのボタンは、文字が長いので少し小さい字にする */
  .edit-row button {
    font-size: 0.9rem;
  }

  /* 「消す」ボタン：赤 */
  button.remove {
    flex: 1.2;
    color: white;
    background-color: #c62828;
    border: none;
  }
</style>
