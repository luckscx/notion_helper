const cheerio = require('cheerio');
const superagent = require('superagent');

/**
 * MobyGames游戏信息提取模块
 * 提供API接口供其他模块使用
 */

// 从原代码复制的getMeta函数
function getMeta($) {
  const res = {};
  
  // 直接从h1标签获取游戏名称
  const h1Element = $('h1').first();
  if (h1Element.length > 0) {
    res.name = h1Element.text().trim();
  }
  
  // 从meta标签获取封面图片
  $('meta').each(function() {
    const prop = $(this).attr('property');
    if (prop === 'og:image') {
      res.image = $(this).attr('content');
    }
  });
  return res;
}

// 获取发行商和开发商信息
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
  
  // 清理公司名称，去掉不必要的字符
  const cleanCompanyName = (name) => {
    if (!name) return '';
    
    return name
      .replace(/,\s*Co\./gi, '')           // 去掉 ", Co."
      .replace(/,\s*Ltd\./gi, '')          // 去掉 ", Ltd."
      .replace(/,\s*Inc\./gi, '')          // 去掉 ", Inc."
      .replace(/,\s*LLC/gi, '')            // 去掉 ", LLC"
      .replace(/,\s*Corp\./gi, '')         // 去掉 ", Corp."
      .replace(/,\s*Limited/gi, '')        // 去掉 ", Limited"
      .replace(/,\s*Corporation/gi, '')    // 去掉 ", Corporation"
      .replace(/,\s*Company/gi, '')        // 去掉 ", Company"
      .replace(/,\s*Entertainment/gi, '')  // 去掉 ", Entertainment"
      .replace(/,\s*Digital/gi, '')        // 去掉 ", Digital"
      .replace(/,\s*Interactive/gi, '')    // 去掉 ", Interactive"
      .replace(/,\s*Studios/gi, '')        // 去掉 ", Studios"
      .replace(/,\s*Team/gi, '')           // 去掉 ", Team"
      .replace(/,\s*SA/gi, '')             // 去掉 ", SA"
      .replace(/,\s*GmbH/gi, '')           // 去掉 ", GmbH"
      .replace(/,\s*AB/gi, '')             // 去掉 ", AB"
      .replace(/,\s*Oy/gi, '')             // 去掉 ", Oy"
      .replace(/,\s*BV/gi, '')             // 去掉 ", BV"
      .replace(/,\s*S\.A\./gi, '')         // 去掉 ", S.A."
      .replace(/,\s*S\.p\.A\./gi, '')      // 去掉 ", S.p.A."
      .replace(/,\s*K\.K\./gi, '')         // 去掉 ", K.K."
      .replace(/,\s*Co\.,\s*Ltd\./gi, '') // 去掉 ", Co., Ltd."
      .replace(/,\s*Inc\.,\s*Ltd\./gi, '') // 去掉 ", Inc., Ltd."
      .replace(/,\s*Corp\.,\s*Ltd\./gi, '') // 去掉 ", Corp., Ltd."
      .replace(/^\s*,\s*/, '')             // 去掉开头的逗号
      .replace(/\s*,\s*$/, '')             // 去掉结尾的逗号
      .replace(/\s*,\s*/, ' ')             // 将中间的多个逗号替换为单个空格
      .replace(/\s+/g, ' ')                // 将多个空格替换为单个空格
      .trim();                              // 去掉首尾空格
  };
  
  return {
    publisher: cleanCompanyName(publisher),
    developer: cleanCompanyName(developer)
  };
}

