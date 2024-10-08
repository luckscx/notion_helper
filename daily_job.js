const {Client, LogLevel} = require('@notionhq/client');
const moment = require('moment');
const process = require('process');
const retry = require('async-await-retry');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.INFO});

function getTodayProperty(page_info) {
  let target_day = moment();
  if (target_day.day() == 0) { // 当天是星期天，直接处理为星期一
    target_day = target_day.add(1, 'days');
  }

  //改成明天
  if (page_info.properties['日期'].date.start == target_day.format('YYYY-MM-DD')) {
    target_day = target_day.add(1, 'days');
  }

  const name_title = target_day.format('日报 YY.MM.DD');
  const day_str = target_day.format('YYYY-MM-DD');
  const obj = {
    'Name': {
      title: [{type: 'text', text: {content: name_title}}],
    },
    '日期': {
      'date': {
        start: day_str,
      },
    },
  };
  return obj;
}

async function updateNotionPage(page_info) {
  const pageId = page_info.id;
  try {
    await retry(async () => {
      return await notion.pages.update({
        page_id: pageId,
        properties: getTodayProperty(page_info),
      });
    }, null, {retriesMax: 1, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function getCurrentPage() {
  const query_obj = {
    database_id: databaseId,
    page_size: 2,
    sorts: [
      {
        property: '日期',
        direction: 'descending',
      },
      {
        property: 'CreateTime',
        direction: 'descending',
      },
    ],
  };
  const response = await notion.databases.query(query_obj);
  return response;
}

const getPageTitle = (page) => {
  console.log(page.properties['Name']);
  const title = page.properties['Name']['title'][0]['plain_text'];
  if (!title) {
    exit(-1);
  }
  console.log(title);
  return title;
};

// 拿到最新的两个页面，修改其中一天的日期属性
async function main() {
  let cursor;
  const resp = await getCurrentPage(cursor);
  const cnt = resp.results.length;
  console.log('get cnt', cnt)
  if (cnt == 2 && getPageTitle(resp.results[0]) == getPageTitle(resp.results[1])) {
    console.log('do update page');
    await updateNotionPage(resp.results[1]);
  }
}

main();
