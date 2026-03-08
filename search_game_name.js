const superagent = require('superagent');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('./config');

// 构建代理 agent（复用 config.proxy 配置）
let proxyAgent = null;
if (config.proxy?.enabled && config.proxy?.url) {
  const proxyUrl = config.proxy.url;
  proxyAgent = proxyUrl.startsWith('socks')
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);
}

// 从配置文件获取IGDB API凭据
const clientId = config.igdb.clientId;
const clientSecret = config.igdb.clientSecret;

// 从配置文件获取RAWG API凭据
const rawgApiKey = config.rawg?.apiKey;

/**
 * 令牌管理类
 */
class TokenManager {
  constructor() {
    this.tokenFile = path.join(__dirname, '.igdb_token_cache.json');
    this.token = null;
    this.expiresAt = null;
  }

  /**
   * 从本地文件加载令牌
   */
  loadTokenFromFile() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const tokenData = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        const now = Date.now();
        
        // 检查令牌是否还有效（提前5分钟过期）
        if (tokenData.expires_at > now + 5 * 60 * 1000) {
          this.token = tokenData.access_token;
          this.expiresAt = tokenData.expires_at;
          console.log('📁 从本地缓存加载有效令牌');
          return true;
        } else {
          console.log('📁 本地令牌已过期，需要重新获取');
        }
      }
    } catch (error) {
      console.log('📁 读取本地令牌缓存失败:', error.message);
    }
    return false;
  }

  /**
   * 将令牌保存到本地文件
   */
  saveTokenToFile(accessToken, expiresIn) {
    try {
      const tokenData = {
        access_token: accessToken,
        expires_at: Date.now() + (expiresIn * 1000),
        created_at: Date.now()
      };
      
      fs.writeFileSync(this.tokenFile, JSON.stringify(tokenData, null, 2));
      console.log('💾 令牌已保存到本地缓存');
    } catch (error) {
      console.log('💾 保存令牌到本地缓存失败:', error.message);
    }
  }

  /**
   * 获取有效的访问令牌
   */
  async getValidToken() {
    // 首先尝试从本地加载
    if (this.loadTokenFromFile()) {
      return this.token;
    }

    // 本地没有有效令牌，重新获取
    console.log('📡 获取新的访问令牌...');
    const authUrl = 'https://id.twitch.tv/oauth2/token';
    const authParams = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    };

    try {
      const authResponse = await superagent
        .post(authUrl)
        .agent(proxyAgent)
        .query(authParams);

      const accessToken = authResponse.body.access_token;
      const expiresIn = authResponse.body.expires_in || 3600; // 默认1小时

      // 保存到本地缓存
      this.saveTokenToFile(accessToken, expiresIn);
      
      this.token = accessToken;
      this.expiresAt = Date.now() + (expiresIn * 1000);
      
      console.log('✅ 新访问令牌获取成功');
      return accessToken;
    } catch (error) {
      console.error('❌ 获取访问令牌失败:', error.message);
      throw error;
    }
  }

  /**
   * 清理过期的令牌缓存
   */
  cleanupExpiredToken() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const tokenData = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        if (tokenData.expires_at < Date.now()) {
          fs.unlinkSync(this.tokenFile);
          console.log('🧹 已清理过期的令牌缓存');
        }
      }
    } catch (error) {
      // 忽略清理错误
    }
  }
}

// 创建全局令牌管理器实例
const tokenManager = new TokenManager();

/**
 * 根据中文游戏名获取英文名
 * @param {string} chineseName - 中文游戏名
 * @returns {Promise<string|null>} 英文游戏名或null
 */
