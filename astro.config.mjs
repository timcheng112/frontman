import { defineConfig } from "astro/config";

const readEnv = (name) => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

const owner = readEnv("GITHUB_REPOSITORY_OWNER");
const repository = readEnv("GITHUB_REPOSITORY")?.split("/")[1];
const customSite = readEnv("SITE_URL");
const explicitBase = readEnv("BASE_PATH");
const isUserOrOrgRootSite = Boolean(owner && repository === `${owner}.github.io`);

const site = customSite ?? (owner ? `https://${owner}.github.io` : "http://localhost:4321");
const base =
  explicitBase ??
  (customSite
    ? undefined
    : owner && repository && !isUserOrOrgRootSite
      ? `/${repository}`
      : undefined);

export default defineConfig({
  site,
  ...(base ? { base } : {})
});
