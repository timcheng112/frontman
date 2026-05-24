import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const buildArtifacts = [".astro", "dist", path.join("node_modules", ".astro")];

async function main() {
  await Promise.all(
    buildArtifacts.map(async (artifactPath) => {
      await rm(path.join(repoRoot, artifactPath), {
        force: true,
        recursive: true
      });
    })
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Build cleanup failed: ${message}`);
  process.exitCode = 1;
});
