import { defineDocumentType, makeSource } from "contentlayer/source-files";

export const Post = defineDocumentType(() => ({
	name: "Post",
	filePathPattern: `*.md`,
	contentType: "markdown",
	fields: {
		title: { type: "string", required: true },
		date: { type: "date", required: true },
		description: { type: "string", required: true },
	},
	computedFields: {
		slug: { type: "string", resolve: (post) => post._raw.flattenedPath.split("/").pop() },
	},
}));

export default makeSource({ contentDirPath: "content", documentTypes: [Post] });
