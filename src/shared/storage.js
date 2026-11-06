/* Pixel Notes — persistência em chrome.storage.local.
 * Cada comentário fica numa chave própria ("ann:<id>") para evitar condições de corrida
 * entre abas diferentes salvando ao mesmo tempo. */
(function (g) {
  const PN = (g.PixelNotes = g.PixelNotes || {});
  const P = PN.KEY_PREFIX;

  function area() {
    return chrome.storage.local;
  }

  PN.store = {
    async all() {
      const items = await area().get(null);
      return Object.keys(items)
        .filter((k) => k.startsWith(P))
        .map((k) => items[k])
        .filter(Boolean)
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    async get(id) {
      const res = await area().get(P + id);
      return res[P + id] || null;
    },

    async put(ann) {
      ann.updatedAt = Date.now();
      await area().set({ [P + ann.id]: ann });
      return ann;
    },

    async putMany(list) {
      const obj = {};
      for (const ann of list) obj[P + ann.id] = ann;
      await area().set(obj);
    },

    async update(id, patch) {
      const ann = await PN.store.get(id);
      if (!ann) return null;
      Object.assign(ann, patch);
      return PN.store.put(ann);
    },

    async setStatus(id, status) {
      return PN.store.update(id, {
        status,
        resolvedAt: status === 'resolved' ? Date.now() : null,
      });
    },

    async remove(ids) {
      ids = Array.isArray(ids) ? ids : [ids];
      await area().remove(ids.map((id) => P + id));
    },

    async getSettings() {
      const res = await area().get(PN.SETTINGS_KEY);
      return Object.assign({}, PN.DEFAULT_SETTINGS, res[PN.SETTINGS_KEY] || {});
    },

    async setSettings(patch) {
      const current = await PN.store.getSettings();
      const next = Object.assign(current, patch);
      await area().set({ [PN.SETTINGS_KEY]: next });
      return next;
    },

    async setPendingFocus(id, url) {
      await area().set({ [PN.PENDING_FOCUS_KEY]: { id, url, at: Date.now() } });
    },

    async takePendingFocus() {
      const res = await area().get(PN.PENDING_FOCUS_KEY);
      const pf = res[PN.PENDING_FOCUS_KEY];
      if (!pf) return null;
      await area().remove(PN.PENDING_FOCUS_KEY);
      return Date.now() - pf.at < 2 * 60 * 1000 ? pf : null;
    },

    /** Escuta mudanças relevantes. cb({ annotationsChanged, settingsChanged }) */
    onChange(cb) {
      const listener = (changes, areaName) => {
        if (areaName !== 'local') return;
        const keys = Object.keys(changes);
        const annotationsChanged = keys.some((k) => k.startsWith(P));
        const settingsChanged = keys.includes(PN.SETTINGS_KEY);
        if (annotationsChanged || settingsChanged) cb({ annotationsChanged, settingsChanged, changes });
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },
  };
})(globalThis);
