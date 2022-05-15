const {Client, LogLevel} = require('@notionhq/client');
const cheerio = require('cheerio');
const superagent = require('superagent');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const moment = require('moment');
const process = require('process');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});

const update_notion_page = async (page_info, obj) => {
  const pageId = page_info.id;
  try {
    const res = await retry(async () => {
      return await notion.pages.update({
        page_id: pageId,
        properties: getPropertiesFromInfo(obj),
      });
    }, null, {retriesMax: 4, interval: 1000, exponential: true, factor: 3, jitter: 100});
    console.log(res); // output : OK
  } catch (err) {
    console.error('The function execution failed !');
  }
};

const page_work = async (one) => {
  const prop = one.properties;
  const page_url = prop['条目链接'].url;
  const douban_info = await getMovieInfo(page_url);
  if (douban_info) {
    await update_notion_page(one, douban_info);
  } else {
    console.log('not get page info for %s', page_url);
  }
};

const getNotionDBList = async (start_cursor) => {
  const query_obj = {
    database_id: databaseId,
    page_size: 30,
    filter:
    {
      'and': [
        {
          'property': '制片国家',
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
  const response = await notion.databases.query(query_obj);
  return response;
};

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
};

function getReleaseDate($) {
  let dd = '';
  $('#info>span').each(function(i, el) {
    if ($(this).attr('property') == 'v:initialReleaseDate') {
      res = $(this).text();
      res = res.replace(/\(.*\)/i, '');
      // only year
      if (res.length == 4) {
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
};


function getTypeArr($) {
  const type_arr = [];
  let flag = false;
  $('#info>span').each(function(i, el) {
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
};

function getMeta($) {
  const res = {};
  $('meta').each(function(i, el) {
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
};

async function getMovieInfo(url) {
  if (!url) {
    return null;
  }
  try {
    const html = await superagent.get(url);
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
      director: $('#info>span').eq('0').find('a').text(), // 导演
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

function getPropertiesFromInfo(Info) {
  let {name, picurl, grade, country, director, init_date, type, rating_people, seconds} = Info;
  const title = name;
  grade = parseFloat(grade);
  return {
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
      'rich_text': [{
        text: {content: director},
      }],
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
}

const main = async () => {
  let cursor;
  while (true) {
    const list = await getNotionDBList(cursor);
    await Promise.map(list.results, page_work, {concurrency: 10});
    console.log('batch done');
    if (list.has_more) {
      cursor = list.next_cursor;
      console.log('now cursor %s', cursor);
    } else {
      break;
    }
  }
};

main();
