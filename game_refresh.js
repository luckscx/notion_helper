const {Client, LogLevel} = require('@notionhq/client');
const cheerio = require('cheerio');
const superagent = require('superagent');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const process = require('process');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN});

async function updateNotionPage(page_info, obj) {
  const pageId = page_info.id;
  try {
    await retry(async () => {
      return await notion.pages.update({
        page_id: pageId, properties: getPropertiesFromInfo(obj),
      });
    }, null, {retriesMax: 3, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function pageWork(one) {
  const prop = one.properties;
  const page_url = prop['MobyGamesURL'].url;
  const page_info = await getGameInfo(page_url);
  if (page_info) {
    await updateNotionPage(one, page_info);
  } else {
    console.log('not get page info for %s', page_url);
    console.log(prop['Name']);
  }
}

const batch_size = 1;

async function getNotionDBList(start_cursor) {
  const query_obj = {
    database_id: databaseId, page_size: batch_size, filter: {
      'and': [{
        'property': 'MobyGames评分', 'number': {
          'is_empty': true,
        },
      }],
    }, sorts: [{
      property: 'Last edited time', direction: 'descending',
    }],
  };
  if (start_cursor) {
    query_obj.start_cursor = start_cursor;
  }
  return await notion.databases.query(query_obj);
}

function getMeta($) {
  const res = {};
  $('meta').each(function() {
    const prop = $(this).attr('property');
    if (prop === 'og:title') {
      res.name = $(this).attr('content');
    }
    if (prop === 'og:image') {
      res.image = $(this).attr('content');
    }
  });
  return res;
}

async function getGameInfo(url) {
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
    const {publisher, developer} = getPublisher($);
    const info = {
      name: meta_info.name, image: meta_info.image, // 图片
      grade: $('.mobyscore').text(), // 评分
      developer: developer, publisher: publisher,
    };
    console.log(info);
    return info;
  } catch (error) {
    console.log('load url error %s', url);
    return null;
  }
}


function getPublisher($) {
  let publisher = '';
  let developer = '';
  $('.info-release .metadata').children().each((index, ele) => {
    const child = $(ele);
    let ttt = child.text().trim();
    if (ttt === 'Publishers') {
      publisher = child.next().text().trim();
    }
    if (ttt === 'Developers') {
      developer = child.next().text().trim();
    }
  });
  return {publisher, developer};
}

function getPropertiesFromInfo(Info) {
  let {name, image, grade, publisher, developer} = Info;
  const title = name;
  grade = parseFloat(grade);
  return {
    'Name': {
      title: [{type: 'text', text: {content: title}}],
    }, 'MobyGames评分': {
      'number': grade,
    }, '发行商': {
      'select': {
        'name': publisher || 'none',
      },
    }, '开发商': {
      'select': {
        'name': developer || 'none',
      },
    }, '封面图': {
      'files': [{
        name: image, type: 'external', external: {
          url: image,
        },
      }],
    },
  };
}

async function main() {
  let cursor;
  while (true) {
    const list = await getNotionDBList(cursor);
    const cnt = list.results.length;
    console.log('get notion db list %d', cnt);
    await Promise.map(list.results, pageWork, {concurrency: batch_size});
    console.log('batch done %d', cnt);
    break;
    // if (list.has_more) {
    //   cursor = list.next_cursor;
    //   console.log('now cursor %s', cursor);
    // } else {
    //   break;
    // }
  }
  console.log('finish all');
}

main();
