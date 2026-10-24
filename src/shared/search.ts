// The address bar's search engines a profile can use. 'none' leaves the engine as it ships, without one: text typed
// in the address bar is taken as an address (PLAN 6.14).
export const SEARCH_ENGINES = {
  google: { name: 'Google', keyword: 'google.com', url: 'https://www.google.com/search?q={searchTerms}', home: 'https://www.google.com/' },
  bing: { name: 'Bing', keyword: 'bing.com', url: 'https://www.bing.com/search?q={searchTerms}', home: 'https://www.bing.com/' },
  baidu: { name: 'Baidu', keyword: 'baidu.com', url: 'https://www.baidu.com/s?wd={searchTerms}', home: 'https://www.baidu.com/' },
  duckduckgo: { name: 'DuckDuckGo', keyword: 'duckduckgo.com', url: 'https://duckduckgo.com/?q={searchTerms}', home: 'https://duckduckgo.com/' },
  yahoo: { name: 'Yahoo', keyword: 'yahoo.com', url: 'https://search.yahoo.com/search?p={searchTerms}', home: 'https://search.yahoo.com/' },
  yandex: { name: 'Yandex', keyword: 'yandex.com', url: 'https://yandex.com/search/?text={searchTerms}', home: 'https://yandex.com/' }
} as const;
export type SearchEngine = 'none' | keyof typeof SEARCH_ENGINES;
export const SEARCH_IDS = ['none', ...Object.keys(SEARCH_ENGINES)] as SearchEngine[];
