<script>
  // 読み込んだ楽譜の練習ページ（ステップA-2）
  // URL の id（例：/imported/practice?id=xm1x2y3z4-k8f3q2）で、どの楽譜を開くかを決める。
  // 横向きのスマホやタブレットでも広く使えるように、五線譜はほかのページより広い幅まで広げる。
  // （ステップB：「じっくり」の練習を足した。手入力の楽譜の練習ページ（/practice）と同じ設定
  //   （区間・くり返す・モード・判定のレベル・開放弦）を並べ、レベル・開放弦は共通の設定として保存する。
  //   「通し」は、ステップCで足すまで押せないようにしておく）
  // （ステップB-2：目標の音を見つけやすくするため、音符を明るい青にして、後ろにうすい青の帯を敷くようにした）
  // （ステップC-1：「通し」を足した。お手本の時刻表どおりに進んで、音程を判定する。音程の最高点を記録する。
  //   選んだモードは、手入力の楽譜の練習ページと共通の設定として保存する）
  // （ステップD：リズムの判定を足したので、リズムの OK の幅を渡し、リズムの最高点も記録・表示する）
  // （ステップE-1：「通し」が動いている間は、楽譜の名前・最高点・設定などを隠して、楽譜を広く見せる。
  //   弓の記号と指番号を表示するかどうかを、チェックで切り替えられるようにした（共通の設定として保存する））
  // （「じっくり」の前打音：「じっくり」では、前打音も1つの目標の音として判定する。「通し」と区間の決め方は今のまま）
  // （保持線：保持線（指を押さえたままにする線）も表示するようにして、チェックの名前を「弓の記号・指番号・指の保持線を表示する」にした。
  //   「保持線」だけだと何のことか分かりにくいので、「指の保持線」と書く）

  // tick：画面の書き換えが終わるのを待つための仕組み（「通し」を始めたときに、いちばん上へスクロールするのに使う）

  // onMount：このページが画面に表示された直後に処理をするための仕組み
  import { onMount, tick } from "svelte";

  // 読み込んだ楽譜を id で探す関数・五線譜に描く形にする関数・灰色にする音符の表を作る関数と、
  // 判定する音の並びを作る関数・くり返しがあるかを調べる関数・音符の場所から番号を探す関数・区間を決める関数を読み込む
  import { getImportedScore, toRenderScore, getExcludedNoteColors, buildTargets, hasRepeats, findTargetIndexes, findRange } from "#lib/imported.js";

  // 小節を「3小節目」などの文字にする関数を読み込む（楽譜作成アプリからコピーしたもの）
  import { measureName } from "#lib/musicxml/model.js";

  // 調のデータを探す関数と、調の名前を作る関数を読み込む
  import { getKey, getKeyLabel } from "#lib/key.js";

  // 音律の一覧を読み込む（練習ページで音律を選び直せるようにするため）
  import { TEMPERAMENTS } from "#lib/tuning.js";

  // 判定のレベル・開放弦の設定を、ブラウザから読み込む関数と、ブラウザに保存する関数を読み込む
  // （手入力の楽譜の練習ページと同じ保存場所なので、どちらで変えても同じ設定になる）
  // （ステップC-1：練習のモードも、共通の設定として読み込む・保存する）
  // （ステップE-1：弓の記号と指番号の表示も、読み込む・保存する）
  import { loadLevelId, saveLevelId, loadOpenStringEnabled, saveOpenStringEnabled, loadModeId, saveModeId, loadImportedSymbolsVisible, saveImportedSymbolsVisible } from "#lib/settings.js";

  // 判定のレベルの一覧と、レベルのデータを探す関数を読み込む
  import { LEVELS, DEFAULT_LEVEL_ID, getLevel } from "#lib/level.js";

  // 「じっくり」モードの練習の部品を読み込む（五線譜の部分は、このページから差し替える）
  // （1画面に収める手直し：「じっくり」の五線譜の枠の高さの上限 STEP_STAFF_HEIGHT も、いっしょに読み込む）
  import StepPractice, { STEP_STAFF_HEIGHT } from "#lib/StepPractice.svelte";

  // 読み込んだ楽譜の五線譜を描く部品を読み込む
  import ImportedStaff from "#lib/ImportedStaff.svelte";

  // 読み込んだ楽譜の「通し」モードの練習の部品を読み込む（ステップC-1）
  import ImportedRunPractice from "#lib/ImportedRunPractice.svelte";

  // お手本の時刻表を作る関数と、区間の部分だけを取り出す関数を読み込む（ステップC-1）
  import { buildTimeline, sliceTimeline } from "#lib/importedTimeline.js";

  // 「通し」の音程の最高点を記録する関数を読み込む（ステップC-1）
  // （ステップD：リズムの最高点を記録する関数も読み込む）
  // （ステップE-2：流れるモードの幅の倍率を、楽譜に保存する関数も読み込む）
  // （音律の選び直し：音律を、楽譜に保存する関数も読み込む）
  import { recordBestPitchScore, recordBestRhythmScore, saveFlowScale, saveImportedTemperament } from "#lib/imported.js";

  // ===== 練習のモードに関する設定値（ステップB） =====

  // 選べる練習のモードの一覧（手入力の楽譜の練習ページと同じ）
  //   id          ：モードを区別するための名前
  //   name        ：画面に表示する名前
  //   description ：どんな練習なのかの短い説明
  // （ステップC-1：「通し」を使えるようにした）
  const MODES = [
    { id: "step", name: "じっくり", description: "合うまで次へ進まない" },
    { id: "run", name: "通し", description: "テンポに合わせて弾く。点数が出る" },
  ];

  // ===== 五線譜の色（ステップB） =====
  // （ステップB-2：濃い青 #0d47a1 は黒い音符と見分けにくかったので、明るい青にして、後ろに帯も敷くようにした）
  const TARGET_COLOR = "#1976d2"; // 今の目標の音・区間を選ぶときに1回目にタップした音（明るい青）
  const PASSED_COLOR = "#2e7d32"; // 通過した音（緑）

  // 「通し」を始める前・終わったあとの、五線譜の枠の高さの上限
  // 画面の4割くらいにして、下のボタンがいつも見えるようにする（横向きのスマホでも小さくなりすぎないように、220px より低くはしない）
  // （1画面に収める手直し：「じっくり」では、StepPractice の STEP_STAFF_HEIGHT を使うようにした）
  const STAFF_HEIGHT_PRACTICE = "max(40vh, 220px)";

  // 区間を選ぶときの、五線譜の枠の高さの上限（選ぶときは楽譜を広く見たいので、少し高くする）
  const STAFF_HEIGHT_RANGE = "max(60vh, 260px)";

  // 「通し」が動いている間の、五線譜の枠の高さの上限（ステップE-1）
  // 画面の高さ（100dvh）から、ページの上下の余白・五線譜の枠の余白・「やめる」ボタンの行のぶん（約100px）を引いた高さ
  // （dvh は、スマホのアドレスバーが出たり引っこんだりしても、実際に見えている高さになる単位。
  //   狭すぎる画面でも小さくなりすぎないように、160px より低くはしない）
  const STAFF_HEIGHT_RUNNING = "max(calc(100dvh - 100px), 160px)";

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 開いている楽譜（読み込んだ楽譜）。見つかるまでは null
  let record = $state(null);

  // 楽譜を探し終わったかどうか（true：探し終わった）
  // 探す前に「見つかりません」と表示されてしまうのを防ぐための目印
  let isLoaded = $state(false);

  // 五線譜に描く形の楽譜（楽譜作成アプリの形）。楽譜が見つかったときに1回だけ作る
  // （描く関数は「同じ楽譜か」を === で比べて、測った結果を使い回すので、毎回作り直さないようにする）
  let renderScoreData = $state(null);

  // 判定から外す音を灰色にするための、音符ごとの色の表
  let excludedColors = $state(new Map());

  // 判定する音の並び（くり返しを展開したもの）。楽譜の全体を練習するときに使う（ステップB）
  let allTargets = $state([]);

  // 楽譜に、くり返しがあるかどうか（true：ある）（ステップB）
  let repeatsExist = $state(false);

  // 選択中の判定のレベルの id（'normal'：ノーマル、'easy'：イージー）
  let levelId = $state(DEFAULT_LEVEL_ID);

  // 「開放弦の高さで弾いた音もOKにする」設定（true：する）
  let openStringEnabled = $state(true);

  // 流れるモードの幅の倍率（楽譜ごとに覚える。1 なら自動で決めた幅のまま）（ステップE-2）
  let flowScale = $state(1);

  // 弓の記号・指番号・指の保持線を表示するかどうか（true：表示する）（ステップE-1。保持線：保持線も足した）
  let symbolsVisible = $state(true);

  // 「通し」が動いている最中かどうか（true：動いている。楽譜の名前・設定などを隠す）（ステップE-1）
  let isRunFocus = $state(false);

  // 開放弦の設定の説明を表示しているかどうか（true：表示している）。「？」ボタンで切り替える
  let showsOpenStringHelp = $state(false);

  // 最後の音まで行ったら、最初の音に戻ってくり返すかどうか（true：くり返す）
  let repeatEnabled = $state(false);

  // 選択中の練習のモードの id（'step'：じっくり、'run'：通し）（ステップC-1）
  let modeId = $state("step");

  // 「通し」のテンポ（♩＝○○）。最初は楽譜のテンポ。「通し」で変えたら、ページを開いている間は覚えておく（ステップC-1）
  let runTempo = $state(80);

  // 音程の最高点（まだ無いときは null）と、更新した直後かどうか（ステップC-1）
  let bestPitchScore = $state(null);
  let isNewRecord = $state(false);

  // リズムの最高点（まだ無いときは null）と、更新した直後かどうか（ステップD）
  let bestRhythmScore = $state(null);
  let isNewRhythmRecord = $state(false);

  // ===== 練習する区間（ステップB） =====

  // 区間を決めたときに使った、判定する音の並び（くり返しを含めるかどうかで、並びが変わるため）
  let rangeTargets = $state([]);

  // 練習する区間の、始めと終わりが、rangeTargets の何番目か（0から）。楽譜の全体のときは、どちらも null
  let rangeStart = $state(null);
  let rangeEnd = $state(null);

  // 区間を決めたときに、くり返しを含めたかどうか（true：含めた）
  let rangeIncludesRepeats = $state(true);

  // 区間を選んでいる最中かどうか（true：選んでいる最中）
  let isSelectingRange = $state(false);

  // 区間を選んでいる最中の、「くり返しを含める」のチェック（true：含める）。最初は含める
  let includeRepeats = $state(true);

  // 区間を選んでいる最中に、1回目にタップした音符の場所 { measure, note }。まだタップしていないときは null
  let pendingPosition = $state(null);

  // 区間を選んでいる最中に、判定しない音符（休符・灰色の音）をタップしたときの案内（なければ空の文字）
  let rangeMessage = $state("");

  // ===== 計算で決まる値（$derived を付けると、元の値が変わるたびに自動で計算し直される） =====

  // 練習する音の並び（区間を決めているときは、その区間だけ）
  let practiceTargets = $derived(rangeStart === null ? allTargets : rangeTargets.slice(rangeStart, rangeEnd + 1));

  // 「じっくり」で使う、前打音も入れた目標の並び（「じっくり」の前打音）
  // 区間を決めているときは、決めたときと同じ並び（くり返しを含めるか）で作る。くり返しのない楽譜では、いつも展開した並び
  let stepPool = $derived.by(() => {
    if (record === null) {
      return [];
    }
    const expand = rangeStart === null ? true : repeatsExist ? rangeIncludesRepeats : true;
    return buildTargets(record, expand, true);
  });

  // 「じっくり」で練習する目標の並び（区間を決めているときは、その区間の主音と、その前打音だけ）
  // 区間の番号は前打音を入れない並びでの番号なので、前打音を入れない並びでの番号（baseIndex）で切り出す
  let stepTargets = $derived(rangeStart === null ? stepPool : stepPool.filter((target) => target.baseIndex >= rangeStart && target.baseIndex <= rangeEnd));

  // 「じっくり」の部品に渡す、音のデータの並び
  let practiceNotes = $derived(stepTargets.map((target) => target.note));

  // 「じっくり」の部品に渡す、前打音の目標の位置に true が入った配列
  let practiceGraceFlags = $derived(stepTargets.map((target) => target.grace === true));

  // 楽譜に前打音の目標があるか（あれば、「前打音は…」の説明を出す）
  let hasGraceTargets = $derived(stepPool.some((target) => target.grace === true));

  // 画面に表示する、今の区間の説明（例：「全体（120音）」「3小節目〜8小節目（24音）・くり返しを含む」）
  let rangeText = $derived.by(() => {
    if (rangeStart === null) {
      return "全体（" + allTargets.length + "音）";
    }
    const first = practiceTargets[0].positions[0];
    const last = practiceTargets[practiceTargets.length - 1].positions[0];
    const repeatNote = repeatsExist ? (rangeIncludesRepeats ? "・くり返しを含む" : "・くり返しなし") : "";
    return measureName(renderScoreData, first.measure) + "〜" + measureName(renderScoreData, last.measure) + "（" + practiceTargets.length + "音）" + repeatNote;
  });

  // 五線譜に描く小節の範囲 { from, to }（ステップD-3）
  // 区間を決めているときは、区間の音がある小節のうち、いちばん前からいちばん後ろまで（くり返しで戻る区間でも、まとめて1つの範囲）。
  // 楽譜の全体のときは null（全部の小節を描く）。区間を選ぶ画面では使わない（全体から選べるように）
  let displayRange = $derived.by(() => {
    if (rangeStart === null || practiceTargets.length === 0) {
      return null;
    }
    const measures = practiceTargets.flatMap((target) => target.positions.map((p) => p.measure));
    return { from: Math.min(...measures), to: Math.max(...measures) };
  });

  // 区間が変わったことを見分けるための目印。これが変わると、練習の部品を作り直して、最初の音からやり直す
  let rangeKey = $derived(rangeStart + "-" + rangeEnd + "-" + rangeIncludesRepeats);

  // 調のデータ
  let currentKey = $derived(record !== null ? getKey(record.keyId) : getKey(""));

  // 「OK」とする範囲（セント）。選択中のレベルによって変わる
  let tolerance = $derived(getLevel(levelId).tolerance);

  // リズムの「OK」とする範囲（秒）。選択中のレベルによって変わる（ステップD）
  let rhythmTolerance = $derived(getLevel(levelId).rhythmTolerance);

  // 開放弦の設定を、画面に表示するかどうか（純正律のときだけ表示する。手入力の楽譜の練習ページと同じ）
  let showsOpenStringSetting = $derived(record !== null && record.temperamentId === "just");

  // 開放弦の高さで弾いた音を、実際に OK にするかどうか
  let allowOpenString = $derived(showsOpenStringSetting && openStringEnabled);

  // 区間を選んでいる最中の、五線譜の色（灰色の音 ＋ 1回目にタップした音符）
  let rangeColors = $derived.by(() => {
    const colors = new Map(excludedColors);
    if (pendingPosition !== null) {
      colors.set("0-" + pendingPosition.measure + "-" + pendingPosition.note, TARGET_COLOR);
    }
    return colors;
  });

  // このページが画面に表示された直後に、URL の id から楽譜を探し、保存された設定を読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    // 判定のレベルと開放弦の設定（手入力の楽譜の練習ページと共通）
    levelId = loadLevelId();
    openStringEnabled = loadOpenStringEnabled();
    modeId = loadModeId(); // ステップC-1
    symbolsVisible = loadImportedSymbolsVisible(); // ステップE-1

    // URL の「?id=○○」の部分を取り出す（なければ null）
    const id = new URL(location.href).searchParams.get("id");

    if (id !== null) {
      const found = getImportedScore(id);
      if (found !== null) {
        record = found;
        renderScoreData = toRenderScore(found, symbolsVisible); // ステップE-1：弓の記号と指番号を描くかどうかも渡す
        excludedColors = getExcludedNoteColors(found.partMeasures);
        allTargets = buildTargets(found, true); // 全体の練習は、くり返しを展開した順
        repeatsExist = hasRepeats(found);
        runTempo = found.tempo; // ステップC-1
        bestPitchScore = typeof found.bestPitchScore === "number" ? found.bestPitchScore : null; // ステップC-1
        bestRhythmScore = typeof found.bestRhythmScore === "number" ? found.bestRhythmScore : null; // ステップD
        flowScale = typeof found.flowScale === "number" ? found.flowScale : 1; // ステップE-2
      }
    }

    isLoaded = true;
  });

  /**
   * 「じっくり」のときの、五線譜の色の表を作る関数（ステップB）
   * 灰色の音（判定から外す音）に、通過した音（緑）と、今の目標の音（青）を重ねる。
   * くり返しで同じ音符が2回出てくるときは、今の目標の音の色をいちばん優先する。
   * @param {number} targetIndex - 今の目標の音が、練習する音の並びの何番目か（0から）
   * @param {boolean[]} passed - 通過した音の位置に true が入った配列
   * @returns {Map<string, string>} 音符ごとの色の表
   */
  function practiceColors(targetIndex, passed) {
    const colors = new Map(excludedColors);

    // 色の表のキー（「じっくり」の前打音：前打音の目標は、最後に「-g」を付けて、主音の色とは別にする）
    const keyOf = (target, p) => "0-" + p.measure + "-" + p.note + (target.grace ? "-g" : "");

    // 通過した音（タイでつながった音符も全部）を緑にする
    stepTargets.forEach((target, index) => {
      if (passed[index]) {
        target.positions.forEach((p) => colors.set(keyOf(target, p), PASSED_COLOR));
      }
    });

    // 今の目標の音を青にする（いちばん最後に入れるので、緑より優先される）
    const current = stepTargets[targetIndex];
    if (current !== undefined) {
      current.positions.forEach((p) => colors.set(keyOf(current, p), TARGET_COLOR));
    }

    return colors;
  }

  /**
   * 「じっくり」のときに、五線譜の音符がタップされたときの処理をする関数（ステップB）
   * タップした音符を、目標の音にする。
   * くり返しで同じ音符が2回以上出てくるときは、今の目標より後ろで、いちばん近いものにする（なければ、いちばん前のもの）。
   * @param {{measure: number, note: number}} position - タップした音符の場所
   * @param {number} targetIndex - 今の目標の音の番号
   * @param {(index: number) => void} setTarget - 目標の音を変える関数（「じっくり」の部品から受け取ったもの）
   */
  function selectFromStaff(position, targetIndex, setTarget) {
    const indexes = findTargetIndexes(stepTargets, position);

    // 判定しない音符（休符・灰色の音）や、区間の外の音符をタップしたときは、何もしない
    if (indexes.length === 0) {
      return;
    }

    // 今の目標より後ろで、いちばん近いもの（なければ、いちばん前のもの）
    const after = indexes.find((index) => index > targetIndex);
    setTarget(after ?? indexes[0]);
  }

  /**
   * 練習のモードを切り替える関数（ステップC-1）
   * 「じっくり」「通し」のボタンを押したときに呼ばれる。選んだモードをブラウザに保存する（手入力の練習ページと共通）。
   * @param {string} id - 選んだモードの id（'step'：じっくり、'run'：通し）
   */
  function changeMode(id) {
    modeId = id;
    saveModeId(id);
  }

  /**
   * 「通し」の部品に渡す、お手本の時刻表を作る関数（ステップC-1）
   * テンポを受け取って、今の区間（区間を決めていなければ全体）の時刻表を返す。
   * 区間を決めたときの並び（くり返しを含めるか）と、同じ並びで作るので、番号がそろう。
   * @param {number} tempo - テンポ（♩＝○○）
   * @returns {object} 時刻表（importedTimeline.js の形）
   */
  function getTimeline(tempo) {
    if (rangeStart === null) {
      // 全体：くり返しを展開した並びの、最初から最後まで
      const timeline = buildTimeline(record, tempo, true);
      return sliceTimeline(timeline, 0, timeline.items.length - 1);
    }
    // 区間：区間を決めたときと同じ並び（くり返しのない楽譜では、いつも展開した並び）
    const expand = repeatsExist ? rangeIncludesRepeats : true;
    return sliceTimeline(buildTimeline(record, tempo, expand), rangeStart, rangeEnd);
  }

  /**
   * 「通し」で最後まで弾けたときに、音程とリズムの最高点を記録する関数（ステップC-1。ステップD でリズムも足した）
   * 区間を指定せずに、楽譜の全体を弾いたときだけ記録する（手入力の楽譜の「通し」と同じ決まり）。
   * 音程とリズムは、別々に記録する（片方だけ更新することもある）。
   * @param {number} points - その回の音程の点数（0〜100）
   * @param {number} rhythmPoints - その回のリズムの点数（0〜100）（ステップD）
   */
  function handleRunFinish(points, rhythmPoints) {
    if (rangeStart !== null) {
      return;
    }
    const result = recordBestPitchScore(record.id, points);
    if (result !== null) {
      bestPitchScore = result.bestScore;
      isNewRecord = result.isNewRecord;
    }
    const rhythmResult = recordBestRhythmScore(record.id, rhythmPoints);
    if (rhythmResult !== null) {
      bestRhythmScore = rhythmResult.bestScore;
      isNewRhythmRecord = rhythmResult.isNewRecord;
    }
  }

  /**
   * 判定のレベルを切り替える関数
   * 「ノーマル」「イージー」のボタンを押したときに呼ばれる。選んだレベルをブラウザに保存する（手入力の練習ページと共通）。
   * @param {string} id - 選んだレベルの id（'normal'・'easy'）
   */
  function changeLevel(id) {
    levelId = id;
    saveLevelId(id);
  }

  /**
   * 「開放弦の高さで弾いた音もOKにする」設定を切り替える関数
   * チェックボックスを押したときに呼ばれる。設定をブラウザに保存する（手入力の練習ページと共通）。
   * @param {boolean} enabled - チェックが入っているかどうか（true：入っている）
   */
  function changeOpenStringEnabled(enabled) {
    openStringEnabled = enabled;
    saveOpenStringEnabled(enabled);
  }

  /**
   * 音律を選び直す関数（選択欄を変えたときに呼ばれる）
   * 画面の楽譜の記録（record）の音律を書き換えて、その楽譜に保存する（次に開いても同じ音律になる）。
   * 判定に使う部品には record.temperamentId が渡されているので、これだけで、判定・目標の音の高さが新しい音律に変わる。
   * 純正律以外にしたときは、「開放弦の設定」は（showsOpenStringSetting が false になって）自動で隠れる。
   * 「通し」の最高点は、楽譜の音が変わらないので、そのまま残す。
   * @param {string} temperamentId - 選んだ音律の id（'just'・'pythagorean'・'equal'）
   */
  function changeTemperament(temperamentId) {
    // 楽譜が読み込めていないときは、何もしない
    if (record === null) {
      return;
    }
    // 画面に出している記録の音律を書き換える（→ 判定の部品に新しい音律が渡る）
    record.temperamentId = temperamentId;
    // その楽譜に保存する（保存できなかったときも、このページを開いている間は新しい音律で練習できる）
    saveImportedTemperament(record.id, temperamentId);
  }

  /**
   * 「弓の記号・指番号・指の保持線を表示する」設定を切り替える関数（ステップE-1。保持線：保持線も足した）
   * チェックボックスを押したときに呼ばれる。設定をブラウザに保存して、五線譜に描く形の楽譜を作り直す（→ 五線譜が描き直される）。
   * @param {boolean} visible - チェックが入っているかどうか（true：表示する）
   */
  function changeSymbolsVisible(visible) {
    symbolsVisible = visible;
    saveImportedSymbolsVisible(visible);
    renderScoreData = toRenderScore(record, visible);
  }

  /**
   * 流れるモードの幅の倍率を変えたときに呼ばれる関数（ステップE-2）
   * 楽譜に保存する（次に開いたときも、同じ幅で流れる）。
   * @param {number} scale - 新しい倍率
   */
  function handleFlowScaleChange(scale) {
    flowScale = scale;
    saveFlowScale(record.id, scale);
  }

  /**
   * 「通し」が動きはじめたとき・止まったときに呼ばれる関数（ステップE-1）
   * 動いている間は、楽譜の名前・設定などを隠す。動きはじめたら、ページのいちばん上へスクロールして、楽譜が見えるようにする。
   * @param {boolean} running - 動いているかどうか（true：動いている）
   */
  async function handleRunningChange(running) {
    isRunFocus = running;
    if (running) {
      // 隠したものが画面から消えるのを待ってから、いちばん上へスクロールする
      await tick();
      window.scrollTo({ top: 0 });
    }
  }

  /**
   * 区間を選びはじめる関数（ステップB）
   * 区間の「変更」ボタンを押したときに呼ばれる。練習の部品の代わりに楽譜の全体を表示して、音符をタップできるようにする。
   */
  function openRangeSelector() {
    pendingPosition = null;
    rangeMessage = "";
    includeRepeats = rangeIncludesRepeats; // チェックは、今の区間に合わせておく
    isSelectingRange = true;
  }

  /**
   * 区間を選ぶのをやめる関数（ステップB）
   * 「キャンセル」ボタンを押したときと、区間を決めたときに呼ばれる。
   */
  function closeRangeSelector() {
    pendingPosition = null;
    rangeMessage = "";
    isSelectingRange = false;
  }

  /**
   * 区間を選んでいる最中に、音符がタップされたときの処理をする関数（ステップB）
   * 1回目のタップで片方の端を覚え、2回目のタップで区間を決める。
   * @param {{measure: number, note: number}} position - タップした音符の場所
   */
  function handleRangeTap(position) {
    // 判定しない音符（休符・灰色の音）は、区間の端にできない
    if (findTargetIndexes(allTargets, position).length === 0) {
      rangeMessage = "休符や灰色の音は、区間の端に選べません。ほかの音符をタップしてください。";
      return;
    }
    rangeMessage = "";

    // 1回目のタップ：タップされた音符を覚えて、2回目を待つ
    if (pendingPosition === null) {
      pendingPosition = position;
      return;
    }

    // 2回目のタップ：「くり返しを含める」のチェックに合わせて並びを作り、区間を決める
    // （くり返しがない楽譜では、どちらでも同じ並びになる）
    const targets = buildTargets(record, repeatsExist ? includeRepeats : true);
    const range = findRange(targets, pendingPosition, position);
    if (range === null) {
      return;
    }

    if (range.start === 0 && range.end === allTargets.length - 1 && (includeRepeats || !repeatsExist)) {
      // 最初の音から最後の音までを、くり返しも含めて選んだとき：「全体」と同じなので、区間を決めていない状態にする
      rangeStart = null;
      rangeEnd = null;
      rangeIncludesRepeats = true;
    } else {
      // それ以外：選んだ区間にする
      rangeTargets = targets;
      rangeStart = range.start;
      rangeEnd = range.end;
      rangeIncludesRepeats = includeRepeats;
    }

    closeRangeSelector();
  }

  /**
   * 区間を「全体」に戻す関数（ステップB）
   * 「全体に戻す」ボタンを押したときに呼ばれる。
   */
  function clearRange() {
    rangeStart = null;
    rangeEnd = null;
    rangeIncludesRepeats = true;
  }
