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
    let properties;
    
    // 检查是否有预定义的属性（用于智能搜索的情况）
    if (obj._properties) {
      properties = obj._properties;
    } else {
      properties = getPropertiesFromInfo(obj);
    }
    
    await retry(async () => {
      return await notion.updatePage(pageId, {
        properties: properties
      });
    }, null, {retriesMax: 3, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.error(err);
    console.error('The function execution failed !');
  }
}

async function pageWork(one) {
  const prop = one.properties;
  let page_url = prop['MobyGamesURL'].url;
  if (MobyGames.isValidGameUrl(page_url)) {
    console.log(`✅ 页面: ${page_url} 有效`);
  } else {
    page_url = null;
  }
  
  // 获取页面名称用于日志
  let pageName = '未知页面';
  let englishName = null;
  if (prop['Name'] && prop['Name'].title && prop['Name'].title[0]) {
    pageName = prop['Name'].title[0].plain_text;
  }
  if (prop['English Name'] && prop['English Name'].rich_text && prop['English Name'].rich_text[0]) {
    englishName = prop['English Name'].rich_text[0].plain_text;
  }
  
  console.log(`🔍 处理页面: ${pageName}`);
  
  // 检查MobyGamesURL
  if (!page_url) {
    console.log(`⚠️  ${pageName}: MobyGamesURL 为空，尝试使用智能搜索获取游戏信息...`);
    
    // 使用智能搜索获取游戏信息
    const smartResult = await MobyGames.smartSearchGame(pageName, englishName);
    
    if (smartResult.success && smartResult.gameInfo) {
      console.log(`✅ 智能搜索成功获取游戏信息: ${smartResult.gameInfo.name}`);
      console.log(`   英文名: ${smartResult.englishTitle}`);
      console.log(`   MobyGames链接: ${smartResult.mobygamesUrl}`);
      
      // 更新Notion页面，同时添加MobyGamesURL
      const updatedProperties = getPropertiesFromInfo(smartResult.gameInfo);
      updatedProperties['MobyGamesURL'] = {
        'url': smartResult.mobygamesUrl
      };
      
      await updateNotionPage(one, {
        ...smartResult.gameInfo,
        _properties: updatedProperties
      });
      
      console.log(`✅ 成功更新页面并添加MobyGamesURL`);
    } else {
      console.log(`❌ 智能搜索失败: ${smartResult.message}`);
      console.log(`   需要手动添加 MobyGames 的URL: https://www.mobygames.com/game/...`);
    }
    return;
  }
  
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
      }, {
        'property': '个人评分', 'number': {
          'greater_than': 8,
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
  
  if (releaseDate) {
    properties['发布日期'] = {
      'date': {
        'start': releaseDate
      }
    };
  }
  
  if (gameTypes && gameTypes.length > 0) {
    properties['Genre'] = {
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
  try {
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
      if (list.has_more) {
        cursor = list.next_cursor;
        console.log('now cursor %s', cursor);
      } else {
        break;
      }
    }
    console.log('finish all');
  } catch (error) {
    console.error('❌ 主函数执行失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

// 使用 .catch() 处理未捕获的Promise拒绝
main().catch(error => {
  console.error('❌ 程序执行失败:', error.message);
  console.error('错误详情:', error);
  process.exit(1);
});
