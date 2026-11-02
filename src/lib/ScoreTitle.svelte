<script>
  // 楽譜の名前と、「通し」の最高点を表示する部品
  // 練習ページの上のほうに置いて使う。

  // この部品を使う側（練習ページ）から受け取る値
  // name        ：楽譜の名前
  // bestScore   ：この楽譜の最高点。まだ無いときは null
  // isNewRecord ：最高点を更新した直後かどうか（true：更新した直後）
  // recordNote  ：最高点を記録できない理由。記録できるときは空の文字
  let { name, bestScore, isNewRecord, recordNote } = $props();
</script>

<!-- 楽譜の名前と最高点を横に並べる -->
<p class="score-title">
  <span class="score-name">{name}</span>

  <!-- 最高点（まだ無いときは「−」） -->
  <span class="best-score">最高点 {bestScore === null ? "−" : bestScore + "点"}</span>

  <!-- 最高点を更新した直後は、そのことを知らせる -->
  {#if isNewRecord}
    <span class="new-record">更新しました！</span>
  {/if}
</p>

<!-- 最高点を記録できないときは、その理由を小さく表示する -->
{#if recordNote !== ""}
  <p class="record-note">※最高点は、{recordNote}</p>
{/if}

<style>
  /* 楽譜の名前と最高点を横に並べる */
  .score-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 4px 0 0 0;
    font-family: sans-serif;
  }

  /* 楽譜の名前：太字。長いときは「…」で省略する */
  .score-name {
    /* min-width: 0 を付けると、名前が長くても、最高点を押し出さずに縮む */
    min-width: 0;
    font-size: 1rem;
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 最高点：緑の字。途中で折り返さない */
  .best-score {
    flex-shrink: 0;
    font-size: 0.9rem;
    color: #2e7d32;
    /* 数字の幅をそろえる */
    font-variant-numeric: tabular-nums;
  }

  /* 「更新しました！」：オレンジの太字 */
  .new-record {
    flex-shrink: 0;
    font-size: 0.85rem;
    font-weight: bold;
    color: #ef6c00;
  }

  /* 最高点を記録できない理由：小さくグレーで表示する */
  .record-note {
    margin: 2px 0 0 0;
    font-size: 0.75rem;
    color: #757575;
  }
</style>
