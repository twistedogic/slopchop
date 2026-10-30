import { defineDocumentType, makeSource } from "contentlayer/source-files";

export const Post = defineDocumentType(() => ({
	name: "Post",
	filePathPattern: `**/*.md`,
	contentType: "markdown",
	fields: {
		title: { type: "string", required: true },
		date: { type: "string", required: true },
		description: { type: "string", required: true },
	},
}));

export default makeSource({ contentDirPath: "content", documentTypes: [Post] });