// 获取游戏平台信息
function getPlatforms($) {
  const platforms = [];
  
  // 查找平台信息 - 尝试多种方法
  $('.info-release, .game-info, .metadata, .game-details').each((index, ele) => {
    const text = $(ele).text().trim();
    
    // 查找包含"Platforms"、"Released on"或"on"的部分
    if (text.includes('Platforms') || text.includes('Released on') || text.includes(' on ')) {
      // 查找该区域内的链接
      $(ele).find('a').each((linkIndex, link) => {
        const linkText = $(link).text().trim();
        const href = $(link).attr('href') || '';
        
        // 只添加看起来像平台名称的链接
        if (linkText && linkText.length > 0 && 
            !linkText.includes('Contribute') && 
            !linkText.includes('Credits') &&
            !linkText.includes('Releases') &&
            !linkText.includes('October')) {
          
          // 检查是否是常见的游戏平台
          const commonPlatforms = ['Windows', 'PlayStation', 'Xbox', 'Nintendo', 'Switch', 'PC', 'Mac', 'Linux', 'iOS', 'Android'];
          if (commonPlatforms.some(platform => linkText.includes(platform)) || 
              href.includes('/platform/') || 
              href.includes('/system/')) {
            platforms.push(linkText);
          }
        }
      });
    }
  });
  
  // 如果没有找到平台，尝试直接从文本中提取
  if (platforms.length === 0) {
    $('.info-release, .game-info, .metadata, .game-details').each((index, ele) => {
      const text = $(ele).text().trim();
      if (text.includes('Released')) {
        // 查找"on"后面的平台名称
        const platformMatch = text.match(/on\s+([A-Za-z0-9\s]+?)(?:\s|$|,|\.)/);
        if (platformMatch) {
          const platform = platformMatch[1].trim();
          if (platform && !platform.includes('2024') && !platform.includes('Oct') && 
              !platform.includes('October') && !platform.includes('Konami') && 
              !platform.includes('Bloober')) {
            platforms.push(platform);
          }
        }
      }
    });
  }
  
  // 去重并清理平台列表
  const uniquePlatforms = [...new Set(platforms)];
  return uniquePlatforms;
}

// 获取发布日期
function getReleaseDate($) {
  let releaseDate = '';
  
  $('.info-release, .game-info, .metadata, .game-details').each((index, ele) => {
    const text = $(ele).text();
    
    // 查找包含"Released"的部分
    if (text.includes('Released')) {
      // 尝试多种日期格式匹配
      const patterns = [
        /Released\s+([^on]+?)\s+on/i,           // "Released Oct 8, 2024 on"
        /Released\s+([^on]+)/i,                  // "Released Oct 8, 2024"
        /Released\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,  // "Released October 8, 2024"
        /Released\s+([A-Za-z]+\s+\d{4})/i       // "Released October 2024"
      ];
      
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          releaseDate = match[1].trim();
          break;
        }
      }
      
      // 如果没有匹配到，尝试更宽松的匹配
      if (!releaseDate) {
        const looseMatch = text.match(/Released\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
        if (looseMatch) {
          releaseDate = looseMatch[1].trim();
        }
      }
    }
  });
  
  return releaseDate;
}

// 转换日期格式为ISO 8601
function convertToISO8601(dateString) {
  if (!dateString) return '';
  
  try {
    // 处理 "April 26, 2024" 格式
    const date = new Date(dateString);
    
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      console.log(`⚠️  无法解析日期格式: ${dateString}`);
      return '';
    }
    
    // 返回ISO 8601格式
    return date.toISOString().split('T')[0]; // 只返回日期部分，不包含时间
  } catch (error) {
    console.log(`⚠️  日期转换失败: ${dateString}`, error.message);
    return '';
  }
}

