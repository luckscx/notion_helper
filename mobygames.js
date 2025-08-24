const cheerio = require('cheerio');
const superagent = require('superagent');
const { getGameEnglishName } = require("./search_game_name");

/**
 * MobyGames游戏信息提取模块
 * 提供API接口供其他模块使用
 */

// ... existing code ...

/**
 * 智能搜索游戏 - 自动判断中英文并获取完整游戏信息
 * @param {string} gameTitle - 游戏标题（支持中文或英文）
 * @returns {Promise<Object>} 游戏信息对象
 */
async function smartSearchGame(gameTitle) {
  if (!gameTitle || gameTitle.trim() === '') {
    return {
      success: false,
      message: '游戏标题不能为空',
      inputTitle: gameTitle,
      englishTitle: null,
      mobygamesUrl: null,
      gameInfo: null
    };
  }
  
  try {
    console.log(`🚀 开始智能搜索游戏: ${gameTitle}`);
    
    let englishTitle = gameTitle.trim();
    let isChineseInput = false;
    
    // 第一步：判断是否为中文输入
    if (containsChinese(gameTitle)) {
      isChineseInput = true;
      console.log('🔍 检测到中文输入，开始获取英文名称...');
      
      englishTitle  = await getGameEnglishName(gameTitle);
      
      if (englishTitle) {
        console.log(`✅ 中文转英文成功: ${gameTitle} → ${englishTitle}`);
      } else {
        console.log('⚠️  中文转英文失败，尝试直接使用原标题搜索');
        // 如果中文转英文失败，继续使用原标题
      }
    } else {
      console.log('检测到英文输入，直接进行搜索');
    }
    
    // 第二步：使用英文标题搜索MobyGames
    console.log(`🔍 搜索MobyGames: ${englishTitle}`);
    const searchResult = await searchGameByTitle(englishTitle);
    
    if (!searchResult.success) {
      return {
        success: false,
        message: `MobyGames搜索失败: ${searchResult.message}`,
        inputTitle: gameTitle,
        englishTitle: englishTitle,
        mobygamesUrl: null,
        gameInfo: null
      };
    }
    
    // 获取最佳匹配的URL
    const mobygamesUrl = searchResult.bestMatch.url;
    console.log(`✅ 找到MobyGames链接: ${mobygamesUrl}`);
    
    // 第三步：获取游戏详细信息
    console.log('�� 获取游戏详细信息...');
    const gameInfo = await getGameInfo(mobygamesUrl);
    
    if (!gameInfo) {
      return {
        success: false,
        message: '获取游戏详细信息失败',
        inputTitle: gameTitle,
        englishTitle: englishTitle,
        mobygamesUrl: mobygamesUrl,
        gameInfo: null
      };
    }
    
    console.log(`�� 智能搜索完成! 游戏: ${gameInfo.name}`);
    
    // 返回完整的搜索结果
    return {
      success: true,
      message: '智能搜索成功',
      inputTitle: gameTitle,
      englishTitle: englishTitle,
      isChineseInput: isChineseInput,
      mobygamesUrl: mobygamesUrl,
      searchResults: searchResult.results,
      bestMatch: searchResult.bestMatch,
      gameInfo: gameInfo
    };
    
  } catch (error) {
    console.error('💥 智能搜索过程中发生错误:', error.message);
    
    return {
      success: false,
      message: `智能搜索错误: ${error.message}`,
      inputTitle: gameTitle,
      englishTitle: null,
      mobygamesUrl: null,
      gameInfo: null
    };
  }
}

/**
 * 判断字符串是否包含中文字符
 * @param {string} text - 要检查的文本
 * @returns {boolean} 是否包含中文
 */
function containsChinese(text) {
  if (!text) return false;
  
  // 使用Unicode范围检测中文字符
  // 基本汉字：\u4e00-\u9fa5
  // 扩展汉字：\u3400-\u4dbf, \u20000-\u2a6df, \u2a700-\u2b73f, \u2b740-\u2b81f, \u2b820-\u2ceaf
  const chineseRegex = /[\u4e00-\u9fa5\u3400-\u4dbf\u20000-\u2a6df\u2a700-\u2b73f\u2b740-\u2b81f\u2b820-\u2ceaf]/;
  
  return chineseRegex.test(text);
}

