const cheerio = require('cheerio');
const superagent = require('superagent');
const { guessEnglishTitle } = require("./search_game_name");

/**
 * MobyGames游戏信息提取模块
 * 提供API接口供其他模块使用
 */

/**
 * 智能搜索游戏 - 自动判断中英文并返回MobyGames URL
 * @param {string} gameTitle - 游戏标题（支持中文或英文）
 * @returns {Promise<Object>} 搜索结果对象，包含MobyGames URL
 */
async function smartSearchGame(gameTitle, origin_english_name) {
  if (!gameTitle || gameTitle.trim() === '') {
    return {
      success: false,
      message: '游戏标题不能为空',
      inputTitle: gameTitle,
      englishTitle: null,
      mobygamesUrl: null
    };
  }
  
  try {
    console.log(`🚀 开始智能搜索游戏: ${gameTitle} ${origin_english_name}`);
    
    let englishTitle = origin_english_name;
    if (!englishTitle) {
      englishTitle = gameTitle.trim();
    }

    let isChineseInput = false;
    
    // 第一步：判断是否为中文输入
    if (containsChinese(englishTitle)) {
      isChineseInput = true;
      console.log('🔍 检测到中文输入，开始获取英文名称...');
      
      englishTitle  = await guessEnglishTitle(gameTitle);
      
      if (englishTitle) {
        console.log(`✅ 中文转英文成功: ${gameTitle} → ${englishTitle}`);
      } else {
        console.log('⚠️  中文转英文失败，尝试直接使用原标题搜索');
      }
    }

    if (!englishTitle) {
      return {
        success: false,
        message: '搜索名称不能为空',
        inputTitle: gameTitle,
        englishTitle: null,
        mobygamesUrl: null
      };
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
        mobygamesUrl: null
      };
    }
    
    // 获取最佳匹配的URL
    const mobygamesUrl = searchResult.bestMatch.url;
    console.log(`✅ 找到MobyGames链接: ${mobygamesUrl}`);
    
    console.log(`✅ 智能搜索完成! 找到URL: ${mobygamesUrl}`);
    
    // 返回搜索结果，只包含URL相关信息
    return {
      success: true,
      message: '智能搜索成功',
      inputTitle: gameTitle,
      englishTitle: englishTitle,
      isChineseInput: isChineseInput,
      mobygamesUrl: mobygamesUrl,
      searchResults: searchResult.results,
      bestMatch: searchResult.bestMatch
    };
    
  } catch (error) {
    console.error('💥 智能搜索过程中发生错误:', error.message);
    
    return {
      success: false,
      message: `智能搜索错误: ${error.message}`,
      inputTitle: gameTitle,
      englishTitle: null,
      mobygamesUrl: null
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
  // 扩展汉字：\u3400-\u4dbf
  // 注意：某些扩展范围可能在某些JavaScript环境中不支持，所以只使用基本范围
  const chineseRegex = /[\u4e00-\u9fa5\u3400-\u4dbf]/;
  
  return chineseRegex.test(text);
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
      .replace(/,/g, '')                // 去掉逗号
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
    
    // 使用cheerio解析HTML
    const $ = cheerio.load(response.text);
    
    // 提取游戏信息
    const meta_info = getMeta($);
    const {publisher, developer} = getPublisher($);
    let grade = $('.mobyscore').text().trim();
    
    // 处理分数，将"n/a"转换为0
    if (grade === 'n/a' || grade === 'N/A' || grade === 'n/A' || grade === 'N/a') {
      grade = '0';
      console.log(`⚠️  MobyGames返回无效分数"n/a"，转换为0`);
    }
    
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
      mobygamesUrl: url
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
    
    // 处理所有结果，但只保留符合格式的URL
    for (let i = 0; i < gameLinks.length; i++) {
      const link = gameLinks.eq(i);
      const href = link.attr('href');
      const linkText = link.text().trim();
      
      if (href && linkText) {
        // 构建完整的URL
        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `https://www.mobygames.com${href}`;
        }
        
        // 验证URL格式是否符合 game/{numid}/game_name 的要求
        if (isValidGameUrl(fullUrl)) {
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
          
          console.log(`🔍 结果 ${searchResults.length}: ${linkText} (匹配度: ${matchScore})`);
          
          // 限制结果数量为前10个
          if (searchResults.length >= 10) {
            break;
          }
        } else {
          console.log(`⚠️  跳过不符合格式的URL: ${fullUrl}`);
        }
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
 * 验证游戏URL是否符合 game/{numid}/game_name 格式
 * @param {string} url - 要验证的URL
 * @returns {boolean} 是否符合格式要求
 */
function isValidGameUrl(url) {
  try {
    // 解析URL
    const urlObj = new URL(url);
    
    // 检查域名是否为 mobygames.com
    if (!urlObj.hostname.includes('mobygames.com')) {
      return false;
    }
    
    // 检查路径格式
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    
    // 路径必须至少包含3部分: ['game', '{numid}', 'game_name']
    if (pathParts.length < 3) {
      return false;
    }
    
    // 第一部分必须是 'game'
    if (pathParts[0] !== 'game') {
      return false;
    }
    
    // 第二部分必须是数字ID
    if (!/^\d+$/.test(pathParts[1])) {
      return false;
    }
    
    // 第三部分必须存在且不为空
    if (!pathParts[2] || pathParts[2].trim() === '') {
      return false;
    }
    
    return true;
  } catch (error) {
    // URL解析失败，返回false
    return false;
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

// 更新导出模块
module.exports = {
  smartSearchGame,
  searchGameByTitle,
  getGameInfo,
  getMeta,
  getPublisher,
  getPlatforms,
  getReleaseDate,
  getGameType,
  getGameDescription,
  getAllMetadata,
  calculateMatchScore,
  isValidGameUrl,
  containsChinese          // 新增：中文字符检测函数
};

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  // 测试智能搜索功能
  testSmartSearch('女鬼桥一开魂路');
}