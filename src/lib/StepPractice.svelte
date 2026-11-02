<script module>
  // 「じっくり」の五線譜の枠の高さの上限（CSS の書き方）（1画面に収める手直し）
  // 画面の高さ（100dvh）から、五線譜の下に並ぶもの（目標の音・メーター・判定・ボタン）の高さを引いた分を、五線譜に使う。
  // 練習を始めたときに五線譜を画面のいちばん上に動かすので、五線譜から「目標の音を聴く」までが1画面に収まる。
  // 画面がとても低いときでも、五線譜が1段（約120px）は見えるように、下限を 150px にする。
  // 読み込んだ楽譜の練習ページでも、同じ高さを使う（export して、そちらから読み込む）
  // （高さを測って合わせる手直し：「練習を始める」を押したあとは、下に並ぶものの実際の高さを測って決めた高さ（staffHeight）を使う。
  //   この値は、測る前（練習を始める前）に使う。380px と決め打ちだと、Pixel 8 などで下のボタンが画面の外に出てしまったため）
  export const STEP_STAFF_HEIGHT = "max(calc(100dvh - 380px), 150px)";
</script>

<script>
  // 「じっくり」モードの練習の部品
  // 目標の音を1つずつ表示し、マイクの音とのズレをメーターで見せる。
  // 音程が合った状態を一定時間保てたら、次の音へ進む。
  // （ステップB：五線譜の部分だけを、使う側から差し替えられるようにした（staff）。読み込んだ楽譜の練習ページで使う）
  // （「じっくり」の前打音：読み込んだ楽譜の練習では、前打音も1つの目標の音として並ぶ。graceFlags で、どの目標が前打音かを受け取る）
  // （外したら正しい音を鳴らす：音程を外して弾き終わったとき（音が途切れたとき）に、目標の音を1秒鳴らす。設定でオン・オフできる。
  //   手入力の楽譜の練習ページと、読み込んだ楽譜の練習ページの両方で使われる）

  // onMount：この部品が画面に表示された直後に処理をするための仕組み
  // onDestroy：この部品が画面から消えるときに後片付けをするための仕組み
  // tick：画面の書き換えが終わるのを待つための仕組み（1画面に収める手直し）
  import { onMount, onDestroy, tick } from "svelte";

  // 音のデータを表示用の文字にする関数を読み込む
  import { noteToText } from "#lib/score.js";

  // 周波数や、平均律からのズレを計算する関数と、開放弦の周波数を返す関数を読み込む
  import { getFrequency, getCentsFromEqual, getOpenStringFrequency } from "#lib/tuning.js";

  // 合図の音の設定を、ブラウザから読み込む関数と、ブラウザに保存する関数を読み込む
  // （外したら正しい音を鳴らす：正しい音を鳴らすかどうかの設定も読み込む）
  import { loadChimeEnabled, saveChimeEnabled, loadMissToneEnabled, saveMissToneEnabled } from "#lib/settings.js";

  // 指定した周波数の音を鳴らす関数、鳴っている音を止める関数、合図の音を鳴らす関数を読み込む
  import { playTone, stopTone, playChime } from "#lib/audio.js";

  // マイクの音の高さを調べはじめる関数と、やめる関数を読み込む
  import { startMicrophone, stopMicrophone } from "#lib/microphone.js";

  // ズレ（セント）を「+3」「−8」のような表示用の文字にする関数と、
  // 周波数から一番近い音名を求める関数を読み込む
  import { formatCents, frequencyToNote } from "#lib/note.js";

  // 五線譜を描く部品を読み込む
  import Staff from "#lib/Staff.svelte";

  // ズレを表示するメーターの部品を読み込む
  import Meter from "#lib/Meter.svelte";

  // この部品を使う側（練習ページ）から受け取る値
  // notes         ：練習する楽譜の音の並び（音のデータの配列。1つ以上入っていること）
  // currentKey    ：楽譜の調のデータ
  // temperamentId ：音律の id
  // tolerance     ：「OK」とする範囲（セント）。判定のレベルによって変わる
  // allowOpenString：開放弦の高さで弾いた音も OK にするかどうか（true：する）
  // repeatEnabled  ：最後の音まで弾けたら、最初の音に戻ってくり返すかどうか（true：くり返す）
  // graceFlags     ：notes と同じ順番で、前打音の目標の位置に true が入った配列（「じっくり」の前打音）。渡さなければ、前打音はない
  // staff          ：五線譜の部分を差し替えるときに渡す、描き方のまとまり（Svelte の snippet）（ステップB）
  //                  渡さなければ、今までどおりの五線譜（Staff）を出す
  //                  渡すときは、次の3つを受け取って描く：
  //                    targetIndex … 今の目標の音が何番目か（0から）
  //                    passed      … 通過した音の位置に true が入った配列
  //                    setTarget   … 目標の音を変える関数（音符をタップしたときに、番号を渡して呼ぶ）
  //                    scrollRequest … 「練習を始める」を押すたびに1増える数（増えたら、五線譜の枠の中を目標の音の段までスクロールする）
  //                                    （1画面に収める手直しの続き）
  //                    staffHeight … 五線譜の枠の高さの上限（CSS の書き方。例："412px"）（高さを測って合わせる手直し）
  //                                  練習を始めたあとは、下に並ぶものの高さを測って決めた値。始める前は STEP_STAFF_HEIGHT
  //                  null が初期値（渡されなかったとき）
  let { notes, currentKey, temperamentId, tolerance, allowOpenString, repeatEnabled, graceFlags = [], staff = null } = $props();

  // 今の目標が前打音かどうか（true：前打音）。目標の音の見出しに「前打音」と添えるのに使う（「じっくり」の前打音）
  let isGraceTarget = $derived(graceFlags[targetIndex] === true);

  // ===== 判定に関する設定値 =====

  // メーターに表示する範囲（セント）。ズレがこれを超えたら「もっと高い」「もっと低い」と表示する
  const METER_RANGE = 50;

  // OK を何ミリ秒保てたら、次の音へ進むか（500ミリ秒 ＝ 0.5秒）
  const HOLD_MILLISECONDS = 500;

  // OK から外れても、この時間（ミリ秒）以内に OK に戻れば、保てていることにする
  // 弓を返すときなどの、ごく短い途切れでやり直しにならないようにするため
  const GRACE_MILLISECONDS = 150;

  // 次の音へ進んだ直後に、判定を待つ時間（ミリ秒）
  // 前の音の響きを拾って、次の音の判定を始めてしまうのを防ぐため
  const WAIT_AFTER_ADVANCE_MILLISECONDS = 300;

  // 合図の音を鳴らしたときに、判定を待つ時間（ミリ秒）
  // 合図の音をマイクが拾うと、検出する高さが一瞬乱れる。
  // それを「音が途切れた」と勘違いしないように、合図を鳴らさないときより長く待つ
  const WAIT_AFTER_CHIME_MILLISECONDS = 600;

  // 2つの音が「同じ高さ」かどうかを見分けるための幅（セント）
  // 次の音が同じ高さのときは、いったん音が途切れるまで判定を待つ
  const SAME_PITCH_CENTS = 30;

  // お手本の音を鳴らす長さ（秒）
  const LISTEN_SECONDS = 1;

  // お手本の音を鳴らしたあと、判定を止めておく時間（ミリ秒）
  // お手本の音をマイクが拾って「OK」になってしまうのを防ぐため、鳴らす長さより少し長くする
  const MUTE_MILLISECONDS = LISTEN_SECONDS * 1000 + 200;

  // ===== 外したら正しい音を鳴らす（外したら正しい音を鳴らす） =====

  // 「外した」とみなすのに必要な、「高い」「低い」が続いた時間（ミリ秒）
  // 音の出はじめや、音の高さを探してすべる一瞬の間は、外したことにしないため
  const MISS_OFF_PITCH_MILLISECONDS = 200;

  // 「弾き終わった」とみなすのに必要な、音が出ていない時間（ミリ秒）
  // 弓を返すときなどの、ごく短い途切れでは鳴らさないため
  const MISS_SOUND_END_MILLISECONDS = 300;

  // 前の音を弾き続けているとみなす幅（セント）
  // 通過した前の音を伸ばしている間は、次の音を外したことにしない
  const PREVIOUS_NOTE_CENTS = 50;

  // ===== 画面に表示する値（$state を付けると、値が変わったとき画面も自動で更新される） =====

  // 今の目標の音が何番目か（0から始まる）
  let targetIndex = $state(0);

  // マイクで音を聴いているかどうか（true：聴いている、false：止まっている）
  let isListening = $state(false);

  // マイクで検出した、今弾いている音の周波数（Hz）。音が出ていないときは null
  let detectedFrequency = $state(null);

  // エラーメッセージ（エラーがないときは空文字）
  let errorMessage = $state("");

  // OK をどのくらい保てているか（0〜1）。0 は保てていない、1 は必要な時間を保てた
  // ゲージの長さに使う
  let holdProgress = $state(0);

  // それぞれの音を通過したかどうか（notes と同じ順番で、通過した音の位置に true が入る配列）
  // 例：[true, true] は、1番目と2番目を通過した状態。最初は空（どの音も通過していない）
  let passed = $state([]);

  // 最後の音まで通過したかどうか（true：最後まで弾けた、false：まだ途中）
  let isFinished = $state(false);

  // ===== 判定のために覚えておく値（画面には表示しないので $state は付けない） =====

  // この時刻（ページを開いてからのミリ秒）までは、判定を止めておく
  // お手本の音を鳴らしている間、その音をマイクが拾ってしまうため
  let muteUntil = 0;

  // OK になりはじめた時刻（ミリ秒）。OK を保てていないときは null
  let holdStartTime = null;

  // 最後に OK だった時刻（ミリ秒）。短い途切れを見逃すために使う
  let lastOkTime = 0;

  // この時刻（ミリ秒）までは、次の音の判定を始めない（次の音へ進んだ直後の待ち時間）
  let waitUntil = 0;

  // 音がいったん途切れるのを待っているかどうか
  // 同じ高さの音が続くときに、前の音を弾き続けているだけで通過してしまうのを防ぐ
  let needRelease = false;

  // 今の音で「外した」と分かっているか（true：外した。弾き終わったら、正しい音を鳴らす）
  let missed = false;

  // 「高い」「低い」が続きはじめた時刻（ミリ秒）。続いていないときは null
  let offPitchStart = null;

  // 音が出なくなりはじめた時刻（ミリ秒）。音が出ているときは null
  let silenceStart = null;

  // 1つ前に通過した音の周波数（Hz）。前の音を伸ばしているだけのとき、外したことにしないために使う。なければ null
  let previousNoteFrequency = null;

  // 今の目標の音のデータ
  // $derived を付けると、targetIndex が変わるたびに自動で取り出し直される
  let targetNote = $derived(notes[targetIndex]);

  // 今の目標の音の、選択中の音律での周波数（Hz）
  let targetFrequency = $derived(getFrequency(targetNote, currentKey, temperamentId));

  // 今の目標の音を開放弦で弾いたときの周波数（Hz）
  // 「開放弦の高さで弾いた音もOKにする」ときで、目標の音が開放弦と同じ音（ド3・ソ3・レ4・ラ4）のときだけ入る
  // それ以外のときは null
  let openFrequency = $derived(allowOpenString ? getOpenStringFrequency(targetNote) : null);

  // 今弾いている音が、目標の音から何セントずれているか。プラスは高い、マイナスは低い
  // 音が出ていないときは null
  // $derived.by は、何行かの計算の結果を入れておきたいときに使う
  let cents = $derived.by(() => {
    // 音が出ていないときは null
    if (detectedFrequency === null) {
      return null;
    }

    // 音律での高さとのずれ。周波数の比を、セントに変換する（周波数が2倍で1200セント）
    const targetCents = 1200 * Math.log2(detectedFrequency / targetFrequency);

    // 開放弦の高さとは比べないとき：音律での高さとのずれを、そのまま使う
    if (openFrequency === null) {
      return targetCents;
    }

    // 開放弦の高さとのずれ
    const openCents = 1200 * Math.log2(detectedFrequency / openFrequency);

    // ずれが小さいほうを採用する（Math.abs は、マイナスを取って「ずれの大きさ」にする）
    return Math.abs(openCents) < Math.abs(targetCents) ? openCents : targetCents;
  });

  // 判定の結果。次の4つのどれかが入る
  //   'none'：音が出ていない
  //   'ok'  ：OK（ズレが OK の範囲に入っている）
  //   'low' ：低い
  //   'high'：高い
  let judgement = $derived(getJudgement(cents));

  // ズレがメーターの範囲を超えているかどうか（別の音を弾いている可能性が高い）
  let isFar = $derived(cents !== null && Math.abs(cents) > METER_RANGE);

  // 今弾いている音に一番近い音名（平均律で調べたもの）。音が出ていないときは null
  // ズレが大きいときに、「今は〇〇の音が出ています」と案内するために使う
  let detectedNote = $derived(detectedFrequency !== null ? frequencyToNote(detectedFrequency) : null);

  // この部品が画面から消えるとき（別のモードに切り替えたときや、ページを離れたとき）に、
  // マイクと、鳴っている音を止める
  onDestroy(() => {
    stopMicrophone();
    stopTone();
  });

  // 判定のレベルが切り替わって OK の範囲が変わったら、数えていた時間を最初に戻す
  // $effect の中で使っている値（tolerance）が変わるたびに、自動で実行される
  $effect(() => {
    // tolerance を読んで、「この値が変わったら実行する」とSvelteに伝える
    tolerance;

    resetHold();
  });

  /**
   * ズレ（セント）から、判定の結果を決める関数
   * @param {number|null} centsValue - 目標の音からのズレ（セント）。音が出ていないときは null
   * @returns {string} 'none'（音が出ていない）・'ok'・'low'（低い）・'high'（高い）のどれか
   */
  function getJudgement(centsValue) {
    if (centsValue === null) {
      // 音が出ていない
      return "none";
    } else if (centsValue < -tolerance) {
      // OK の範囲より下
      return "low";
    } else if (centsValue > tolerance) {
      // OK の範囲より上
      return "high";
    } else {
      // OK の範囲の中
      return "ok";
    }
  }

  /**
   * マイクで音を聴きはじめる関数
   * 「練習を始める」ボタンを押したときに呼ばれる。
   * マイクの使用許可を取り、弾いている音の高さを調べつづける。
   */
  async function startListening() {
    // 前回のエラーメッセージを消す
    errorMessage = "";

    try {
      // マイクを開始する。音の高さが分かるたびに、handlePitch が呼ばれる
      await startMicrophone(handlePitch);

      // 聴いている状態にする
      isListening = true;

      // 五線譜が画面のいちばん上に来るようにスクロールする（メーターなどが出てから動かす）（1画面に収める手直し）
      // （高さを測って合わせる手直し：先に、メーターなどが出たあとの高さを測って、五線譜の枠の高さを決めてから動かす）
      await tick();
      fitStaffHeight();
      await tick();
      scrollPracticeToTop();

      // 五線譜の枠の中も、目標の音の段までスクロールする（手で先の段を見ていても、練習する所に戻す）
      // 読み込んだ楽譜の五線譜には、数を増やして知らせる。今までの五線譜は、ここで動かす
      scrollRequest = scrollRequest + 1;
      scrollStaffToTarget(true);
    } catch (error) {
      // 許可を拒否された場合や、マイクが見つからない場合はここに来る
      // どんなエラーかは、microphone.js が日本語のメッセージにしてくれている
      errorMessage = error.message;
    }
  }

  /**
   * マイクで音の高さが分かるたびに呼ばれる関数（1秒に約60回）
   * 検出した音を画面に反映し、OK を保てている時間を数えて、十分に保てたら次の音へ進む。
   * @param {number|null} frequency - 検出した周波数（Hz）。音が出ていないときは null
   */
  function handlePitch(frequency) {
    // 今の時刻（ページを開いてからのミリ秒）
    const now = performance.now();

    // お手本の音を鳴らしている間は、音が出ていないことにして、何も数えない
    if (now < muteUntil) {
      detectedFrequency = null;
      resetHold();
      resetMiss();
      return;
    }

    // 検出した周波数を入れる（これで、ズレと判定の結果も自動で計算し直される）
    detectedFrequency = frequency;

    // 最後まで弾けたあとは、メーターを動かすだけで、通過の判定はしない
    if (isFinished) {
      return;
    }

    // 次の音へ進んだ直後の待ち時間の間は、何も数えない
    if (now < waitUntil) {
      resetHold();
      resetMiss();
      return;
    }

    // 音が途切れるのを待っているとき
    if (needRelease) {
      if (judgement === "ok") {
        // まだ前の音が鳴りつづけているので、何も数えない
        resetHold();
        resetMiss();
        return;
      }

      // 音が途切れた（または別の高さになった）ので、ここから先はふつうに判定する
      needRelease = false;
    }

    // 音程を外したかどうかを数える（弾き終わったときに、正しい音を鳴らすため）
    trackMiss(now, frequency);

    if (judgement === "ok") {
      // OK のとき：OK になりはじめた時刻を覚える（すでに覚えていれば、そのまま）
      if (holdStartTime === null) {
        holdStartTime = now;
      }

      // 最後に OK だった時刻を更新する
      lastOkTime = now;

      // OK を保てている時間を、必要な時間で割って、0〜1 の割合にする
      holdProgress = Math.min(1, (now - holdStartTime) / HOLD_MILLISECONDS);

      // 必要な時間を保てたら、この音を通過して次へ進む
      if (holdProgress >= 1) {
        passTarget();
      }
    } else if (holdStartTime !== null && now - lastOkTime > GRACE_MILLISECONDS) {
      // OK から外れて、見逃す時間も過ぎたとき：最初から数え直す
      resetHold();
    }
  }

  /**
   * OK を保てている時間の記録を、最初に戻す関数
   */
  function resetHold() {
    holdStartTime = null;
    holdProgress = 0;
  }

  /**
   * 「外した」の記録を、最初に戻す関数（外したら正しい音を鳴らす）
   * 次の音へ進んだとき・目標を動かしたとき・お手本の音を鳴らしたときなど、数え直したいときに呼ぶ。
   */
  function resetMiss() {
    missed = false;
    offPitchStart = null;
    silenceStart = null;
  }

  /**
   * 音程を外したかどうかを数えて、弾き終わったときに正しい音を鳴らす関数（外したら正しい音を鳴らす）
   * 音の高さが分かるたびに、handlePitch の中から呼ばれる。
   *   ・「高い」「低い」が 0.2秒以上続いたら「外した」と覚える
   *   ・そのあと、音が 0.3秒以上出なくなったら（弾き終わったら）、設定がオンなら目標の音を鳴らす
   * 前の音を伸ばしているだけの間（前の音の高さに近い間）は、外したことにしない。
   * @param {number} now - 今の時刻（ミリ秒）
   * @param {number|null} frequency - 検出した周波数（Hz）。音が出ていないときは null
   */
  function trackMiss(now, frequency) {
    // ----- 音が出ているとき -----
    if (frequency !== null) {
      // 音が出ているので、「音が出なくなった」時間は数え直す
      silenceStart = null;

      // 前の音を伸ばしているだけかどうか（前の音の高さとのずれが小さい）
      const isHoldingPrevious = previousNoteFrequency !== null && Math.abs(1200 * Math.log2(frequency / previousNoteFrequency)) < PREVIOUS_NOTE_CENTS;

      if (judgement === "ok" || isHoldingPrevious) {
        // OK のとき、または前の音を伸ばしているだけのとき：外していないので、続いた時間は数え直す
        offPitchStart = null;
        return;
      }

      // 「高い」「低い」のとき：続きはじめた時刻を覚え、十分に続いたら「外した」と覚える
      if (offPitchStart === null) {
        offPitchStart = now;
      }
      if (now - offPitchStart >= MISS_OFF_PITCH_MILLISECONDS) {
        missed = true;
      }
      return;
    }

    // ----- 音が出ていないとき -----
    // 外していないなら、何もしない
    offPitchStart = null;
    if (!missed) {
      return;
    }

    // 音が出なくなりはじめた時刻を覚え、十分に出なかったら（弾き終わったら）鳴らす
    if (silenceStart === null) {
      silenceStart = now;
    }
    if (now - silenceStart >= MISS_SOUND_END_MILLISECONDS) {
      // 設定がオンのときだけ、目標の音を鳴らす（鳴らす間は判定が止まり、記録も消える）
      if (missToneEnabled) {
        playTarget();
      }
      resetMiss();
    }
  }

  // ===== 通過の合図の音 =====

  // 合図の音の高さの上限（Hz）。これより高いと耳に痛いので、超えないようにする
  const CHIME_MAX_FREQUENCY = 3000;

  // 音を通過したときに、合図の音を鳴らすかどうか（true：鳴らす、false：鳴らさない）
  // 最初は「鳴らす」にしておき、画面に表示された後で、保存された設定に入れ替える
  let chimeEnabled = $state(true);

  // この部品が画面に表示された直後に、保存された合図の音の設定をブラウザから読み込む
  // （ブラウザの保存領域は、画面に表示された後でないと使えないため、ここで読み込む）
  onMount(() => {
    chimeEnabled = loadChimeEnabled();
    missToneEnabled = loadMissToneEnabled(); // 外したら正しい音を鳴らす
  });

  /**
   * 合図の音を鳴らすかどうかを切り替える関数
   * 「設定」の中のチェックボックスを切り替えたときに呼ばれる。
   * 設定を切り替えて、次に開いたときのためにブラウザに保存する。
   * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
   */
  function changeChimeEnabled(enabled) {
    // 設定を切り替える
    chimeEnabled = enabled;

    // ブラウザに保存する
    saveChimeEnabled(enabled);
  }

  // 音程を外して弾き終わったときに、正しい音（目標の音）を鳴らすかどうか（true：鳴らす、false：鳴らさない）（外したら正しい音を鳴らす）
  // 最初は「鳴らす」にしておき、画面に表示された後で、保存された設定に入れ替える
  let missToneEnabled = $state(true);

  /**
   * 「外したら正しい音を鳴らす」かどうかを切り替える関数（外したら正しい音を鳴らす）
   * 「設定」の中のチェックボックスを切り替えたときに呼ばれる。設定を切り替えて、ブラウザに保存する。
   * @param {boolean} enabled - 鳴らすなら true、鳴らさないなら false
   */
  function changeMissToneEnabled(enabled) {
    missToneEnabled = enabled;
    saveMissToneEnabled(enabled);
    // 切り替えたときに、それまでの「外した」の記録は消す
    resetMiss();
  }

  /**
   * 合図の音の高さを決める関数
   * 通過した音の2オクターブ上（周波数が4倍）の音にする。
   * 弾いた音と同じ音名なので、響きが合って耳ざわりになりにくい。
   * @param {number} frequency - 通過した音の周波数（Hz）
   * @returns {number} 合図の音の周波数（Hz）
   */
  function getChimeFrequency(frequency) {
    // 2オクターブ上（1オクターブ上がるごとに周波数が2倍になるので、4倍）
    let chimeFrequency = frequency * 4;

    // 高くなりすぎたときは、上限を超えなくなるまで、1オクターブずつ下げる
    while (chimeFrequency > CHIME_MAX_FREQUENCY) {
      chimeFrequency = chimeFrequency / 2;
    }

    return chimeFrequency;
  }

  // ===== くり返し =====

  // 終わりの合図（2音）を鳴らしたあと、くり返しで最初の音に戻ったときに、判定を待つ時間（ミリ秒）
  // 終わりの合図は、通過の合図より長いので、そのぶん長く待つ
  const WAIT_AFTER_FINISH_CHIME_MILLISECONDS = 800;

  // くり返しで、最後まで弾けた回数（1回最後まで弾くたびに1増える）
  let completedRounds = $state(0);

  /**
   * 今の目標の音を通過して、次の音へ進む関数
   * OK を必要な時間だけ保てたときに呼ばれる。
   */
  function passTarget() {
    // 今の音に、通過した印を付ける（五線譜の音符が緑になる）
    passed[targetIndex] = true;

    // 数えていた時間を最初に戻す
    resetHold();

    // 外したかどうかの記録も消す。通過した音の高さは覚えておく（次の音で、前の音を伸ばしているだけなら外したことにしないため）
    resetMiss();
    previousNoteFrequency = targetFrequency;

    // 合図の音の高さ（通過した音の2オクターブ上）
    const chimeFrequency = getChimeFrequency(targetFrequency);

    // 最後の音だったとき
    if (targetIndex === notes.length - 1) {
      // 終わりの合図：通過した音の高さと、その5度上（周波数が1.5倍）の音を続けて鳴らす
      if (chimeEnabled) {
        playChime([chimeFrequency, chimeFrequency * 1.5]);
      }

      // くり返さないときは、ここで終わる
      if (!repeatEnabled) {
        isFinished = true;
        return;
      }

      // ===== ここから下は、くり返すとき：最初の音に戻る =====

      // 最後まで弾けた回数を1増やす
      completedRounds = completedRounds + 1;

      // 最後の音の周波数を覚えておく（最初の音と同じ高さかどうかを調べるため）
      const lastFrequency = targetFrequency;

      // 通過した印を全部消して、最初の音を目標にする
      passed = [];
      targetIndex = 0;

      // 合図の音でマイクの検出が乱れるので、少しの間、判定を待つ
      const waitAfterFinish = chimeEnabled ? WAIT_AFTER_FINISH_CHIME_MILLISECONDS : WAIT_AFTER_ADVANCE_MILLISECONDS;
      waitUntil = performance.now() + waitAfterFinish;

      // 最初の音が最後の音とほぼ同じ高さのときは、いったん音が途切れるまで判定を待つ
      // （最後の音を弾き続けているだけで、最初の音も通過してしまうのを防ぐため）
      const centsFromLast = 1200 * Math.log2(targetFrequency / lastFrequency);
      needRelease = Math.abs(centsFromLast) < SAME_PITCH_CENTS;

      return;
    }

    // 通過の合図：短い音を1つ鳴らす
    if (chimeEnabled) {
      playChime([chimeFrequency]);
    }

    // 通過した音の周波数を覚えておく（次の音と同じ高さかどうかを調べるため）
    const previousFrequency = targetFrequency;

    // 次の音を目標にする（これで、目標の音の周波数も自動で計算し直される）
    targetIndex = targetIndex + 1;

    // 前の音の響きを拾わないように、少しの間、判定を待つ
    // 合図の音を鳴らしたときは、その音でマイクの検出が乱れるので、長めに待つ
    const waitMilliseconds = chimeEnabled ? WAIT_AFTER_CHIME_MILLISECONDS : WAIT_AFTER_ADVANCE_MILLISECONDS;
    waitUntil = performance.now() + waitMilliseconds;

    // 次の音が前の音とほぼ同じ高さのときは、いったん音が途切れるまで判定を待つ
    // （前の音を弾き続けているだけで、次の音も通過してしまうのを防ぐため）
    const centsBetween = 1200 * Math.log2(targetFrequency / previousFrequency);
    needRelease = Math.abs(centsBetween) < SAME_PITCH_CENTS;
  }

  /**
   * 最初の音からやり直す関数
   * 「最初からもう一度」ボタンを押したときに呼ばれる。
   */
  function restart() {
    // どの音も通過していない状態に戻す
    passed = [];
    isFinished = false;

    // くり返しで弾けた回数も、最初に戻す
    completedRounds = 0;

    // 最初の音を目標にする
    targetIndex = 0;
    needRelease = false;
    resetHold();
    resetMiss();
    previousNoteFrequency = null;
  }

  /**
   * マイクで音を聴くのをやめる関数
   * 「やめる」ボタンを押したときに呼ばれる。
   */
  function stopListening() {
    stopMicrophone();

    // 止まっている状態に戻し、検出した音も消す
    isListening = false;
    staffHeight = STEP_STAFF_HEIGHT; // 五線譜の枠の高さも、測る前の決め打ちに戻す（高さを測って合わせる手直し）
    detectedFrequency = null;

    // 数えていた時間も最初に戻す
    resetHold();
    resetMiss();
  }

  /**
   * 目標の音を、指定した位置に動かす関数
   * 五線譜の音符をタップしたときと、「前の音」「次の音」ボタンを押したときに使う。
   * @param {number} index - 新しく目標にする音が何番目か（0から始まる）
   */
  function setTarget(index) {
    // 楽譜の範囲の外（最初より前、最後より後）には動かさない
    if (index < 0 || index >= notes.length) {
      return;
    }

    targetIndex = index;

    // 目標を手動で動かしたので、数えていた時間を最初に戻す
    resetHold();
    resetMiss();
    previousNoteFrequency = null;
    needRelease = false;

    // 最後まで弾けたあとに動かした場合は、また通過の判定をするようにする
    isFinished = false;
  }

  /**
   * 目標の音を鳴らす関数
   * 「目標の音を聴く」ボタンを押したときに呼ばれる。
   * お手本として、選択中の音律での高さの音を鳴らす。
   * マイクで聴いているときは、お手本の音を拾わないように、鳴っている間だけ判定を止める。
   */
  function playTarget() {
    playTone(targetFrequency, LISTEN_SECONDS);

    // お手本の音が鳴っている間は、判定を止めておく
    muteUntil = performance.now() + MUTE_MILLISECONDS;
    detectedFrequency = null;
    resetMiss(); // 外したかどうかの記録も消す（外したら正しい音を鳴らす）
  }

  // ===== 1画面に収める（1画面に収める手直し） =====

  // 練習の部品のいちばん上（五線譜のすぐ上）に置く目じるしの要素。練習を始めたときに、ここを画面の上に合わせる
  let practiceTop = $state(null);

  // 今までの五線譜（Staff）を入れる枠の要素。高さに上限を付けて、はみ出した分は枠の中で縦にスクロールする
  // （読み込んだ楽譜の五線譜は、自分でスクロールするので使わない）
  let staffBox = $state(null);

  // ----- 高さを測って合わせる（高さを測って合わせる手直し） -----
  // 380px と決め打ちしていたため、文字の大きさなどで、下に並ぶもの（目標の音〜「前」「次」のボタン）が高くなる端末
  // （Pixel 8 など）では、ボタンが画面の外に出てしまった。そこで、練習を始めたら実際の高さを測って、五線譜の枠の高さを決める

  // 五線譜の枠の高さの上限（CSS の書き方）。練習を始める前は、決め打ちの STEP_STAFF_HEIGHT
  let staffHeight = $state(STEP_STAFF_HEIGHT);

  // 「前」「目標の音を聴く」「次」の行の要素（いちばん下に収めたいもの）
  let moveRow = $state(null);

  // 五線譜の枠と、ボタンの行の下の端との間に、少しだけあけるすき間（ピクセル）
  const FIT_BOTTOM_GAP = 12;

  // 五線譜の枠を、これより低くはしない（ピクセル。1段（約120px）は見えるように。STEP_STAFF_HEIGHT の下限と同じ）
  const FIT_MIN_HEIGHT = 150;

  /**
   * 五線譜の枠の高さを、今の画面に合わせて決め直す関数（高さを測って合わせる手直し）
   * 画面の高さ − 目じるしの上にあける分（scroll-margin-top）− （目じるしから五線譜の枠の上端まで）
   *   − 五線譜の枠の内側の余白と枠の線（高さの上限の外に足されるため）− （五線譜の枠の下端からボタンの行の下端まで）− すき間
   * を、五線譜の枠の高さの上限にする。これで、目じるしを画面の上に合わせたとき、ボタンの行まで1画面に収まる。
   * 五線譜の枠は、目じるし（practiceTop）のすぐ次の要素（今までの五線譜の枠でも、読み込んだ楽譜の五線譜でも同じ）。
   */
  function fitStaffHeight() {
    if (practiceTop === null || moveRow === null) return;
    const staffElement = practiceTop.nextElementSibling;
    if (staffElement === null) return;
    // 見えている画面の高さ（スマホでは、アドレスバーなどを除いた高さ）
    const viewHeight = window.visualViewport?.height ?? window.innerHeight;
    const topRect = practiceTop.getBoundingClientRect();
    const staffRect = staffElement.getBoundingClientRect();
    const rowRect = moveRow.getBoundingClientRect();
    // 目じるしを画面の上に合わせるとき、上にあける分（CSS の scroll-margin-top。8px）
    const scrollMargin = parseFloat(getComputedStyle(practiceTop).scrollMarginTop) || 0;
    const above = staffRect.top - topRect.top; // 目じるしから五線譜の枠の上端まで
    // 五線譜の枠の内側の余白と枠の線（max-height は中身の高さに効くので、その外に足される分）
    const style = getComputedStyle(staffElement);
    const extra =
      style.boxSizing === "border-box"
        ? 0
        : (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    const below = rowRect.bottom - staffRect.bottom; // 五線譜の枠の下端から、ボタンの行の下端まで（目標の音・メーター・判定・やめる）
    const height = Math.floor(viewHeight - scrollMargin - above - extra - below - FIT_BOTTOM_GAP);
    staffHeight = `${Math.max(height, FIT_MIN_HEIGHT)}px`;
  }

  // 練習している間は、目標の音が変わったとき（「開放弦でもOK」の行が増えるなど、下の高さが変わることがある）や、
  // 最後まで弾けたとき・エラーが出たときにも、測り直す（高さを測って合わせる手直し）
  $effect(() => {
    targetIndex; // これらが変わったら動くように、読んでおく
    isFinished;
    errorMessage;
    if (!isListening) return;
    tick().then(fitStaffHeight);
  });

  // 画面の大きさが変わったとき（向きを変えた・アドレスバーが出たり消えたりした）も、練習している間は測り直す
  onMount(() => {
    const handleResize = () => {
      if (isListening) fitStaffHeight();
    };
    window.addEventListener("resize", handleResize);
    window.visualViewport?.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  });

  /**
   * 練習の部品のいちばん上が、画面のいちばん上に来るようにページをスクロールする関数
   * 「練習を始める」を押してマイクが使えるようになったときに呼ぶ。
   * これで、五線譜から「目標の音を聴く」ボタンまでが、1つの画面に収まって見える。
   */
  function scrollPracticeToTop() {
    if (practiceTop === null) {
      return;
    }
    // block: "start" … 要素の上端を、画面の上端に合わせる
    practiceTop.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 「練習を始める」を押すたびに1増える数。読み込んだ楽譜の五線譜に渡して、目標の音の段までスクロールしてもらう
  let scrollRequest = $state(0);

  // 今までの五線譜の枠の中で、目標の音の段が見えるようにスクロールする係
  // targetIndex（目標の音）が変わるたびに動く
  $effect(() => {
    targetIndex; // 目標の音が変わったら動くように、読んでおく
    scrollStaffToTarget(false);
  });

  /**
   * 今までの五線譜の枠の中で、目標の音の段が見えるようにスクロールする関数
   * @param {boolean} force - true なら、段が見えていても、その段を枠のいちばん上に置く（「練習を始める」を押したとき）。
   *                          false なら、段が枠からはみ出しているときだけ動かす（目標の音が変わったとき）
   */
  function scrollStaffToTarget(force) {
    if (staffBox === null) {
      return;
    }
    const box = staffBox;
    // 画面の書き換え（目標の音の青い帯）が終わってから調べる
    tick().then(() => {
      // 目標の音（青い帯の付いた音符）の段（1段ぶんの SVG）を探す
      const row = box.querySelector(".note.selected")?.closest("svg");
      if (row === null || row === undefined) {
        return;
      }
      // 枠の中での、段の上端と下端の位置
      const boxRect = box.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const rowTop = rowRect.top - boxRect.top + box.scrollTop;
      const rowBottom = rowTop + rowRect.height;
      // 段が枠から上か下にはみ出していたら（force のときはいつも）、その段を枠のいちばん上に置く
      if (force || rowTop < box.scrollTop || rowBottom > box.scrollTop + box.clientHeight) {
        box.scrollTo({ top: rowTop, behavior: "smooth" });
      }
    });
  }
</script>

<!-- 五線譜（目標の音を、編集ページの「選択中」と同じ青で表示する） -->
<!-- passed を渡して、通過した音符を緑で表示する -->
<!-- 音符をタップすると、その音を目標にする -->
<!-- （ステップB：使う側から staff を渡されたときは、そちらで描く。読み込んだ楽譜の練習ページで使う） -->
<!-- 練習を始めたときに、ここ（五線譜のすぐ上）を画面のいちばん上に合わせる（1画面に収める手直し） -->
<div class="practice-top" bind:this={practiceTop}></div>

{#if staff !== null}
  {@render staff(targetIndex, passed, setTarget, scrollRequest, staffHeight)}
{:else}
  <!-- 今までの五線譜は、高さに上限を付けた枠に入れる。音が多くて段が増えたら、枠の中でスクロールする（1画面に収める手直し） -->
  <!-- （高さを測って合わせる手直し：高さの上限は、測って決めた staffHeight にした） -->
  <div class="staff-box" bind:this={staffBox} style:max-height={staffHeight}>
    <Staff {notes} signature={currentKey.signature} selectedIndex={targetIndex} {passed} onselect={setTarget} />
  </div>
{/if}

<!-- 目標の音の表示 -->
<div class="target-area">
  <p class="target-caption">
    目標の音（{targetIndex + 1} / {notes.length}）
    <!-- くり返すときは、今が何回目かも表示する（弾けた回数 ＋ 1 が、今の回） -->
    {#if repeatEnabled}
      ・くり返し {completedRounds + 1}回目
    {/if}
    <!-- 前打音が目標のときは、そのことを添える（「じっくり」の前打音） -->
    {#if isGraceTarget}
      ・前打音
    {/if}
  </p>

  <!-- 音名を大きく表示する -->
  <p class="target-name">{noteToText(targetNote)}</p>

  <!-- 選択中の音律での周波数と、平均律からのズレ -->
  <p class="target-frequency">
    {targetFrequency.toFixed(1)} Hz（平均律より
    {formatCents(getCentsFromEqual(targetNote, currentKey, temperamentId))} セント）
  </p>

  <!-- 開放弦の高さでも OK になる音のときは、そのことと、開放弦の周波数を表示する -->
  {#if openFrequency !== null}
    <p class="target-frequency">開放弦の高さ（{openFrequency.toFixed(1)} Hz）で弾いてもOK</p>
  {/if}
</div>

<!-- 判定の表示（マイクで聴いているときだけ表示する） -->
{#if isListening}
  <!-- メーター（ズレ、OK の範囲、表示する範囲を渡して、針で表示する） -->
  <div class="meter-area">
    <Meter {cents} {tolerance} range={METER_RANGE} />
  </div>

  <!-- ゲージ：OK を保てている時間を、横に伸びる棒で表示する。いっぱいになると次の音へ進む -->
  <!-- aria-hidden は、読み上げで操作する人に、この図を読み上げないようにする設定 -->
  <div class="hold-track" aria-hidden="true">
    <!-- holdProgress（0〜1）を100倍して、棒の幅（％）にする -->
    <div class="hold-bar" style="width: {holdProgress * 100}%"></div>
  </div>

  <!-- 判定の結果によって、文字の色を変える（OK は緑、低いは青、高いは赤） -->
  <div class="judgement-area {judgement}">
    {#if judgement === "none"}
      <!-- 音が出ていないとき -->
      <p class="judgement-text">音を出してください</p>
      <p class="judgement-detail">　</p>
    {:else}
      <!-- 判定の結果を大きく表示する -->
      <p class="judgement-text">
        {#if judgement === "ok"}
          OK
        {:else if judgement === "low"}
          {isFar ? "もっと低い" : "低い"}
        {:else}
          {isFar ? "もっと高い" : "高い"}
        {/if}
      </p>

      <!-- ズレの数値。大きく外れているときは、今出ている音の音名を案内する -->
      <p class="judgement-detail">
        {#if isFar}
          今の音は {detectedNote.name}{detectedNote.octave} 付近です
        {:else}
          {formatCents(cents)} セント
        {/if}
      </p>
    {/if}
  </div>
{/if}

<!-- 最後の音まで通過したときの表示 -->
{#if isFinished}
  <div class="finished-area">
    <p class="finished-text">最後まで弾けました</p>
    <button class="restart-button" onclick={restart}>最初からもう一度</button>
  </div>
{/if}

<!-- エラーがあるときだけメッセージを表示する -->
{#if errorMessage !== ""}
  <p class="error">{errorMessage}</p>
{/if}

<!-- マイクで聴いているときは「やめる」ボタン、止まっているときは「練習を始める」ボタンを表示する -->
{#if isListening}
  <button class="listening-button stop" onclick={stopListening}>やめる</button>
{:else}
  <button class="listening-button start" onclick={startListening}>練習を始める（マイクを使います）</button>
{/if}

<!-- 目標の音を手動で動かすボタンと、目標の音をお手本として鳴らすボタンを、1行に並べる（1画面に収める手直し） -->
<!-- （高さを測って合わせる手直し：この行の下の端までを1画面に収めるので、要素を覚えておく） -->
<div class="move-row" bind:this={moveRow}>
  <!-- 最初の音が目標のときは、これより前に動かせないので押せない -->
  <!-- aria-label は、読み上げで操作する人のための、ボタンの説明（ボタンの文字を短くしたので付ける） -->
  <button class="move-button" disabled={targetIndex === 0} onclick={() => setTarget(targetIndex - 1)} aria-label="前の音"> ◀ 前 </button>

  <!-- 目標の音をお手本として鳴らすボタン（まん中に、いちばん広く置く） -->
  <button class="listen-button" onclick={playTarget}>♪ 目標の音を聴く</button>

  <!-- 最後の音が目標のときは、これより後に動かせないので押せない -->
  <button class="move-button" disabled={targetIndex === notes.length - 1} onclick={() => setTarget(targetIndex + 1)} aria-label="次の音"> 次 ▶ </button>
</div>

<!-- あまり使わない設定：ふだんはたたんでおき、「設定」を押したときだけ開く -->
<details class="settings">
  <summary>設定</summary>

  <!-- 音を通過したときに、合図の音を鳴らすかどうかの切り替え -->
  <!-- label で囲むと、文字の部分を押してもチェックを切り替えられる -->
  <label class="chime-toggle">
    <!-- checked で今の設定を表示し、切り替えられたら changeChimeEnabled を呼ぶ -->
    <input type="checkbox" checked={chimeEnabled} onchange={(event) => changeChimeEnabled(event.currentTarget.checked)} />
    音を通過したときに合図の音を鳴らす
  </label>

  <!-- 音程を外して弾き終わったときに、正しい音（目標の音）を鳴らすかどうかの切り替え（外したら正しい音を鳴らす） -->
  <label class="chime-toggle">
    <input type="checkbox" checked={missToneEnabled} onchange={(event) => changeMissToneEnabled(event.currentTarget.checked)} />
    音程を外して弾き終わったら、正しい音を鳴らす
  </label>
</details>

<style>
  /* 練習を始めたときに画面の上に合わせる目じるし（高さはない）（1画面に収める手直し） */
  /* scroll-margin-top で、画面のいちばん上から少しだけ間をあける */
  .practice-top {
    scroll-margin-top: 8px;
  }

  /* 今までの五線譜を入れる枠：高さの上限（style:max-height）を超えたら、枠の中で縦にスクロールする（1画面に収める手直し） */
  /* position: relative は、中の段の位置を、この枠から測るため */
  .staff-box {
    position: relative;
    overflow-y: auto;
  }

  /* 目標の音のエリア：中央に寄せる */
  .target-area {
    margin-top: 4px;
    text-align: center;
  }

  /* 「目標の音（3 / 8）」の小さな見出し */
  .target-caption {
    margin: 0;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 目標の音名：一番大きく表示する */
  .target-name {
    margin: 0;
    /* 1画面に収めるため、3rem から少し小さくした（1画面に収める手直し） */
    font-size: 2.4rem;
    line-height: 1.15;
    font-weight: bold;
    /* 五線譜の目標の音と同じ、濃い青にする */
    color: #0d47a1;
  }

  /* 目標の音の周波数 */
  .target-frequency {
    margin: 0;
    font-size: 0.9rem;
    color: #424242;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* メーターのエリア：目標の音の表示から少し離す */
  .meter-area {
    margin-top: 6px;
  }

  /* ゲージの枠（グレー）：OK を保てている時間を表示する棒の、背景になる部分 */
  .hold-track {
    height: 8px;
    margin-top: 4px;
    background-color: #e0e0e0;
    border-radius: 4px;
    /* 中の棒が、角の丸みからはみ出さないようにする */
    overflow: hidden;
  }

  /* ゲージの棒（緑）：OK を保てている間、左から右へ伸びる */
  .hold-bar {
    height: 100%;
    background-color: #2e7d32;
  }

  /* 最後まで弾けたときの表示のエリア：中央に寄せる */
  .finished-area {
    margin-top: 12px;
    text-align: center;
  }

  /* 「最後まで弾けました」の文字：緑で大きく表示する */
  .finished-text {
    margin: 0;
    font-size: 1.4rem;
    font-weight: bold;
    color: #2e7d32;
  }

  /* 「最初からもう一度」ボタン：白地に緑の枠 */
  button.restart-button {
    width: 100%;
    margin-top: 8px;
    color: #2e7d32;
    background-color: white;
    border: 2px solid #2e7d32;
  }

  /* 判定の表示のエリア：中央に寄せる */
  .judgement-area {
    margin-top: 4px;
    text-align: center;
    /* 文字の色は、判定の結果ごとに下で決める。ここは、音が出ていないときのグレー */
    color: #757575;
  }

  /* 判定が OK のとき：緑 */
  .judgement-area.ok {
    color: #2e7d32;
  }

  /* 判定が「低い」のとき：青 */
  .judgement-area.low {
    color: #1565c0;
  }

  /* 判定が「高い」のとき：赤 */
  .judgement-area.high {
    color: #c62828;
  }

  /* 判定の結果（OK・低い・高い）：大きく表示する */
  .judgement-text {
    margin: 0;
    /* 1画面に収めるため、1.8rem から少し小さくした（1画面に収める手直し） */
    font-size: 1.5rem;
    font-weight: bold;
  }

  /* ズレの数値や、今出ている音の案内 */
  .judgement-detail {
    margin: 0;
    font-size: 1rem;
    /* 数字の幅をそろえて、値が変わっても表示が左右に揺れないようにする */
    font-variant-numeric: tabular-nums;
  }

  /* エラーメッセージ */
  .error {
    margin: 12px 0 0 0;
    color: #c62828;
  }

  /* 「練習を始める」「やめる」ボタン：横幅いっぱいに表示する */
  button.listening-button {
    width: 100%;
    margin-top: 8px;
    color: white;
    border: none;
  }

  /* 「練習を始める」ボタン（青） */
  button.listening-button.start {
    background-color: #1976d2;
  }

  /* 「やめる」ボタン（赤） */
  button.listening-button.stop {
    background-color: #c62828;
  }

  /* 「前の音」「次の音」ボタンを横に並べる */
  .move-row {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  /* ボタン共通：指で押しやすい大きさにする */
  button {
    padding: 12px 0;
    font-size: 1rem;
    border-radius: 8px;
    cursor: pointer;
  }

  /* 押せない状態のボタン：薄く表示する */
  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* 「前」「次」ボタン：白地に青い枠。まん中の「目標の音を聴く」より狭くする（1画面に収める手直し） */
  button.move-button {
    flex: 1;
    /* 文字が「前」「次」だけになったので、狭い画面でも縮みすぎないよう、最低の幅を決める */
    min-width: 64px;
    color: #1976d2;
    background-color: white;
    border: 2px solid #1976d2;
  }

  /* 「目標の音を聴く」ボタン：緑。「前」「次」の間に、いちばん広く置く（1画面に収める手直し） */
  /* flex: 2 … 「前」「次」の2倍の幅を使う */
  button.listen-button {
    flex: 2;
    color: white;
    background-color: #2e7d32;
    border: none;
  }

  /* あまり使わない設定（ふだんはたたんである） */
  .settings {
    margin-top: 16px;
    font-size: 0.85rem;
    color: #616161;
  }

  /* 「設定」の文字（押すと開く部分） */
  .settings summary {
    cursor: pointer;
  }

  /* 合図の音を鳴らすかどうかのチェックボックス */
  .chime-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    cursor: pointer;
  }
</style>
