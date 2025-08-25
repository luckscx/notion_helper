const superagent = require('superagent');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// 从配置文件获取IGDB API凭据
const clientId = config.igdb.clientId;
const clientSecret = config.igdb.clientSecret;

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
 * 测试函数
 */
async function testGameSearch() {
  const testGames = [
    '巫师3：狂猎',
    '艾尔登法环',
    '赛博朋克2077',
    '只狼：影逝二度'
  ];
  
  console.log('🎮 开始测试IGDB游戏搜索功能...\n');
  
  for (const chineseName of testGames) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔍 搜索: ${chineseName}`);
    
    const englishName = await getGameEnglishName(chineseName);
    
    if (englishName) {
      console.log(`✅ 中文名: ${chineseName}`);
      console.log(`🎮 英文名: ${englishName}`);
    } else {
      console.log(`❌ 未找到 ${chineseName} 的英文名`);
    }
    
    console.log(''); // 空行分隔
  }
  
  console.log('🎮 测试完成!');
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

// 导出函数供其他模块使用
module.exports = {
  getGameEnglishName,
  testGameSearch,
  TokenManager
};