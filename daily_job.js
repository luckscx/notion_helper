const {Client, LogLevel} = require('@notionhq/client');
const moment = require('moment');
const process = require('process');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});

const target_day = moment().add(1, 'days').format('YYYY-MM-DD');

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

function makeNewPage(old_info) {
  const title = moment(target_day).format('MM-DD (ddd)');
  const props = old_info.properties;
  const new_props = {
    'Name': {
      type: 'title',
      title: [{type: 'text', text: {content: title}}],
    },
    '日期': {
      type: 'date',
      date: {
        start: target_day,
      },
    },
    '所属周': {
      type: 'relation',
      relation: props['所属周'].relation,
    },
  };
  return new_props;
}


async function addNotionPage(old_page) {
  const old_content = await getBlockChilds(old_page.id);
  const new_blocks = old_content.filter((o) => {
    console.log(o);
    if (o.child_database) {
      return false;
    }
    return true;
  }).map((one) => {
    delete one.id;
    delete one.created_time;
    delete one.last_edited_time;
    delete one.created_by;
    delete one.archived;
    return one;
  });
  console.log(new_blocks);
  try {
    await notion.pages.create({
      parent: {database_id: databaseId},
      properties: makeNewPage(old_page),
      cover: old_page.cover,
      icon: old_page.icon,
      children: new_blocks,
    });
    console.log('added new day page success');
    return true;
  } catch (err) {
    console.error(err.body);
    console.error('The function execution failed !');
    return false;
  }
};

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
            // 'equals': moment().format('YYYY-MM-DD'),
            'equals': target_day,
          },
        }],
    },
  };
  const response = await notion.databases.query(query_obj);
  return response;
};

async function main() {
  let cursor;
  const resp = await getCurrentPage(cursor);
  const cnt = resp.results.length;
  if (cnt == 1) {
    await addNotionPage(resp.results[0]);
  }
};

main();
