const {Client, LogLevel} = require('@notionhq/client');
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
    page_size: 10,
    // filter:
    // {
    // 'and': [
    // {
    // 'property': 'State',
    // 'select': {
    // 'is_empty': true,
    // },
    // }],
    // },
    sorts: [
      {
        property: '标题',
        direction: 'ascending',
      },
    ],
  };
  if (start_cursor) {
    query_obj.start_cursor = start_cursor;
  }
  const response = await notion.databases.query(query_obj);
  return response;
}

function getPropertiesFromInfo(Info) {
  return {
    '导演': {
      'multi_select': [],
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
}


async function pageWork(one) {
  const prop = one.properties;
  const arr = prop['导演'].multi_select;
  console.log(arr);
  if (arr[0] && arr[0].name.length > 10) {
    const obj = {
    };
    await updateNotionPage(one, obj);
  }
}

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
}

main();