</script>

<!-- svelte:head の中に書いたものは、ページの「head」（画面には出ない、ページについての情報を書く場所）に入る -->
<svelte:head>
  <!-- title：ブラウザのタブに出る（楽譜が見つかったら、楽譜の名前も出す） -->
  <title>{record !== null ? record.name + "｜" : ""}練習（読み込んだ楽譜）｜ビオラ音程チェック</title>

  <!-- このページは検索結果に載せない（中身は、使う人それぞれのブラウザに入っている楽譜なので） -->
  <meta name="robots" content="noindex" />
</svelte:head>

<!-- 「じっくり」の部品に渡す、五線譜の描き方（ステップB） -->
<!-- 「じっくり」の部品から、今の目標の音の番号・通過した音・目標を変える関数を受け取って、読み込んだ楽譜の五線譜を描く -->
<!-- （1画面に収める手直しの続き：「練習を始める」を押すたびに増える数 scrollRequest も受け取って、目標の音の段までスクロールする） -->
<!-- （高さを測って合わせる手直し：「じっくり」の部品が測って決めた五線譜の枠の高さ staffHeight も受け取って、maxHeight に使う） -->
{#snippet importedStaff(targetIndex, passed, setTarget, scrollRequest, staffHeight)}
  <ImportedStaff
    score={renderScoreData}
    noteColors={practiceColors(targetIndex, passed)}
    focus={stepTargets[targetIndex]?.positions[0] ?? null}
    bands={stepTargets[targetIndex]?.positions ?? []}
    maxHeight={staffHeight ?? STEP_STAFF_HEIGHT}
    {scrollRequest}
    measureRange={displayRange}
    onselect={(position) => selectFromStaff(position, targetIndex, setTarget)}
  />
{/snippet}

<main>
  <!-- 画面の上の行：一覧へ戻るリンク（ステップE-1：「通し」が動いている間は隠す） -->
  {#if !isRunFocus}
    <div class="header-row">
      <a class="back-link" href="/imported">← 読み込んだ楽譜</a>
    </div>
  {/if}

  {#if !isLoaded}
    <!-- 楽譜を探すまでの、ごく短い間の表示 -->
    <p class="message">読み込み中…</p>
  {:else if record === null}
    <!-- 楽譜が見つからないとき（削除したあとに、前のアドレスを開いたときなど） -->
    <p class="message">楽譜が見つかりませんでした。一覧から開き直してください。</p>
    <a class="link-button" href="/imported">読み込んだ楽譜の一覧へ</a>
  {:else}
    <!-- ===== 楽譜の情報と設定（ステップE-1：「通し」が動いている間は、まとめて隠す） ===== -->
    {#if !isRunFocus}
      <!-- 楽譜の情報 -->
      <h1>{record.name}</h1>
      <div class="score-info-row">
        <p class="detail">
          {record.partName}・{getKeyLabel(currentKey)}・♩＝{record.tempo}・
          <!-- 音律の選択欄：選ぶと、判定に使う音の高さがすぐ切り替わり、楽譜ごとに覚える -->
          <select class="temperament-select" aria-label="音律" value={record.temperamentId} onchange={(event) => changeTemperament(event.currentTarget.value)}>
            {#each TEMPERAMENTS as temperament (temperament.id)}
              <option value={temperament.id}>{temperament.name}</option>
            {/each}
          </select>
        </p>
        <!-- 指板の図へのリンク。アドレスの最後に「?key=調の id」を付けて、楽譜の調を引き継ぐ（ステップB） -->
        <a class="fingerboard-link" href="/fingerboard?key={record.keyId}">指板で見る →</a>
      </div>

      <!-- 音程の最高点（ステップC-1）：記録があるとき・区間を指定しているときに出す -->
      <!-- （ステップD：リズムの最高点も並べる） -->
      {#if bestPitchScore !== null || bestRhythmScore !== null || rangeStart !== null}
        <p class="best-row">
          {#if bestPitchScore !== null}
            最高点 音程 <strong>{bestPitchScore}点</strong>
            {#if isNewRecord}
              <span class="new-record">更新！</span>
            {/if}
          {/if}
          {#if bestRhythmScore !== null}
            <span class="best-item">リズム <strong class="rhythm">{bestRhythmScore}点</strong></span>
            {#if isNewRhythmRecord}
              <span class="new-record">更新！</span>
            {/if}
          {/if}
          {#if rangeStart !== null}
            <span class="record-note">区間を指定しているときは、記録されません</span>
          {/if}
        </p>
      {/if}

      <!-- 灰色の音の説明（灰色の音があるときだけ出す） -->
      {#if excludedColors.size > 0}
        <p class="note">灰色の音は、判定しない音です（音域の外の音・トリルなどの装飾の付いた音など）。</p>
      {/if}

      <!-- 前打音の説明（前打音のある楽譜のときだけ出す）（「じっくり」の前打音） -->
      {#if hasGraceTargets}
        <p class="note">前打音（小さい音符）は、「じっくり」では判定します（目標になると青くなります）。「通し」では判定しません。</p>
      {/if}

      <!-- ===== 設定（ステップB。手入力の楽譜の練習ページと同じ並び） ===== -->

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
      <!-- bind:checked を付けると、チェックの状態と repeatEnabled の値が、いつも同じになる -->
      <label class="repeat-row">
        <input type="checkbox" bind:checked={repeatEnabled} />
        くり返す（最後の音まで行ったら、最初の音に戻る）
      </label>

      <!-- 練習のモードの切り替え：名前と短い説明を付けたボタンを横に並べる（ステップC-1：「通し」も選べるようにした） -->
      <div class="mode-row">
        {#each MODES as mode (mode.id)}
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
          <button class="level-button" class:selected={levelId === level.id} onclick={() => changeLevel(level.id)}>
            {level.name}（±{level.tolerance}）
          </button>
        {/each}
      </div>

      <!-- 開放弦の設定：純正律のときだけ表示する -->
      {#if showsOpenStringSetting}
        <div class="open-string-row">
          <!-- label で囲むと、文字の部分を押してもチェックを切り替えられる -->
          <label class="open-string-label">
            <input type="checkbox" checked={openStringEnabled} onchange={(event) => changeOpenStringEnabled(event.currentTarget.checked)} />
            開放弦の高さで弾いた音もOKにする（ド3・ソ3・レ4・ラ4）
          </label>

          <!-- 「？」ボタン：押すたびに、説明を表示する・隠すを切り替える -->
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

      <!-- 弓の記号・指番号・指の保持線を表示するかどうか（ステップE-1。保持線：保持線も足した）。「じっくり」「通し」「区間を選ぶ画面」のすべてに効く -->
      <label class="repeat-row">
        <input type="checkbox" checked={symbolsVisible} onchange={(event) => changeSymbolsVisible(event.currentTarget.checked)} />
        弓の記号・指番号・指の保持線を表示する
      </label>
    {/if}

    {#if isSelectingRange}
      <!-- ===== 区間を選んでいる最中：練習の部品の代わりに、楽譜の全体を表示する（ステップB） ===== -->
      <div class="range-selector">
        <!-- 案内：1回目のタップの前と後で、文を変える -->
        <p class="range-guide">
          {#if pendingPosition === null}
            区間の<strong>始めの音</strong>をタップしてください
          {:else}
            区間の<strong>終わりの音</strong>をタップしてください（{measureName(renderScoreData, pendingPosition.measure)}の音から）
          {/if}
        </p>

        <!-- くり返しを含めるかどうか：くり返しのある楽譜のときだけ出す -->
        {#if repeatsExist}
          <label class="repeat-row">
            <input type="checkbox" bind:checked={includeRepeats} />
            くり返しを含める（くり返す所は2回弾く）
          </label>
        {/if}

        <!-- 休符や灰色の音をタップしたときの案内 -->
        {#if rangeMessage !== ""}
          <p class="range-message">{rangeMessage}</p>
        {/if}

        <!-- 楽譜の全体。1回目にタップした音符は、青くして後ろに帯を敷く（ステップB-2：帯を足した） -->
        <ImportedStaff score={renderScoreData} noteColors={rangeColors} bands={pendingPosition !== null ? [pendingPosition] : []} maxHeight={STAFF_HEIGHT_RANGE} onselect={handleRangeTap} />

        <!-- 選ぶのをやめるボタン -->
        <button class="range-cancel-button" onclick={closeRangeSelector}>キャンセル</button>
      </div>
    {:else}
      <!-- ===== 練習の部品（ステップB：「じっくり」、ステップC-1：「通し」） ===== -->
      <!-- key で囲むと、rangeKey（区間の目印）が変わったときに、中の部品が作り直される（最初の音からやり直す） -->
      <!-- モードを切り替えると、前のモードの部品は画面から消え、マイクも自動で止まる -->
      <!-- （ステップE-1：「通し」が動いている間は、上の間をあけない） -->
      <div class="practice-area" class:focused={isRunFocus}>
        {#key rangeKey}
          {#if modeId === "run"}
            <!-- 「通し」：時刻表を作る関数・テンポ・最高点を記録する関数などを渡す -->
            <ImportedRunPractice
              score={renderScoreData}
              baseColors={excludedColors}
              {getTimeline}
              {currentKey}
              initialTempo={runTempo}
              temperamentId={record.temperamentId}
              {tolerance}
              {rhythmTolerance}
              {allowOpenString}
              {repeatEnabled}
              staffHeight={STAFF_HEIGHT_PRACTICE}
              focusStaffHeight={STAFF_HEIGHT_RUNNING}
              measureRange={displayRange}
              ontempochange={(value) => (runTempo = value)}
              onrunningchange={handleRunningChange}
              {flowScale}
              onflowscalechange={handleFlowScaleChange}
              onfinish={handleRunFinish}
            />
          {:else}
            <!-- 「じっくり」：五線譜の部分は、上の importedStaff で描く（staff に渡す） -->
            <StepPractice notes={practiceNotes} graceFlags={practiceGraceFlags} {currentKey} temperamentId={record.temperamentId} {tolerance} {allowOpenString} {repeatEnabled} staff={importedStaff} />
          {/if}
        {/key}
      </div>
    {/if}
  {/if}
</main>

<style>
  /* 画面全体：横向きのスマホやタブレットでも広く使えるように、ほかのページ（480px）より広い幅まで広げる */
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 12px 16px 24px 16px;
    font-family: sans-serif;
  }

  /* 画面の上の行 */
  .header-row {
    margin-bottom: 8px;
  }

  /* 一覧へ戻るリンク */
  .back-link {
    color: #1976d2;
    font-size: 0.9rem;
    text-decoration: none;
  }

  /* 楽譜の名前：長いときは折り返す */
  h1 {
    margin: 0;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }

  /* 楽譜の情報と、指板の図へのリンクを横に並べる（入りきらないときは折り返す）（ステップB） */
  .score-info-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }

  /* パート・調・テンポ・音律：小さくグレーで表示する */
  .detail {
    margin: 2px 0 0 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 音律の選択欄：まわりの小さな文字に合わせる */
  .temperament-select {
    font-size: 0.85rem;
    color: #424242;
    padding: 2px 4px;
    border: 1px solid #bdbdbd;
    border-radius: 6px;
    background: #fff;
  }

  /* 指板の図へのリンク */
  .fingerboard-link {
    font-size: 0.85rem;
    color: #1976d2;
    text-decoration: none;
  }

  /* 音程の最高点の行（ステップC-1） */
  .best-row {
    margin: 6px 0 0 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 最高点の数字：緑の太字 */
  .best-row strong {
    color: #2e7d32;
  }

  /* リズムの最高点：音程の最高点との間をあける（ステップD） */
  .best-item {
    margin-left: 8px;
  }

  /* リズムの最高点の数字：紫（「通し」のリズムの点数と同じ色）（ステップD） */
  .best-row strong.rhythm {
    color: #6a1b9a;
  }

  /* 「更新しました！」：オレンジの太字 */
  .new-record {
    margin-left: 6px;
    font-weight: bold;
    color: #e65100;
  }

  /* 「区間を指定しているときは、記録されません」：小さく */
  .record-note {
    margin-left: 6px;
    font-size: 0.8rem;
    color: #9e9e9e;
  }

  /* 灰色の音の説明：小さく表示する */
  .note {
    margin: 6px 0 0 0;
    font-size: 0.8rem;
    color: #757575;
  }

  /* ===== 設定（ステップB。手入力の楽譜の練習ページと同じ見た目） ===== */

  /* 区間の行：名前・説明・ボタンを横に並べる */
  .range-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
    margin-top: 10px;
    font-size: 0.9rem;
  }

  /* 「区間」の文字 */
  .range-caption {
    color: #616161;
  }

  /* 今の区間の説明：残りの横幅を使う */
  .range-text {
    flex: 1;
    min-width: 0;
  }

  /* 区間の「変更」「全体に戻す」ボタン */
  .range-button {
    padding: 6px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 1px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* くり返しのチェック */
  .repeat-row {
    display: block;
    margin-top: 8px;
    font-size: 0.9rem;
  }

  /* モードのボタンを横に並べる */
  .mode-row {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }

  /* モードのボタン1つぶん：名前と説明を縦に並べる */
  .mode-button {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 選択中のモード：青く塗る */
  .mode-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* モードの名前 */
  .mode-name {
    font-size: 1rem;
    font-weight: bold;
  }

  /* モードの説明 */
  .mode-description {
    font-size: 0.75rem;
  }

  /* 判定のレベルの行 */
  .level-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 0.9rem;
  }

  /* 「判定」の文字 */
  .level-caption {
    color: #616161;
  }

  /* レベルのボタン */
  .level-button {
    padding: 6px 12px;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 1px solid #1976d2;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 選択中のレベル：青く塗る */
  .level-button.selected {
    color: white;
    background-color: #1976d2;
  }

  /* 開放弦の設定の行：チェックボックスと「？」ボタンを横に並べる */
  .open-string-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    font-size: 0.85rem;
  }

  /* 開放弦のチェックの文字：残りの横幅を使う */
  .open-string-label {
    flex: 1;
  }

  /* 「？」ボタン：小さな丸 */
  .help-button {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    font-size: 0.9rem;
    color: #1976d2;
    background-color: white;
    border: 1px solid #1976d2;
    border-radius: 50%;
    cursor: pointer;
  }

  /* 開放弦の説明：うすい青の地に表示する */
  .help-text {
    margin: 6px 0 0 0;
    padding: 8px 10px;
    font-size: 0.8rem;
    line-height: 1.6;
    background-color: #e3f2fd;
    border-radius: 8px;
  }

  /* ===== 区間を選ぶ画面（ステップB） ===== */

  /* 区間を選ぶエリア：上に少し間をあける */
  .range-selector {
    margin-top: 12px;
  }

  /* 区間を選ぶときの案内 */
  .range-guide {
    margin: 0 0 4px 0;
    font-size: 0.95rem;
  }

  /* 休符や灰色の音をタップしたときの案内：赤い字 */
  .range-message {
    margin: 4px 0;
    font-size: 0.85rem;
    color: #c62828;
  }

  /* 区間を選ぶのをやめるボタン */
  .range-cancel-button {
    display: block;
    width: 100%;
    margin-top: 8px;
    padding: 10px;
    font-size: 1rem;
    color: #424242;
    background-color: white;
    border: 1px solid #bdbdbd;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 練習の部品のエリア：上に少し間をあける */
  .practice-area {
    margin-top: 12px;
  }

  /* 「通し」が動いている間：上に何もないので、間をあけない（ステップE-1） */
  .practice-area.focused {
    margin-top: 0;
  }

  /* 「読み込み中」「見つかりませんでした」などのメッセージ */
  .message {
    margin: 24px 0 12px 0;
    color: #616161;
  }

  /* 一覧へ案内するリンク（ボタンのような見た目にする） */
  .link-button {
    display: block;
    max-width: 480px;
    padding: 12px;
    color: white;
    background-color: #1976d2;
    border-radius: 8px;
    text-align: center;
    text-decoration: none;
  }
</style>
