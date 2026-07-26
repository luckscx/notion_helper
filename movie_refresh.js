const cheerio = require('cheerio');
const superagent = require('superagent');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const moment = require('moment');
const process = require('process');
const fs = require('fs');
const path = require('path');
const {HttpsProxyAgent} = require('https-proxy-agent');
const {SocksProxyAgent} = require('socks-proxy-agent');
const NotionAPI = require('./notion_api');
const config = require('./config');

const NOTION_KEY = process.env.NOTION_KEY || config.notion.token;
const databaseId = process.env.DATABASE_ID || config.notion.movieDatabaseId;

function loadDoubanCookie() {
  if (process.env.DOUBAN_COOKIE) return process.env.DOUBAN_COOKIE;
  if (config.douban?.cookie) return config.douban.cookie;
  const cookieFile = config.douban?.cookieFile;
  if (!cookieFile) return '';
  try {
    const cookies = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, cookieFile), 'utf8'));
    if (!Array.isArray(cookies)) return '';
    return cookies
      .filter((cookie) => cookie && cookie.name && cookie.value)
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
  } catch (err) {
    console.warn('读取豆瓣 Cookie 文件失败: %s', err.message);
    return '';
  }
}

const DOUBAN_COOKIE = loadDoubanCookie();
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const proxyUrl = config.proxy?.enabled ? config.proxy.url : null;
let proxyAgent = null;
if (proxyUrl) {
  if (proxyUrl.startsWith('socks')) {
    proxyAgent = new SocksProxyAgent(proxyUrl);
  } else {
    proxyAgent = new HttpsProxyAgent(proxyUrl);
  }
}

if (!NOTION_KEY || !databaseId) {
  throw new Error('缺少 Notion 配置：NOTION_KEY 或电影数据库 ID');
}

const notion = new NotionAPI({
  token: NOTION_KEY,
  version: config.notion.version,
  proxy: proxyUrl,
});

