const pagefind = await import("/pagefind/pagefind.js");

const input = document.getElementById("search-input");
const results = document.getElementById("search-results");

function setMessage(msg) {
  results.className = "";
  results.innerHTML = "";
  const p = document.createElement("p");
  p.className = "search-message";
  p.textContent = msg;
  results.appendChild(p);
}

async function runSearch(query) {
  if (!query.trim()) { setMessage("Enter a query to search blog posts and docs."); return; }
  setMessage("Searching…");
  try {
    const search = await pagefind.search(query);
    const data = await Promise.all(search.results.map(r => r.data()));
    displayResults(data);
  } catch (err) {
    setMessage("Search unavailable.");
  }
}

function displayResults(items) {
  if (!items.length) { setMessage("No results found."); return; }
  results.className = "posts-list";
  results.innerHTML = "";
  items.forEach((r, i) => {
    const article = document.createElement("article");
    article.className = "post-item";

    const h2 = document.createElement("h2");
    h2.className = "post-title";
    const a = document.createElement("a");
    a.href = r.url;
    a.textContent = r.meta.title || "Untitled";
    h2.appendChild(a);
    article.appendChild(h2);

    if (r.meta.description) {
      const p = document.createElement("p");
      p.className = "post-excerpt";
      p.textContent = r.meta.description;
      article.appendChild(p);
    }

    // r.excerpt is HTML from pagefind (highlighted matches) — safe to use as innerHTML
    const excerpt = document.createElement("p");
    excerpt.className = "search-excerpt";
    excerpt.innerHTML = r.excerpt;
    article.appendChild(excerpt);

    const readMore = document.createElement("a");
    readMore.href = r.url;
    readMore.className = "read-more";
    readMore.textContent = "Read more →";
    article.appendChild(readMore);

    results.appendChild(article);

    if (i < items.length - 1) {
      const hr = document.createElement("hr");
      hr.className = "post-separator";
      results.appendChild(hr);
    }
  });
}

let debounce;
input?.addEventListener("input", e => {
  const q = e.target.value;
  const url = new URL(window.location);
  q ? url.searchParams.set("q", q) : url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
  clearTimeout(debounce);
  debounce = setTimeout(() => runSearch(q), 300);
});

const initialQuery = new URLSearchParams(window.location.search).get("q") || "";
if (initialQuery && input) {
  input.value = initialQuery;
  runSearch(initialQuery);
}
