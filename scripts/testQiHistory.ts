import type { QiHistoryRange } from "../src/services/qiHistoryServer";
import { fetchQiPriceHistoryFromRpc } from "../src/services/qiHistoryServer";

async function main() {
  const ranges: QiHistoryRange[] = ["1h", "24h", "7d"];
  for (const range of ranges) {
    console.log(`Fetching history for range: ${range}`);
    const points = await fetchQiPriceHistoryFromRpc(range);
    console.log(` -> received ${points.length} points`);
    if (points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      console.log(
        ` -> first timestamp: ${new Date(first.timestamp).toISOString()}, price: ${first.price}`
      );
      console.log(
        ` -> last timestamp: ${new Date(last.timestamp).toISOString()}, price: ${last.price}`
      );
    }
  }
}

main().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
