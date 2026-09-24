process.env.GITHUB_PAGES = "1";
process.env.GITHUB_PAGES_BASE_PATH ||= "/tce-go-dashboard";

const { build } = await import("vite");
await build();
await import("./prepare-github-pages.mjs");
