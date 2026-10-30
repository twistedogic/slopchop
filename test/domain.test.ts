import assert from "node:assert/strict";
import { test } from "node:test";
import { dateKey, httpUrl, plainText } from "../src/domain.ts";

test("a javascript url is rejected", () => {
	assert.throws(() => httpUrl("javascript:alert(3)"), /scheme is not http/);
	assert.throws(() => httpUrl("data:text/html;base64,PHNjcmlwdD4="), /scheme is not http/);
});

test("a url with credentials is rejected", () => {
	assert.throws(() => httpUrl("https://user:secret@example.com/a"), /carries credentials/);
});

test("an http url is accepted", () => {
	assert.equal(httpUrl("https://example.com/a"), "https://example.com/a");
});

test("a non-date string is rejected", () => {
	assert.throws(() => dateKey("2026-13-01"), /not a date/);
	assert.throws(() => dateKey("2026-02-30"), /not a date/);
	assert.throws(() => dateKey("not a date"), /not a date/);
	assert.equal(dateKey("2028-02-29"), "2028-02-29");
	assert.throws(() => dateKey("2026-02-29"), /not a date/);
});

test("a title carrying markdown metacharacters is stripped", () => {
	assert.equal(plainText("[click](javascript:alert(3))"), "clickjavascript:alert3");
	assert.equal(plainText("Rust 1.99.1 \u0000 released"), "Rust 1.99.1 released");
});
