import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config.ts";

type Post = { title: string; date: string; description: string; body: { html: string } };

const generated = join(".contentlayer", "generated", "Post");
const dist = "dist";
/** The prefix the site is served under, which is the repository's own name. */
const base = `/${config.repo.split("/")[1] ?? config.repo}`;

const escapeHtml = (value: string): string =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const template = readFileSync(join("site", "template.html"), "utf8");
const page = (post: { title: string; description: string; subtitle: string; body: string }): string =>
	template
		.replaceAll("{{title}}", escapeHtml(post.title))
		.replaceAll("{{description}}", escapeHtml(post.description))
		.replaceAll("{{subtitle}}", escapeHtml(post.subtitle))
		.replaceAll("{{base}}", base)
		.replaceAll("{{body}}", post.body);

const posts: Post[] = readdirSync(generated)
	.filter((file) => file.endsWith(".json") && file !== "_index.json")
	.map((file) => JSON.parse(readFileSync(join(generated, file), "utf8")) as Post & { type: string })
	.filter((post) => post.type === "Post")
	.sort((left, right) => right.date.localeCompare(left.date));

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(join("site", "style.css"), join(dist, "style.css"));

for (const post of posts) {
	const directory = join(dist, post.date);
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, "index.html"), page({ title: post.title, description: post.description, subtitle: post.date, body: post.body.html }));
}

const archive = `<ul class="archive">\n${posts
	.map((post) => `\t<li><a href="${base}/${post.date}/">${post.date}</a> — ${escapeHtml(post.title)}</li>`)
	.join("\n")}\n</ul>`;
writeFileSync(join(dist, "index.html"), page({ title: "slopchop", description: "A daily technology digest.", subtitle: "", body: archive }));

console.log(`built ${posts.length} post(s) into ${dist}/`);
