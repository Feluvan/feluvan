import { readFileSync, writeFileSync } from "fs";

const user = process.env.GH_USER;
const token = process.env.GH_TOKEN;
const topN = 3;
const excludeForks = true;

const headers = {
  Authorization: `Bearer ${token}`,
  "User-Agent": user,
  Accept: "application/vnd.github+json",
};

async function gh(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// 1. Count pushes per repo from recent public events
const pushCounts = {};
for (let page = 1; page <= 3; page++) {
  const events = await gh(
    `https://api.github.com/users/${user}/events/public?per_page=100&page=${page}`
  );
  if (!events.length) break;
  for (const e of events) {
    if (e.type === "PushEvent") {
      const name = e.repo.name.split("/")[1];
      pushCounts[name] = (pushCounts[name] || 0) + 1;
    }
  }
}

// 2. Fetch repo metadata to exclude forks and the profile repo itself
const repos = [];
for (let page = 1; page <= 3; page++) {
  const batch = await gh(
    `https://api.github.com/users/${user}/repos?per_page=100&page=${page}&type=owner`
  );
  if (!batch.length) break;
  repos.push(...batch);
  if (batch.length < 100) break;
}
const meta = Object.fromEntries(repos.map((r) => [r.name, r]));

const eligible = Object.entries(pushCounts)
  .filter(([name]) => {
    const r = meta[name];
    if (!r) return false;
    if (name.toLowerCase() === user.toLowerCase()) return false;
    if (excludeForks && r.fork) return false;
    return true;
  })
  .sort((a, b) => b[1] - a[1])
  .slice(0, topN)
  .map(([name]) => name);

if (eligible.length === 0) {
  console.log("No eligible repos found from recent push events, skipping.");
  process.exit(0);
}

console.log("Top pushed repos:", eligible);

const statsHost = "https://github-readme-stats-beta-blond-65.vercel.app";
const cardParams =
  "theme=dark&title_color=22D3EE&text_color=94A3B8&bg_color=0A101F&icon_color=A78BFA&border_color=22D3EE";

const cardsHtml = eligible
  .map(
    (name) =>
      `<a href="https://github.com/${user}/${name}"><img width="410" src="${statsHost}/api/pin/?username=${user}&repo=${name}&${cardParams}" /></a>`
  )
  .join("\n");

const block = `<div align="center">\n${cardsHtml}\n</div>`;

const startMarker = "<!-- PROJECTS:START -->";
const endMarker = "<!-- PROJECTS:END -->";

let readme = readFileSync("README.md", "utf8");
const startIdx = readme.indexOf(startMarker);
const endIdx = readme.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  throw new Error("PROJECTS markers not found in README.md");
}

const before = readme.slice(0, startIdx + startMarker.length);
const after = readme.slice(endIdx);

readme = `${before}\n${block}\n${after}`;
writeFileSync("README.md", readme);

console.log("README.md updated.");
