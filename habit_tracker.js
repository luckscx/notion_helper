const {Client, LogLevel} = require('@notionhq/client');
const moment = require('moment');
const process = require('process');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});


async function getBlockChilds(page_id) {
  const response = await notion.blocks.children.list({
    block_id: page_id,
    page_size: 100,
  });

  const list = response.results;
  for (const item of list) {
    if (item.has_children) {
      if (item.type == 'column_list') {
        item.column_list.children = await getBlockChilds(item.id);
      }
      if (item.type == 'column') {
        item.column.children = await getBlockChilds(item.id);
      }
    }
  }
  console.log(list);
  return list;
}

function makeNewPage(idx) {
  const target_day = moment().add(idx, 'days').format('YYYY-MM-DD');
  const target_title = moment().add(idx, 'days').format('YYYY-MM-DD (ddd)');
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


async function addNotionPage(idx) {
  try {
    await notion.pages.create({
      parent: {database_id: databaseId},
      properties: makeNewPage(idx),
    });
    return true;
  } catch (err) {
    console.error(err.body);
    console.error('The function execution failed !');
    return false;
  }
}

async function main() {
  for (let i = 0; i < 30; ++i) {
    await addNotionPage(i);
  }
}

main();