// 获取游戏类型
function getGameType($) {
  const gameTypes = [];
  
  // 专门查找Genre部分
  $('.info-release, .game-info, .metadata, .game-details').each((index, ele) => {
    const text = $(ele).text().trim();
    
    // 只处理包含Genre的部分
    if (text.includes('Genre')) {
      // 查找Genre标签后的内容
      const genreSection = $(ele);
      
      // 尝试找到Genre标签后的下一个元素
      let genreContent = '';
      
      // 方法1: 查找Genre标签后的文本内容
      const genreMatch = text.match(/Genre\s*([^\n]+)/);
      if (genreMatch) {
        genreContent = genreMatch[1].trim();
      }
      
      // 方法2: 查找Genre标签后的链接
      if (!genreContent) {
        const genreLinks = genreSection.find('a');
        genreLinks.each((linkIndex, link) => {
          const linkText = $(link).text().trim();
          if (linkText && linkText.length > 0 && 
              !linkText.includes('Genre') &&
              !linkText.includes('Contribute') &&
              !linkText.includes('Credits')) {
            gameTypes.push(linkText);
          }
        });
      }
      
      // 如果找到了文本内容，添加到游戏类型中
      if (genreContent && !gameTypes.includes(genreContent)) {
        gameTypes.push(genreContent);
      }
    }
  });
  
  // 如果没有找到Genre，尝试其他方法
  if (gameTypes.length === 0) {
    // 查找可能的游戏类型标签
    $('a').each((index, ele) => {
      const linkText = $(ele).text().trim();
      const href = $(ele).attr('href') || '';
      
      // 检查是否是游戏类型链接（通常包含特定路径）
      if (href.includes('/genre/') || href.includes('/category/')) {
        if (linkText && linkText.length > 0 && 
            !gameTypes.includes(linkText) &&
            !linkText.includes('Genre') &&
            !linkText.includes('Contribute') &&
            !linkText.includes('Credits')) {
          gameTypes.push(linkText);
        }
      }
    });
  }
  
  // 清理和分离组合的游戏类型
  const cleanedGameTypes = [];
  gameTypes.forEach(type => {
    // 分离像"ActionPerspective"这样的组合文本
    if (type.includes('Action') || type.includes('Adventure') || type.includes('RPG') || 
        type.includes('Strategy') || type.includes('Simulation') || type.includes('Sports') ||
        type.includes('Racing') || type.includes('Fighting') || type.includes('Shooter') ||
        type.includes('Horror') || type.includes('Survival') || type.includes('Stealth')) {
      
      // 尝试分离组合词
      const separated = type.replace(/([A-Z])/g, ' $1').trim();
      const parts = separated.split(' ').filter(part => part.length > 0);
      
      parts.forEach(part => {
        const cleanPart = part.trim();
        if (cleanPart && !cleanedGameTypes.includes(cleanPart) && 
            cleanPart.length > 1 && 
            !cleanPart.includes('Genre') &&
            !cleanPart.includes('Perspective') &&
            !cleanPart.includes('Interface') &&
            !cleanPart.includes('Narrative')) {
          cleanedGameTypes.push(cleanPart);
        }
      });
    } else {
      // 直接添加清理后的类型
      const cleanType = type.trim();
      if (cleanType && !cleanedGameTypes.includes(cleanType) && 
          cleanType.length > 1 && 
          !cleanType.includes('Genre') &&
          !cleanType.includes('Perspective') &&
          !cleanType.includes('Interface') &&
          !cleanType.includes('Narrative')) {
        cleanedGameTypes.push(cleanType);
      }
    }
  });
  
  // 进一步过滤，只保留主要的游戏类型
  const mainGameTypes = cleanedGameTypes.filter(type => 
    ['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 
     'Racing', 'Fighting', 'Shooter', 'Horror', 'Survival', 'Stealth',
     'Puzzle', 'Platformer', 'Visual Novel', 'Roguelike', 'Metroidvania'].includes(type)
  );
  
  return mainGameTypes.length > 0 ? mainGameTypes : cleanedGameTypes;
}

// 获取游戏描述
function getGameDescription($) {
  const description = $('meta[name="description"]').attr('content');
  return description || '';
}

// 获取所有元数据
function getAllMetadata($) {
  const metadata = {};
  
  const releaseDate = getReleaseDate($);
  if (releaseDate) metadata['Release Date'] = releaseDate;
  
  const platforms = getPlatforms($);
  if (platforms.length > 0) metadata['Platforms'] = platforms.join(', ');
  
  const gameTypes = getGameType($);
  if (gameTypes.length > 0) metadata['Game Types'] = gameTypes.join(', ');
  
  $('.info-release, .game-info, .metadata, .game-details').each((index, ele) => {
    const text = $(ele).text().trim();
    if (text.includes('Official Site')) {
      const siteLink = $(ele).find('a').attr('href');
      if (siteLink) metadata['Official Site'] = siteLink;
    }
  });
  
  return metadata;
}

