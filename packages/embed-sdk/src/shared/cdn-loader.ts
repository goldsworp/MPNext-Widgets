const scriptCache = new Map<string, Promise<void>>();

/**
 * Load a script from CDN. Deduplicates concurrent requests for the same URL.
 */
export function loadScript(url: string): Promise<void> {
  if (scriptCache.has(url)) return scriptCache.get(url)!;

  const promise = new Promise<void>((resolve, reject) => {
    // Check if already loaded in the document
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });

  scriptCache.set(url, promise);
  return promise;
}

const cssTextCache = new Map<string, Promise<string>>();

function fetchCSSText(url: string): Promise<string> {
  if (cssTextCache.has(url)) return cssTextCache.get(url)!;

  const promise = fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Failed to load CSS: ${url}`);
    return res.text();
  });
  promise.catch(() => cssTextCache.delete(url)); // don't cache a failed fetch

  cssTextCache.set(url, promise);
  return promise;
}

/**
 * Inject an external CSS file into a Shadow DOM root via a constructable
 * stylesheet (adoptedStyleSheets), matching how base-widget's injectStyles()
 * applies the component's own CSS — not a <link> element appended as a
 * shadow-root child. A component's render() typically reassigns
 * `shadowRoot.innerHTML` on every state change, which discards DOM children
 * (including a previously-appended <link>) but leaves adoptedStyleSheets
 * untouched, since it isn't part of the DOM tree.
 */
export async function injectExternalCSS(shadowRoot: ShadowRoot, cssUrl: string): Promise<void> {
  const cssText = await fetchCSSText(cssUrl);

  if ("adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(cssText);
    shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, sheet];
  } else {
    const style = document.createElement("style");
    style.textContent = cssText;
    shadowRoot.appendChild(style);
  }
}
