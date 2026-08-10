/// <reference types="mdast" />
import { h } from "hastscript";

/**
 * Creates a URL Card component.
 *
 * @param {Object} properties - The properties of the component.
 * @param {string} properties.href - The URL to display.
 * @param {import('mdast').RootContent[]} children - The children elements of the component.
 * @returns {import('mdast').Parent} The created URL Card component.
 */
export function UrlCardComponent(properties, children, iconMetaBaseUrl = "https://icon.miscoke.top") {
	if (Array.isArray(children) && children.length !== 0)
		return h("div", { class: "hidden" }, [
			'Invalid directive. ("url" directive must be leaf type "::url{href="https://example.com"}")',
		]);

	if (!properties.href)
		return h(
			"div",
			{ class: "hidden" },
			'Invalid URL. ("href" attribute must be provided)',
		);

	const url = properties.href;
	const cardUuid = `UC${Math.random().toString(36).slice(-6)}`; // Collisions are not important

	const nImage = h(`div#${cardUuid}-image`, { class: "uc-image" });

	const nTitle = h("div", { class: "uc-titlebar" }, [
		h("div", { class: "uc-titlebar-left" }, [
			h(`div#${cardUuid}-favicon`, { class: "uc-favicon" }),
			h("div", { class: "uc-domain" }, new URL(url).hostname),
		]),
	]);

	const nDescription = h(
		`div#${cardUuid}-description`,
		{ class: "uc-description" },
		"Waiting for metadata...",
	);

	const nTitleText = h(
		`div#${cardUuid}-title`,
		{ class: "uc-title-text" },
		"Loading...",
	);

	const nScript = h(
		`script#${cardUuid}-script`,
		{ type: "text/javascript", defer: true },
		`
      fetch('${iconMetaBaseUrl}/?url=${url}').then(response => response.json()).then(meta => {
        if (meta && meta.url) {
            document.getElementById('${cardUuid}-title').innerText = meta.title || "${url}";
            document.getElementById('${cardUuid}-description').innerText = meta.description || "No description available";
            
            const faviconEl = document.getElementById('${cardUuid}-favicon');
            if (meta.favicon) {
                faviconEl.style.backgroundImage = 'url(' + meta.favicon + ')';
                faviconEl.style.backgroundColor = 'transparent';
            } else {
                 faviconEl.style.display = 'none';
            }

            const imageEl = document.getElementById('${cardUuid}-image');
            // The new API currently does not seem to return a large image preview (meta.image)
            // So we default to hiding it to match the new structure
            imageEl.style.display = 'none';
            document.getElementById('${cardUuid}-container').classList.add('no-image');

            document.getElementById('${cardUuid}-card').classList.remove("fetch-waiting");
            console.log("[URL-CARD] Loaded card for ${url} | ${cardUuid}.")
        } else {
            throw new Error('API returned invalid data');
        }
      }).catch(err => {
        const c = document.getElementById('${cardUuid}-card');
        c?.classList.add("fetch-error");
        document.getElementById('${cardUuid}-title').innerText = "Error loading preview";
        document.getElementById('${cardUuid}-description').innerText = "Failed to fetch metadata for ${url}";
        console.warn("[URL-CARD] (Error) Loading card for ${url} | ${cardUuid}.", err)
      })
    `,
	);

	return h(
		`a#${cardUuid}-card`,
		{
			class: "card-url fetch-waiting no-styling",
			href: url,
			target: "_blank",
			url,
		},
		[
			h(`div#${cardUuid}-container`, { class: "uc-container" }, [
				h("div", { class: "uc-content" }, [nTitle, nTitleText, nDescription]),
				nImage,
			]),
			nScript,
		],
	);
}
