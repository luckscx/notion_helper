const {Client, LogLevel} = require('@notionhq/client');
const retry = require('async-await-retry');
const moment = require('moment');
const process = require('process');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});

const target_day = moment().add(2, 'days').format('YYYY-MM-DD');

function makeNewPage() {
  const title = moment(target_day).format('MMDD(ddd)三餐');
  return {
    'Name': {
      title: [{type: 'text', text: {content: title}}],
    },
    '日期': {
      'date': {
        start: target_day,
      },
    },
  };
}


async function addNotionPage() {
  try {
    await retry(async () => {
      return await notion.pages.create({
        parent: {database_id: databaseId},
        properties: makeNewPage(),
      });
    }, null, {retriesMax: 4, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function getCurrentPage() {
  const query_obj = {
    database_id: databaseId,
    page_size: 1,
    filter:
    {
      'and': [
        {
          'property': '日期',
          'date': {
            'equals': target_day,
          },
        }],
    },
  };
  const response = await notion.databases.query(query_obj);
  return response;
}

async function main() {
  let cursor;
  const resp = await getCurrentPage(cursor);
  const cnt = resp.results.length;
  if (cnt > 0) {
    console.log('already exist %s', target_day);
    return;
  }
  await addNotionPage();
  console.log('added new day page success');
}

main();
