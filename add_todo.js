const {Client, LogLevel} = require('@notionhq/client');
const moment = require('moment');
const process = require('process');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});


// {
// object: 'block',
// id: 'd92e5322-3363-40af-8fe6-b1c08def5361',
// parent: {
// type: 'page_id',
// page_id: '350e9a7f-f920-40ac-86fa-db6da3eb19c1'
// },
// created_time: '2022-12-11T08:05:00.000Z',
// last_edited_time: '2022-12-11T08:05:00.000Z',
// created_by: { object: 'user', id: '7045b4b1-bd18-48fd-b81e-7f71c6cfdba8' },
// last_edited_by: { object: 'user', id: '7045b4b1-bd18-48fd-b81e-7f71c6cfdba8' },
// has_children: false,
// archived: false,
// type: 'heading_1',
// heading_1: { rich_text: [Array], is_toggleable: false, color: 'default' }
// },
async function getPageContent(page_id) {
  const response = await notion.blocks.children.list({
    block_id: page_id,
    page_size: 100,
  });

  const list = response.results;
  for (const item of list) {
    console.log(item.type);
    console.log(item.id);
    console.log(item.object);
  }
  return list;
}

async function appendTodo(block_id, text) {
  const new_todo_block = {
    block_id: block_id,
    children: [
      {
        'to_do': {
          'rich_text': [
            {
              'text': {
                'content': text,
              },
            },
          ],
        },
      },
    ],
  };
  const response = await notion.blocks.children.append(new_todo_block);
  console.log(response);
  return true;
}


async function addTodo(text) {
  // await getPageContent(databaseId);
  const todo_parent_id = '5de0f27ffa3f40f1868d79365abfad41';
  await appendTodo(todo_parent_id, text);
  // try {
  // await notion.pages.create({
  // parent: {database_id: databaseId},
  // properties: makeNewPage(idx),
  // });
  // return true;
  // } catch (err) {
  // console.error(err.body);
  // console.error('The function execution failed !');
  // return false;
  // }
}

async function main(text) {
  await addTodo(text);
}

main('aaaa');
