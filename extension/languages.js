function selectLanguage(options, language) {
  const available = Array.from(options).filter(o => !o.disabled && o.value);
  const label = o => o.textContent.trim();
  if (language === 'C++') {
    const cpp = available.filter(o => /(?:G|C)\+\+/i.test(label(o)));
    return cpp.find(o => /GNU.*(?:G|C)\+\+17\b/i.test(label(o))) || cpp[0];
  }
  if (language === 'C') return available.find(o => /GNU GCC/i.test(label(o)) && !/\+\+/.test(label(o)));
  return available.find(o => label(o).toLowerCase().includes(language.toLowerCase()));
}
if (typeof module !== 'undefined') module.exports = {selectLanguage};
