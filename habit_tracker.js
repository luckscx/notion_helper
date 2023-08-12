const {Client, LogLevel} = require('@notionhq/client');
const moment = require('moment');
const process = require('process');
const retry = require('async-await-retry');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});

function makeNewPage(target_day, target_title) {
  console.log('added new day page %s', target_day);
  const new_props = {
    'Name': {
      type: 'title',
      title: [{type: 'text', text: {content: target_title}}],
    },
    '时间': {
      type: 'date',
      date: {
        start: target_day,
      },
    },
  };
  return new_props;
}

async function hasPage(target_day) {
  const query_obj = {
    database_id: databaseId,
    page_size: 10,
    filter:
     {
       'and':
       [
         {
           'property': '时间',
           'date': {
             'equals': target_day,
           },
         }],
     },
  };
  const response = await notion.databases.query(query_obj);
  const cnt = response.results.length;
  console.log(cnt);
  return cnt >= 1;
}

async function checkThenCreate(idx) {
  const target_day = moment().add(idx, 'days').format('YYYY-MM-DD');
  const target_title = moment().add(idx, 'days').format('YYYY-MM-DD (ddd)');
  const ret = await hasPage(target_day);
  if (!ret) {
    await retry(async () => {
      await notion.pages.create({
        parent: {database_id: databaseId},
        properties: makeNewPage(target_day, target_title),
      });
    }, null, {retriesMax: 3, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } else {
    console.log('skip %s', target_day);
  }
}


async function addNotionPage(idx) {
  try {
    await checkThenCreate(idx);
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function main() {
  for (let i = 0; i < 30; ++i) {
    await addNotionPage(i);
  }
}

main();
