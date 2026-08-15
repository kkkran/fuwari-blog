import { SKIP, visit } from "unist-util-visit";

/**
 * 正文图片懒加载 + 骨架占位容器。
 *
 * 对 markdown 渲染出的每个 <img>：
 * 1. 加 loading="lazy" 与 decoding="async"，避免首屏带宽被长文图片抢占；
 * 2. 外包一层 <span class="img-skeleton">，由全局 CSS 提供 shimmer 占位背景
 *    （伪元素实现，不增加额外 DOM），图片加载完成后自然盖住占位层。
 *
 * 链接包裹的图片（<a><img></a>）保持链接结构不变，仅在 img 外层插入 wrapper。
 * 通过 SKIP 阻止遍历进入新插入的 wrapper，保证同一张图不会被重复包装。
 */
export default function rehypeImagePlaceholder() {
	return (tree) => {
		visit(tree, "element", (node, index, parent) => {
			if (node.tagName !== "img") return;
			if (index === undefined || !parent) return;
			if (!node.properties || typeof node.properties.src !== "string") return;

			node.properties.loading = "lazy";
			node.properties.decoding = "async";

			const wrapper = {
				type: "element",
				tagName: "span",
				properties: { class: ["img-skeleton"] },
				children: [node],
			};
			parent.children[index] = wrapper;
			return SKIP;
		});
	};
}
