(() => {
  const anchors = [...document.querySelectorAll("a[href]")];
  const rows = anchors
    .map((anchor) => {
      const href = anchor.href;
      if (!/^https?:\/\//i.test(href)) return undefined;
      const title =
        anchor.getAttribute("title") ||
        anchor.getAttribute("aria-label") ||
        anchor.textContent?.trim() ||
        new URL(href).hostname;
      const image = anchor.querySelector("img");
      const iconUrl = image?.src;
      return { title: title.trim(), url: href, iconUrl };
    })
    .filter(Boolean)
    .filter((row, index, all) => all.findIndex((item) => item.url === row.url) === index);

  const text = JSON.stringify({ shortcuts: rows }, null, 2);
  navigator.clipboard
    ?.writeText(text)
    .then(() => alert(`已复制 ${rows.length} 个链接，回到 whytab 导入即可。`))
    .catch(() => {
      console.log(text);
      alert("浏览器阻止了自动复制，数据已输出到控制台。");
    });
})();
