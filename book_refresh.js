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


async function getNotionDBList(start_cursor) {
  const query_obj = {
    database_id: databaseId,
    page_size: 1,
    filter:
    {
      'and': [
        {
          'property': '原书名',
          'rich_text': {
            'is_empty': true,
          },
        }],
    },
    sorts: [
      {
        property: 'ISBN',
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

async function searchBook(key) {
  if (!key) {
    return null;
  }
  const info_url = `http://127.0.0.1:8085/book/list?key=${encodeURI(key)}`;
  console.log(info_url);
  try {
    const res = await superagent.get(info_url);
    const json = res.body;
    return json.data[0].cover_link;
  } catch (error) {
    console.log('load url error %s', info_url);
    console.log(error);
    return null;
  }
}

async function getBookInfo(url) {
  const load_data = `http://127.0.0.1:8085/book/detail?url=${url}`;
  console.log(load_data);
  try {
    const res = await superagent.get(load_data);
    const json = res.body;
    console.log(json);
    json.data.url = url;
    return json.data;
  } catch (error) {
    console.log('load url error %s', url);
    return null;
  }
}

function getPropertiesFromInfo(Info) {
  const rating = parseFloat(Info.rating);
  const rating_user = parseInt(Info.rating_user);
  let pub_date = Info['出版年'];
  pub_date = moment(pub_date, 'YYYY-mm-dd').format('YYYY-MM-DD');
  const author = Info['作者'].split('/');
  let trans = [];
  if (Info['译者']) {
    trans = Info['译者'].split('/');
  }
  let ori_name = Info['原作名'];
  if (!ori_name) {
    ori_name = Info.title;
  }
  const page_num = parseInt(Info['页数']);
  return {
    'ISBN': {
      title: [{type: 'text', text: {content: Info.ISBN}}],
    },
    '书名': {
      'rich_text': [{
        'type': 'text',
        'text': {content: Info.title},
      }],
    },
    '原书名': {
      'rich_text': [{
        'type': 'text',
        'text': {content: ori_name},
      }],
    },
    '豆瓣评分': {
      'number': rating,
    },
    '页数': {
      'number': page_num,
    },
    '豆瓣页面': {
      'url': Info.url,
    },
    '出版时间': {
      'date': {
        start: pub_date,
      },
    },
    '出版社': {
      'select':
      {
        'name': Info['出版社'],
      },
    },
    '豆瓣打分人数': {
      'number': rating_user,
    },
    '作者': {
      'multi_select': author.map((name) => {
        return {
          name: name,
        };
      }),
    },
    '译者': {
      'multi_select': trans.map((name) => {
        return {
          name: name,
        };
      }),
    },
    '封面': {
      'files': [
        {
          name: Info.pic,
          type: 'external',
          external: {
            url: Info.pic,
          },
        },
      ],
    },
  };
}

async function updateNotionPage(page_info, obj) {
  const pageId = page_info.id;
  try {
    await retry(async () => {
      return await notion.pages.update({
        page_id: pageId,
        properties: getPropertiesFromInfo(obj),
      });
    }, null, {retriesMax: 1, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.log(obj);
    console.error(err);
    console.error('The function execution failed !');
  }
};


async function pageWork(one) {
  const prop = one.properties;
  console.log(prop);
  const key = prop['ISBN'].title[0].plain_text;

  const page_url = await searchBook(key);
  if (!page_url) {
    console.log('search fail %s', isbn_num);
    return;
  }

  const douban_info = await getBookInfo(page_url);
  if (!douban_info) {
    console.log('not get page info for %s', page_url);
    return;
  }

  await updateNotionPage(one, douban_info);
};

async function main() {
  let cursor;
  while (true) {
    const list = await getNotionDBList(cursor);
    const cnt = list.results.length;
    console.log('get notion db list %d', cnt);
    await Promise.map(list.results, pageWork, {concurrency: 5});
    console.log('batch done %d', cnt);
    if (list.has_more) {
      cursor = list.next_cursor;
      console.log('now cursor %s', cursor);
    } else {
      break;
    }
  }
  console.log('finish all');
};

main();