/**
 * 测试智能搜索功能
 * @param {string} testTitle - 测试游戏标题
 */
async function testSmartSearch(testTitle = '寂静岭2') {
  try {
    console.log('🚀 测试智能搜索功能...\n');
    
    const smartResult = await smartSearchGame(testTitle);
    
    if (smartResult.success) {
      console.log('\n🎉 智能搜索成功!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🔍 输入标题: ${smartResult.inputTitle}`);
      console.log(`🌍 英文标题: ${smartResult.englishTitle}`);
      console.log(`🔗 MobyGames链接: ${smartResult.mobygamesUrl}`);
      console.log(`📊 搜索结果数量: ${smartResult.searchResults.length}`);
      console.log(`🏆 最佳匹配度: ${smartResult.bestMatch.matchScore}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 显示游戏详细信息
      if (smartResult.gameInfo) {
        console.log('\n�� 游戏详细信息:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📱 游戏名称: ${smartResult.gameInfo.name}`);
        console.log(`⭐ MobyGames评分: ${smartResult.gameInfo.grade}`);
        console.log(`�� 发行商: ${smartResult.gameInfo.publisher}`);
        console.log(`👨‍�� 开发商: ${smartResult.gameInfo.developer}`);
        console.log(`🎮 游戏平台: ${smartResult.gameInfo.platforms.join(', ')}`);
        console.log(`📅 发布日期: ${smartResult.gameInfo.releaseDate}`);
        console.log(`🎯 游戏类型: ${smartResult.gameInfo.gameTypes.join(', ')}`);
        console.log(`🌐 官方网站: ${smartResult.gameInfo.officialSite}`);
        console.log(`📝 游戏描述: ${smartResult.gameInfo.description.substring(0, 150)}...`);
        console.log(`🖼️  封面图片: ${smartResult.gameInfo.image}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      }
      
    } else {
      console.log('\n❌ 智能搜索失败:', smartResult.message);
      console.log(`   输入标题: ${smartResult.inputTitle}`);
      if (smartResult.englishTitle) {
        console.log(`   英文标题: ${smartResult.englishTitle}`);
      }
      if (smartResult.mobygamesUrl) {
        console.log(`   MobyGames链接: ${smartResult.mobygamesUrl}`);
      }
    }
    
  } catch (error) {
    console.error('�� 测试过程中发生错误:', error);
  }
}


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
      .replace(/Co\./gi, '')           // 去掉 "Co."
      .replace(/Ltd\./gi, '')          // 去掉 "Ltd."
      .replace(/Inc\./gi, '')          // 去掉 "Inc."
      .replace(/LLC/gi, '')            // 去掉 "LLC"
      .replace(/Corp\./gi, '')         // 去掉 "Corp."
      .replace(/Limited/gi, '')        // 去掉 "Limited"
      .replace(/Corporation/gi, '')    // 去掉 "Corporation"
      .replace(/Company/gi, '')        // 去掉 "Company"
      .replace(/Entertainment/gi, '')  // 去掉 "Entertainment"
      .replace(/Digital/gi, '')        // 去掉 "Digital"
      .replace(/Interactive/gi, '')    // 去掉 "Interactive"
      .replace(/Technology/gi, '')    // 去掉 "Technologies"
      .replace(/Studios/gi, '')        // 去掉 "Studios"
      .replace(/Team/gi, '')           // 去掉 "Team"
      .replace(/SA/gi, '')             // 去掉 "SA"
      .replace(/GmbH/gi, '')           // 去掉 "GmbH"
      .replace(/AB/gi, '')             // 去掉 "AB"
      .replace(/Oy/gi, '')             // 去掉 "Oy"
      .replace(/BV/gi, '')             // 去掉 "BV"
      .replace(/S\.A\./gi, '')         // 去掉 "S.A."
      .replace(/S\.p\.A\./gi, '')      // 去掉 "S.p.A."
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

/**
 * 搜索游戏并返回匹配的链接
 * @param {string} gameTitle - 游戏标题
 * @returns {Promise<Object>} 搜索结果对象
 */
async function searchGameByTitle(gameTitle) {
  if (!gameTitle || gameTitle.trim() === '') {
    return {
      success: false,
      message: '游戏标题不能为空',
      gameTitle: gameTitle,
      results: [],
      bestMatch: null
    };
  }
  
  try {
    console.log(`🔍 开始搜索游戏: ${gameTitle}`);
    
    // 构建搜索URL
    const searchQuery = encodeURIComponent(gameTitle.trim());
    const searchUrl = `https://www.mobygames.com/search/?q=${searchQuery}`;
    
    console.log(`📡 访问搜索页面: ${searchUrl}`);
    
    // 发送HTTP请求
    const response = await superagent
      .get(searchUrl)
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
      return {
        success: false,
        message: '搜索请求失败',
        gameTitle: gameTitle,
        results: [],
        bestMatch: null
      };
    }
    
    console.log(`✅ 搜索页面获取成功 (状态码: ${response.status})`);
    
    // 使用cheerio解析HTML
    const $ = cheerio.load(response.text);
    
    // 查找搜索结果
    const searchResults = [];
    let bestMatch = null;
    
    // 查找游戏链接 - 尝试多种选择器
    const gameLinks = $('a[href*="/game/"], .search-result a[href*="/game/"], .game-item a[href*="/game/"]');
    
    console.log(`🔍 找到 ${gameLinks.length} 个游戏链接`);
    
    // 处理前10个结果
    const maxResults = Math.min(gameLinks.length, 10);
    
    for (let i = 0; i < maxResults; i++) {
      const link = gameLinks.eq(i);
      const href = link.attr('href');
      const linkText = link.text().trim();
      
      if (href && linkText) {
        // 构建完整的URL
        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `https://www.mobygames.com${href}`;
        }
        
        // 计算匹配度
        const matchScore = calculateMatchScore(gameTitle, linkText);
        
        const result = {
          title: linkText,
          url: fullUrl,
          matchScore: matchScore
        };
        
        searchResults.push(result);
        
        // 更新最佳匹配
        if (!bestMatch || matchScore > bestMatch.matchScore) {
          bestMatch = result;
        }
        
        console.log(`🔍 结果 ${i + 1}: ${linkText} (匹配度: ${matchScore})`);
      }
    }
    
    // 按匹配度排序
    searchResults.sort((a, b) => b.matchScore - a.matchScore);
    
    if (searchResults.length > 0) {
      console.log(`✅ 搜索完成，找到 ${searchResults.length} 个结果`);
      console.log(`🏆 最佳匹配: ${bestMatch.title} (匹配度: ${bestMatch.matchScore})`);
      
      return {
        success: true,
        message: `找到 ${searchResults.length} 个搜索结果`,
        gameTitle: gameTitle,
        results: searchResults,
        bestMatch: bestMatch
      };
    } else {
      console.log('❌ 未找到任何游戏结果');
      return {
        success: false,
        message: '未找到任何游戏结果',
        gameTitle: gameTitle,
        results: [],
        bestMatch: null
      };
    }
    
  } catch (error) {
    console.error('❌ 搜索游戏时发生错误:', error.message);
    
    if (error.response) {
      console.error(`   响应状态码: ${error.response.status}`);
    }
    
    return {
      success: false,
      message: `搜索错误: ${error.message}`,
      gameTitle: gameTitle,
      results: [],
      bestMatch: null
    };
  }
}

/**
 * 计算游戏标题的匹配度
 * @param {string} searchTitle - 搜索标题
 * @param {string} resultTitle - 结果标题
 * @returns {number} 匹配度分数 (0-100)
 */
function calculateMatchScore(searchTitle, resultTitle) {
  if (!searchTitle || !resultTitle) return 0;
  
  const search = searchTitle.toLowerCase().trim();
  const result = resultTitle.toLowerCase().trim();
  
  // 完全匹配
  if (search === result) return 100;
  
  // 包含匹配
  if (result.includes(search)) return 90;
  if (search.includes(result)) return 85;
  
  // 单词匹配
  const searchWords = search.split(/\s+/).filter(word => word.length > 2);
  const resultWords = result.split(/\s+/).filter(word => word.length > 2);
  
  let wordMatchCount = 0;
  let totalWords = Math.max(searchWords.length, resultWords.length);
  
  for (const searchWord of searchWords) {
    if (resultWords.some(resultWord => 
      resultWord.includes(searchWord) || searchWord.includes(resultWord)
    )) {
      wordMatchCount++;
    }
  }
  
  if (totalWords > 0) {
    const wordScore = (wordMatchCount / totalWords) * 70;
    
    // 长度相似度
    const lengthDiff = Math.abs(search.length - result.length);
    const maxLength = Math.max(search.length, result.length);
    const lengthScore = Math.max(0, 30 - (lengthDiff / maxLength) * 30);
    
    return Math.round(wordScore + lengthScore);
  }
  
  return 0;
}

/**
 * 测试搜索功能
 * @param {string} testTitle - 测试游戏标题
 */
async function testSearchFunction(testTitle = 'Metal Gear') {
  try {
    console.log('🚀 测试游戏搜索功能...\n');
    
    const searchResult = await searchGameByTitle(testTitle);
    
    if (searchResult.success) {
      console.log('\n🎉 搜索成功!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`🔍 搜索标题: ${searchResult.gameTitle}`);
      console.log(`📊 结果数量: ${searchResult.results.length}`);
      console.log(`🏆 最佳匹配: ${searchResult.bestMatch.title}`);
      console.log(`🔗 最佳匹配链接: ${searchResult.bestMatch.url}`);
      console.log(`⭐ 匹配度: ${searchResult.bestMatch.matchScore}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      console.log('\n📋 所有结果:');
      searchResult.results.slice(0, 5).forEach((result, index) => {
        console.log(`${index + 1}. ${result.title} (匹配度: ${result.matchScore})`);
        console.log(`   ${result.url}`);
      });
      
      if (searchResult.results.length > 5) {
        console.log(`   ... 还有 ${searchResult.results.length - 5} 个结果`);
      }
    } else {
      console.log('\n❌ 搜索失败:', searchResult.message);
    }
    
  } catch (error) {
    console.error('💥 测试过程中发生错误:', error);
  }
}

/**
 * 批量测试智能搜索功能
 */
async function testSmartSearchBatch() {
  const testGames = [
    '寂静岭2',           // 中文
    'Metal Gear',       // 英文
    '艾尔登法环',        // 中文
    'Final Fantasy',    // 英文
    '赛博朋克2077'       // 中文
  ];
  
  console.log('🚀 开始批量测试智能搜索功能...\n');
  
  for (let i = 0; i < testGames.length; i++) {
    const gameTitle = testGames[i];
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`�� 测试 ${i + 1}/${testGames.length}: ${gameTitle}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    const result = await smartSearchGame(gameTitle);
    
    if (result.success) {
      console.log(`✅ 成功: ${result.gameInfo.name}`);
      console.log(`   英文名: ${result.englishTitle}`);
      console.log(`   平台: ${result.gameInfo.platforms.join(', ')}`);
    } else {
      console.log(`❌ 失败: ${result.message}`);
    }
    
    // 添加延迟避免请求过快
    if (i < testGames.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n🎉 批量测试完成!');
}

// 更新导出模块
module.exports = {
  getGameInfo,
  testMobyGames,
  searchGameByTitle,
  testSearchFunction,
  smartSearchGame,        // 新增：智能搜索接口
  testSmartSearch,        // 新增：测试智能搜索
  testSmartSearchBatch,   // 新增：批量测试智能搜索
  // 内部函数也导出，供高级用户使用
  getMeta,
  getPublisher,
  getPlatforms,
  getReleaseDate,
  getGameType,
  getGameDescription,
  getAllMetadata,
  calculateMatchScore,
  containsChinese          // 新增：中文字符检测函数
};

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  // 测试智能搜索功能
  testSmartSearch('寂静岭2');
}