/**
 * 主要的API函数：获取游戏信息
 * @param {string} url - MobyGames游戏页面URL
 * @returns {Promise<Object|null>} 游戏信息对象或null
 */
async function getGameInfo(url) {
  if (!url) {
    console.log('❌ MobyGames URL为空');
    return null;
  }
  
  try {
    console.log(`🔍 获取MobyGames游戏信息: ${url}`);
    
    // 发送HTTP请求，添加头信息模拟真实浏览器
    const response = await superagent
      .get(url)
      .set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
      .set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8')
      .set('Accept-Language', 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7')
      .set('Accept-Encoding', 'gzip, deflate, br')
      .set('DNT', '1')
      .set('Connection', 'keep-alive')
      .set('Upgrade-Insecure-Requests', '1')
      .set('Sec-Fetch-Dest', 'document')
      .set('Sec-Fetch-Mode', 'navigate')
      .set('Sec-Fetch-Site', 'none')
      .set('Cache-Control', 'max-age=0');
    
    if (!response || !response.text) {
      console.log('❌ 请求失败: 没有返回内容');
      return null;
    }
    
    console.log(`✅ HTTP请求成功 (状态码: ${response.status})`);
    
    // 使用cheerio解析HTML
    const $ = cheerio.load(response.text);
    
    // 提取游戏信息
    const meta_info = getMeta($);
    const {publisher, developer} = getPublisher($);
    const grade = $('.mobyscore').text().trim();
    const platforms = getPlatforms($);
    const releaseDate = getReleaseDate($);
    const gameTypes = getGameType($);
    const description = getGameDescription($);
    const officialSite = getAllMetadata($)['Official Site'] || '';
    
    // 构建游戏信息对象
    const gameInfo = {
      name: meta_info.name ? meta_info.name.replace(' - MobyGames', '') : '',
      image: meta_info.image,
      grade: grade,
      publisher: publisher,
      developer: developer,
      platforms: platforms,
      releaseDate: convertToISO8601(releaseDate),
      gameTypes: gameTypes,
      description: description,
      officialSite: officialSite,
      url: url
    };
    
    console.log(`✅ 成功提取游戏信息: ${gameInfo.name}`);
    return gameInfo;
    
  } catch (error) {
    console.error('❌ 获取MobyGames游戏信息失败:', error.message);
    if (error.response) {
      console.error(`   响应状态码: ${error.response.status}`);
    }
    return null;
  }
}

/**
 * 测试函数：用于独立测试模块功能
 * @param {string} testUrl - 测试URL
 */
async function testMobyGames(testUrl = 'https://www.mobygames.com/game/223432/pools/') {
  try {
    console.log('🚀 启动MobyGames模块测试...\n');
    
    const gameInfo = await getGameInfo(testUrl);
    
    if (gameInfo) {
      console.log('\n🎮 游戏信息总结:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📱 游戏名称: ${gameInfo.name}`);
      console.log(`⭐ MobyGames评分: ${gameInfo.grade}`);
      console.log(`🏢 发行商: ${gameInfo.publisher}`);
      console.log(`👨‍💻 开发商: ${gameInfo.developer}`);
      console.log(`🎮 游戏平台: ${gameInfo.platforms.join(', ')}`);
      console.log(`📅 发布日期: ${gameInfo.releaseDate}`);
      console.log(`🎯 游戏类型: ${gameInfo.gameTypes.join(', ')}`);
      console.log(`🌐 官方网站: ${gameInfo.officialSite}`);
      console.log(`📝 游戏描述: ${gameInfo.description.substring(0, 150)}...`);
      console.log(`🖼️  封面图片: ${gameInfo.image}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n✅ 测试完成!');
    } else {
      console.log('❌ 测试失败: 无法获取游戏信息');
    }
    
  } catch (error) {
    console.error('💥 测试过程中发生错误:', error);
  }
}

// 导出模块
module.exports = {
  getGameInfo,
  testMobyGames,
  // 内部函数也导出，供高级用户使用
  getMeta,
  getPublisher,
  getPlatforms,
  getReleaseDate,
  getGameType,
  getGameDescription,
  getAllMetadata
};

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  testMobyGames();
}