async function getGameEnglishName(chineseName) {
  try {
    console.log(`🔍 开始搜索中文游戏: ${chineseName}`);
    
    // 获取有效的访问令牌
    const accessToken = await tokenManager.getValidToken();
    
    // 搜索游戏
    const apiUrl = 'https://api.igdb.com/v4/games';
    const headers = {
      'Client-ID': clientId,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    
    // 使用中文名搜索
    const query = `search "${chineseName}"; fields name,alternative_names; where version_parent = null;`;
    
    console.log('🔍 搜索游戏信息...');
    const response = await superagent
      .post(apiUrl)
      .agent(proxyAgent)
      .set(headers)
      .send(query);
    
    if (response.status === 200) {
      const games = response.body;
      console.log(`✅ 找到 ${games.length} 个游戏结果`);
      
      if (games && games.length > 0) {
        const firstGame = games[0];
        console.log(firstGame);
        console.log(`🎮 第一个结果: ${firstGame.name}`);
        
        // 返回第一个结果的英文名
        return firstGame.name;
      } else {
        console.log('❌ 未找到匹配的游戏');
        return null;
      }
    } else {
      console.log(`❌ API请求失败，状态码: ${response.status}`);
      return null;
    }
    
  } catch (error) {
    console.error('💥 获取游戏英文名时发生错误:', error.message);
    
    if (error.response) {
      console.error(`   响应状态码: ${error.response.status}`);
      console.error(`   响应内容: ${error.response.text}`);
    }
    
    return null;
  }
}

/**
 * 主函数 - 搜索单个游戏
 */
async function main() {
  const chineseName = process.argv[2] || '巫师3：狂猎';
  
  if (process.argv.length < 3) {
    console.log('🎮 使用方法: node search_game_name.js "游戏中文名"');
    console.log('🎮 示例: node search_game_name.js "巫师3：狂猎"');
    console.log('');
  }
  
  // 启动时清理过期令牌
  tokenManager.cleanupExpiredToken();
  
  console.log(`🎮 搜索游戏: ${chineseName}`);
  const englishName = await getGameEnglishName(chineseName);
  
  if (englishName) {
    console.log(`\n🎉 搜索结果:`);
    console.log(`   中文名: ${chineseName}`);
    console.log(`   英文名: ${englishName}`);
  } else {
    console.log(`\n❌ 未找到 ${chineseName} 的英文名`);
  }
}

// 如果直接运行此文件，则执行主函数
if (require.main === module) {
  main().catch(console.error);
}

function normalizeZh(name) {
  if (!name) return "";
  let n = name.trim();
  const brackets = ["（", "）", "(", ")", "【", "】", "[", "]", "「", "」", "『", "』"];
  for (const ch of brackets) n = n.replaceAll(ch, " ");
  const suffix = ["豪华版", "完全版", "典藏版", "国服", "国际服", "重制版", "复刻", "年度版", "完整版"];
  for (const s of suffix) n = n.replaceAll(s, "");
  // 合并多空格
  n = n.replace(/\s+/g, " ").trim();
  return n;
}


/**
 * Steam：中文关键词搜索拿 appid，再用 l=en 拉英文名，仅取 type=game
 */
async function steamEnTitle(zhName) {
  if (!zhName) return [];
  
  console.log(`🔍 Steam搜索中文游戏: ${zhName}`);
  
  const searchUrl = "https://store.steampowered.com/api/storesearch?cc=CN&l=schinese&term=" + encodeURIComponent(zhName);
  try {
    const response = await superagent
      .get(searchUrl)
      .agent(proxyAgent)
      .timeout(15000);
    
    const sr = response.body;
    const items = sr?.items || [];
    const appids = items.slice(0, 5).map((it) => it?.id).filter(Boolean);
    const detailRequests = appids.map(async (appid) => {
      const dUrl = "https://store.steampowered.com/api/appdetails?l=en&appids=" + encodeURIComponent(String(appid));
      try {
        const detailResponse = await superagent.get(dUrl).agent(proxyAgent).timeout(15000);
        const jd = detailResponse.body?.[String(appid)] || {};
        if (jd.success && jd.data && jd.data.type === "game" && jd.data.name) {
          return { title: jd.data.name, source: "steam", appid, confidence: 0.90 };
        }
      } catch {
        // 忽略单个 appid 错误
      }
      return null;
    });
    const settled = await Promise.all(detailRequests);
    const results = settled.filter(Boolean);
    
    if (results.length > 0) {
      console.log(`✅ Steam找到 ${results.length} 个结果`);
    } else {
      console.log(`❌ Steam未找到匹配结果`);
    }
    
    return results;
  } catch (e) {
    console.error('💥 Steam搜索失败:', e.message);
    return [];
  }
}


function dedupeAndRank(candidates) {
  const tally = new Map();
  for (const c of candidates) {
    const key = (c.title || "").trim();
    if (!key) continue;
    if (!tally.has(key)) {
      tally.set(key, { title: key, sources: new Set(), score: 0 });
    }
    const v = tally.get(key);
    v.sources.add(c.source);
    v.score += c.confidence ?? 0.5;
  }
  const out = [];
  for (const v of tally.values()) {
    const bonus = 0.2 * (v.sources.size - 1); // 多源加分
    out.push({ title: v.title, sources: Array.from(v.sources), score: +(v.score + bonus).toFixed(3) });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

async function guessEnglishTitle(zhName) {
  const q = normalizeZh(zhName);
  const candidates = [];
  const p = [];
  
  // 三个渠道都并发请求
  p.push(steamEnTitle(q));
  p.push(igdbEnTitle(q));
  if (rawgApiKey) p.push(rawgEnTitle(q));

  console.log(`\n🔍 开始搜索: ${zhName}`);
  console.log(`📡 并发请求 ${p.length} 个数据源...`);

  const results = await Promise.allSettled(p);
  
  // 收集所有结果
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      candidates.push(...r.value);
    }
  }

  // 去重和排序
  const rankedResults = dedupeAndRank(candidates);
  
  // 打印所有可能性
  console.log(`\n📊 搜索结果汇总:`);
  if (rankedResults.length > 0) {
    rankedResults.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.title} (${item.sources.join(', ')}) - 置信度: ${item.score}`);
    });
    
    // 返回最高置信度的结果
    const bestResult = rankedResults[0];
    console.log(`\n🏆 最佳匹配: ${bestResult.title} (置信度: ${bestResult.score})`);
    return bestResult.title;
  } else {
    console.log(`\n❌ 未找到任何匹配结果`);
    console.log(`🔄 返回原始中文名: ${zhName}`);
    return zhName;
  }
}

/**
 * IGDB：使用中文名搜索获取英文游戏名
 * @param {string} zhName - 中文游戏名
 * @returns {Promise<Array>} 游戏候选列表
 */
async function igdbEnTitle(zhName) {
  if (!zhName) return [];
  
  try {
    console.log(`🔍 IGDB搜索中文游戏: ${zhName}`);
    
    // 获取有效的访问令牌
    const accessToken = await tokenManager.getValidToken();
    
    // 搜索游戏
    const apiUrl = 'https://api.igdb.com/v4/games';
    const headers = {
      'Client-ID': clientId,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
    
    // 使用中文名搜索
    const query = `search "${zhName}"; fields name,alternative_names; where version_parent = null;`;
    
    const response = await superagent
      .post(apiUrl)
      .agent(proxyAgent)
      .set(headers)
      .send(query);

    if (response.status === 200) {
      const games = response.body;

      if (games && games.length > 0) {
        const results = [];
        for (const game of games.slice(0, 3)) { // 取前3个结果
          if (game.name) {
            results.push({
              title: game.name,
              source: "igdb",
              confidence: 0.85
            });
          }
        }
        return results;
      }
    }
    
    return [];
    
  } catch (error) {
    console.error('💥 IGDB搜索失败:', error.message);
    return [];
  }
}

/**
 * RAWG：使用中文名搜索获取英文游戏名
 * @param {string} zhName - 中文游戏名
 * @returns {Promise<Array>} 游戏候选列表
 */
async function rawgEnTitle(zhName) {
  if (!zhName || !rawgApiKey) return [];
  
  try {
    console.log(`🔍 RAWG搜索中文游戏: ${zhName}`);
    
    // 构建搜索URL
    const searchUrl = `https://api.rawg.io/api/games?key=${rawgApiKey}&search=${encodeURIComponent(zhName)}&page_size=5`;
    
    const response = await superagent
      .get(searchUrl)
      .agent(proxyAgent)
      .timeout(15000);
    if (data && data.results && data.results.length > 0) {
      const results = [];
              for (const game of data.results.slice(0, 3)) { // 取前3个结果
        if (game.name) {
          results.push({
            title: game.name,
            source: "rawg",
            confidence: 0.80
          });
        }
      }
      return results;
    }
    
    return [];
    
  } catch (error) {
    console.error('💥 RAWG搜索失败:', error.message);
    return [];
  }
}

// 示例
async function main() {
  const tests = [
    "塞尔达传说 - 智慧的再现",
    "小小梦魇",
  ];
  
  console.log('🎮 测试多源英文标题猜测功能...\n');
  
  for (const t of tests) {
    const result = await guessEnglishTitle(t);
    console.log(`\n${'='.repeat(50)}`);
  }
}

// 导出函数供其他模块使用
module.exports = {
  guessEnglishTitle
};