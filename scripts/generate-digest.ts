import path from "node:path";
import process from "node:process";
import {
  buildSimpleDigestMarkdown,
  ensureDigestSlot,
  fetchRecentSourceItems,
  flattenRecentItems,
  parseBaseCliOptions,
  repoRoot,
  writeDigestFile
} from "./digest-core.ts";

async function main() {
  const options = parseBaseCliOptions(process.argv.slice(2));
  const existingFile = await ensureDigestSlot(options.issueDate, options.force, options.skipIfExists);

  if (existingFile) {
    console.log(`Skipping digest generation because a file already exists: ${path.relative(repoRoot, existingFile)}`);
    return;
  }

  console.log(
    `Generating simple digest for ${options.issueDate.toISOString().slice(0, 10)} ` +
      `with a ${options.lookbackDays}-day lookback window.`
  );

  const results = await fetchRecentSourceItems(options);
  for (const result of results) {
    if (result.error) {
      console.warn(`- ${result.source.name}: skipped (${result.error})`);
      continue;
    }

    console.log(`- ${result.source.name}: ${result.items.length} recent item(s)`);
  }

  const items = flattenRecentItems(results);

  if (items.length === 0) {
    throw new Error("No recent feed items were found. Try increasing --lookback-days or review the source feeds.");
  }

  const markdown = buildSimpleDigestMarkdown(items, options.issueDate, options.lookbackDays);
  const outputPath = await writeDigestFile(options.issueDate, markdown);

  console.log(`Created ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Digest generation failed: ${message}`);
  process.exitCode = 1;
});
