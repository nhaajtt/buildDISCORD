// A port of composePlan from the bot (src/themes/index.js) that works on the exported theme data, so the website can show the bot's real
// result for any mix. It is plain JavaScript on purpose: the bot's test suite imports it and compares it with the bot for every mix of
// up to four themes (test/webdata.test.js), which is what keeps the two from drifting apart.

export function compose(data, ids) {
  const picked = ids.map((id) => {
    const theme = data.themes.find((t) => t.id === id);
    if (!theme) throw new Error(`Unknown theme: ${id}`);
    return theme;
  });

  const seenChannels = new Set();
  const seenCategories = new Set();
  const categories = [];
  const add = (category) => {
    if (seenCategories.has(category.name)) return;
    const channels = category.channels.filter((c) => {
      if (seenChannels.has(c.name)) return false;
      seenChannels.add(c.name);
      return true;
    });
    if (!channels.length) return;
    seenCategories.add(category.name);
    categories.push({ name: category.name, staff: Boolean(category.staff), channels });
  };
  add(data.base.info);
  for (const theme of picked) theme.categories.forEach(add);
  add(data.base.dj);
  add(data.base.staff);

  const roles = [...data.base.roles, ...picked.flatMap((t) => t.roles)];
  return {
    label: picked.map((t) => t.label).join(" + "),
    roles,
    rules: data.base.rules + picked.reduce((n, t) => n + t.extraRules, 0),
    categories,
    counts: {
      roles: roles.length,
      categories: categories.length,
      channels: categories.reduce((n, c) => n + c.channels.length, 0),
    },
  };
}
