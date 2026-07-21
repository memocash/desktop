const releaseUrl = "https://api.github.com/repos/memocash/desktop/releases/latest";

const groups = {
  windows: (name) => name.endsWith(".exe"),
  mac: (name) => name.endsWith(".dmg") || name.endsWith(".zip"),
  linux: (name) => name.endsWith(".AppImage") || name.endsWith(".deb"),
};

const labelFor = (name, platform) => {
  const type = name.split(".").pop();
  const arch = name.includes("arm64")
    ? platform === "mac" ? "Apple silicon" : "ARM64"
    : /x64|x86_64|amd64/.test(name) ? "Intel / x64" : "Download";
  return `${type} · ${arch}`;
};

fetch(releaseUrl, { headers: { Accept: "application/vnd.github+json" } })
  .then((response) => {
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    return response.json();
  })
  .then((release) => {
    document.querySelector("#release-status").textContent = `Latest release: ${release.tag_name}`;
    for (const [platform, matches] of Object.entries(groups)) {
      const assets = release.assets.filter((asset) => matches(asset.name));
      if (!assets.length) continue;
      const container = document.querySelector(`#${platform}-links`);
      container.replaceChildren(...assets.map((asset, index) => {
        const link = document.createElement("a");
        link.href = asset.browser_download_url;
        link.textContent = labelFor(asset.name, platform);
        if (index > 0) link.className = "secondary";
        return link;
      }));
    }
  })
  .catch(() => {
    document.querySelector("#release-status").textContent = "Downloads are available on GitHub Releases.";
  });
