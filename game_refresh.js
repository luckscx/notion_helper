const NotionAPI = require('./notion_api');
const cheerio = require('cheerio');
const superagent = require('superagent');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const process = require('process');
const MobyGames = require('./mobygames');
const ImageProxy = require('./image_proxy');
const config = require('./config');

const NOTION_KEY = config.notion.token;
const databaseId = config.notion.gameDatabaseId;


const notion_config = {
  token: NOTION_KEY,
  proxy: config.proxy.enabled ? config.proxy.url : null,
}

const notion = new NotionAPI(notion_config);

async function updateNotionPage(page_info, obj) {
  const pageId = page_info.id;
  try {
    let properties;
    
    // 检查是否有预定义的属性（用于智能搜索的情况）
    if (obj._properties) {
      properties = obj._properties;
    } else {
      properties = await getPropertiesFromInfo(obj);
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
      const updatedProperties = await getPropertiesFromInfo(smartResult.gameInfo);
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

async function getPropertiesFromInfo(Info) {
  let {name, image, grade, publisher, developer, releaseDate, gameTypes, officialSite} = Info;
  const title = name;
  
  // 处理分数，将"n/a"转换为0
  if (grade === 'n/a' || grade === 'N/A' || grade === 'n/A' || grade === 'N/a') {
    grade = 0;
    console.log(`⚠️  检测到无效分数"n/a"，转换为0`);
  } else {
    grade = parseFloat(grade);
    // 如果parseFloat返回NaN，也转换为0
    if (isNaN(grade)) {
      grade = 0;
      console.log(`⚠️  分数解析失败，转换为0`);
    }
  }
  
  // 处理图片URL，当超过100个字符时使用Notion文件上传接口
  let processedImage = image;
  let uploadedFileId = null;
  
  if (image && image.length > 100) {
    try {
      console.log(`📸 图片URL过长 (${image.length} 字符)，使用Notion文件上传接口`);
      
      // 使用Notion的uploadFileFromUrl接口上传文件
      const uploadResult = await notion.uploadFileFromUrl(image);
      
      if (uploadResult && uploadResult.file_id) {
        uploadedFileId = uploadResult.file_id;
        console.log(`✅ 图片上传到Notion成功！文件ID: ${uploadedFileId}`);
        console.log(`   文件名: ${uploadResult.upload_result.filename}`);
        console.log(`   文件大小: ${uploadResult.upload_result.content_length} 字节`);
      } else {
        console.error(`❌ Notion文件上传失败:`, uploadResult.message);
      }
    } catch (error) {
      console.error(`❌ Notion文件上传失败:`, error.message);
    }
  }
  
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
  };
  
  // 设置封面图字段
  if (uploadedFileId) {
    // 使用上传到Notion的文件ID
    properties['封面图'] = {
      'files': [{
        name: "logo.jpg",
        type: 'file_upload', 
        file_upload: {
          id: uploadedFileId,
        },
      }],
    };
    console.log(`✅ 封面图使用Notion文件ID: ${uploadedFileId}`);
  } else if (processedImage) {
    // 使用处理后的图片URL（短链接）
    properties['封面图'] = {
      'files': [{
        type: 'external', 
        external: {
          url: processedImage,
        },
      }],
    };
    console.log(`✅ 封面图使用处理后的URL: ${processedImage.length} 字符`);
  }
  
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
