const NotionAPI = require('./notion_api');
const cheerio = require('cheerio');
const superagent = require('superagent');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const process = require('process');
const MobyGames = require('./mobygames');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

// 创建 Notion API 实例，使用我们自己的库
const notion = new NotionAPI({
  token: NOTION_KEY,
  proxy: 'socks5://127.0.0.1:10808'
});

async function updateNotionPage(page_info, obj) {
  const pageId = page_info.id;
  try {
    await retry(async () => {
      return await notion.updatePage(pageId, {
        properties: getPropertiesFromInfo(obj)
      });
    }, null, {retriesMax: 3, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function pageWork(one) {
  const prop = one.properties;
  
  // 获取页面名称用于日志
  let pageName = '未知页面';
  if (prop['Name'] && prop['Name'].title && prop['Name'].title[0]) {
    pageName = prop['Name'].title[0].plain_text;
  }
  
  console.log(`🔍 处理页面: ${pageName}`);
  
  // 检查MobyGamesURL
  if (!prop['MobyGamesURL'] || !prop['MobyGamesURL'].url) {
    console.log(`⚠️  跳过 ${pageName}: MobyGamesURL 为空或不存在`);
    console.log(`   需要手动添加 MobyGames 的URL: https://www.mobygames.com/game/...`);
    return;
  }
  
  const page_url = prop['MobyGamesURL'].url;
  console.log(`📡 获取游戏信息: ${page_url}`);
  
  const page_info = await getGameInfo(page_url);
  if (page_info) {
    console.log(`✅ 成功获取游戏信息: ${page_info.name}`);
    await updateNotionPage(one, page_info);
  } else {
    console.log(`❌ 无法获取游戏信息: ${page_url}`);
  }
}

const batch_size = 1;

async function getNotionDBList(start_cursor) {
  const query_obj = {
    page_size: batch_size,
    filter: {
      'and': [{
        'property': 'MobyGames评分', 'number': {
          'is_empty': true,
        },
      }],
    },
    sorts: [{
      property: 'Last edited time', direction: 'descending',
    }],
  };
  if (start_cursor) {
    query_obj.start_cursor = start_cursor;
  }
  return await notion.queryDatabase(databaseId, query_obj);
}

// getMeta函数已移至mobygames.js模块

async function getGameInfo(url) {
  if (!url) {
    return null;
  }
  
  try {
    // 使用新的MobyGames模块获取游戏信息
    const gameInfo = await MobyGames.getGameInfo(url);
    
    if (gameInfo) {
      // 转换为原有格式以保持兼容性
      const info = {
        name: gameInfo.name,
        image: gameInfo.image,
        grade: gameInfo.grade,
        developer: gameInfo.developer,
        publisher: gameInfo.publisher,
        // 新增字段
        platforms: gameInfo.platforms,
        releaseDate: gameInfo.releaseDate,
        gameTypes: gameInfo.gameTypes,
        description: gameInfo.description,
        officialSite: gameInfo.officialSite
      };
      
      console.log('✅ 游戏信息:', info);
      return info;
    }
    
    return null;
  } catch (error) {
    console.error('❌ 获取游戏信息失败:', error.message);
    console.error('load url error %s', url);
    return null;
  }
}


// getPublisher函数已移至mobygames.js模块

function getPropertiesFromInfo(Info) {
  let {name, image, grade, publisher, developer, platforms, releaseDate, gameTypes, description, officialSite} = Info;
  const title = name;
  grade = parseFloat(grade);
  
  const properties = {
    'English Name': {
      'rich_text': [{
        'type': 'text',
        'text': {content: title},
      }],
    },
    'MobyGames评分': {
      'number': grade,
    },
    '发行商': {
      'select': {
        'name': publisher || 'none',
      },
    },
    '开发商': {
      'select': {
        'name': developer || 'none',
      },
    },
    '封面图': {
      'files': [{
        name: image, type: 'external', external: {
          url: image,
        },
      }],
    },
  };
  
  // 添加新字段（如果Notion数据库支持）
  if (platforms && platforms.length > 0) {
    properties['平台'] = {
      'multi_select': platforms.map(platform => ({ name: platform }))
    };
  }
  
  if (releaseDate) {
    properties['发布日期'] = {
      'date': {
        'start': releaseDate
      }
    };
  }
  
  if (gameTypes && gameTypes.length > 0) {
    properties['Tags'] = {
      'multi_select': gameTypes.map(type => ({ name: type }))
    };
  }
  
  if (officialSite) {
    properties['官方网站'] = {
      'url': officialSite
    };
  }
  
  return properties;
}

async function main() {
  let cursor;
  while (true) {
    const response = await getNotionDBList(cursor);
    
    // 检查响应是否成功
    if (!response || !response.data) {
      console.error('查询数据库失败:', response);
      break;
    }
    
    const list = response.data; // 从 response.data 中获取实际数据
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