async function updateNotionPage(page_info, obj, douban_url) {
  const pageId = page_info.id;
  try {
    await retry(async () => {
      return await notion.updatePage(pageId, {
        properties: getPropertiesFromInfo(obj, douban_url),
      });
    }, null, {retriesMax: 4, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function searchDoubanUrl(title) {
  if (!title) return null;
  try {
    const res = await superagent
      .get('https://movie.douban.com/j/subject_suggest')
      .query({q: title})
      .set('Referer', 'https://movie.douban.com')
      .set('User-Agent', USER_AGENT)
      .set('Cookie', DOUBAN_COOKIE)
      .agent(proxyAgent)
      .timeout(15000);
    const results = res.body;
    if (results && results.length > 0) {
      // 取第一个 type 为 movie 的结果
      const movie = results.find((r) => r.type === 'movie') || results[0];
      // 去掉 suggest 参数，返回纯净 URL
      const url = movie.url.replace(/\?suggest=.*$/, '');
      console.log('douban search "%s" -> %s', title, url);
      return url;
    }
  } catch (err) {
    console.log('douban search error for "%s": %s', title, err.message);
  }
  return null;
}

async function pageWork(one) {
  const prop = one.properties;
  let page_url = prop['条目链接'].url;
  let searched_url = null;

  const titleProp = prop['标题'];
  let title = null;
  if (titleProp && titleProp.title && titleProp.title[0]) {
    title = titleProp.title[0].plain_text;
  }

  console.log('title: %s', title);

  if (!page_url) {
    page_url = await searchDoubanUrl(title);
    if (!page_url) {
      console.log('no url and search failed for: %s', title);
      return;
    }
    searched_url = page_url;
  }

  const douban_info = await getMovieInfo(page_url);
  if (douban_info) {
    await updateNotionPage(one, douban_info, searched_url);
  } else {
    console.log('not get page info for %s', page_url);
  }
}

async function getNotionDBList(start_cursor) {
  const query_obj = {
    database_id: databaseId,
    page_size: 10,
    filter:
    {
      'and': [
        {
          'property': '导演',
          'multi_select': {
            'is_empty': true,
          },
        }],
    },
    sorts: [
      {
        property: '上映日期',
        direction: 'ascending',
      },
    ],
  };
  if (start_cursor) {
    query_obj.start_cursor = start_cursor;
  }
  const response = await notion.queryDatabase(databaseId, query_obj);
  return response.data;
}

function getCountry($) {
  const text = $('#info').text();
  const reg = /制片国家\/地区: (.*)/i;
  const res = text.match(reg);
  if (res) {
    country = res[1].split('/');
    country = country.map((o) => {
      return o.trim();
    });
    return country;
  }
  return [];
}

function getReleaseDate($) {
  let dd = '';
  $('#info>span').each(function() {
    if ($(this).attr('property') == 'v:initialReleaseDate') {
      res = $(this).text();
      res = res.replace(/\(.*\)/i, '');
      if (res.length == 4) { // only year
        res = res + '-01-01';
      }
      if (dd == '') {
        dd = res;
      }
      if (moment(res, 'YYYY-MM-DD').isBefore(moment(dd, 'YYYY-MM-DD')) ) {
        dd = res;
      }
    }
  });
  return dd;
}


function getTypeArr($) {
  const type_arr = [];
  let flag = false;
  $('#info>span').each(function() {
    const n = $(this).text();
    if (n == '类型:') {
      flag = true;
      return;
    }
    if (n == '制片国家/地区:' || n == '官方网站:' || n.length > 3) {
      flag = false;
    }
    if (flag) {
      type_arr.push(n);
    }
  });
  return type_arr;
}

function getMeta($) {
  const res = {};
  $('meta').each(function() {
    const prop = $(this).attr('property');
    if (prop == 'video:duration') {
      res.seconds = parseInt($(this).attr('content'));
    }
    if (prop == 'og:title') {
      res.name = $(this).attr('content');
    }
  });
  if (!res.seconds) {
    res.seconds = -1;
  }
  return res;
}

const getDirector = ($) => {
  const director = $('#info>span').eq('0').text();
  const arr = director.split(':');
  if (arr[0] == '导演') {
    return arr[1].split('/').map((s) => s.trim());
  } else {
    return ['无'];
  }
};

async function getMovieInfo(url) {
  if (!url) {
    return null;
  }
  try {
    const html = await superagent
      .get(url)
      .set('User-Agent', USER_AGENT)
      .set('Referer', 'https://movie.douban.com')
      .set('Accept-Language', 'zh-CN,zh;q=0.9')
      .set('Cookie', DOUBAN_COOKIE)
      .agent(proxyAgent)
      .timeout(15000);
    if (!html) {
      return null;
    }
    const $ = cheerio.load(html.text);
    const meta_info = getMeta($);
    const info = {
      name: meta_info.name,
      picurl: $('#mainpic img').attr('src'), // 图片
      grade: $('.rating_num').text(), // 评分
      rating_people: parseInt($('.rating_people span').text()), // 影评数
      director: getDirector($),
      type: getTypeArr($),
      seconds: meta_info['seconds'],
      init_date: getReleaseDate($),
      country: getCountry($),
    };
    console.log(info);
    return info;
  } catch (error) {
    console.log('load url error %s', url);
    return null;
  }
}

function getPropertiesFromInfo(Info, douban_url) {
  let {name, picurl, grade, country, director, init_date, type, rating_people, seconds} = Info;
  const title = name;
  grade = parseFloat(grade);
  const props = {
    '标题': {
      title: [{type: 'text', text: {content: title}}],
    },
    '豆瓣评分': {
      'number': grade,
    },
    '上映日期': {
      'date': {
        start: init_date,
      },
    },
    '豆瓣点评数': {
      'number': rating_people,
    },
    '时长': {
      'number': seconds,
    },
    '导演': {
      'multi_select': director.map((name) => {
        return {
          name: name,
        };
      }),
    },
    '制片国家': {
      'multi_select': country.map((name) => {
        return {
          name: name,
        };
      }),
    },
    '类型': {
      'multi_select': type.map((name) => {
        return {
          name: name,
        };
      }),
    },
    '海报': {
      'files': [
        {
          name: picurl,
          type: 'external',
          external: {
            url: picurl,
          },
        },
      ],
    },
  };
  if (douban_url) {
    props['条目链接'] = {'url': douban_url};
  }
  return props;
}

async function main() {
  let cursor;
  while (true) {
    const list = await getNotionDBList(cursor);
    const cnt = list.results.length;
    console.log('get notion db list %d', cnt);
    await Promise.map(list.results, pageWork, {concurrency: 10});
    console.log('batch done %d', cnt);
    if (list.has_more) {
      cursor = list.next_cursor;
      console.log('now cursor %s', cursor);
    } else {
      break;
    }
  }
  console.log('finish all');
}

main().catch((err) => {
  const message = err?.data?.message || err?.message || JSON.stringify(err);
  console.error('电影刷新失败:', message);
  process.exitCode = 1;
});
