#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * 初始化脚本
 * 用于创建配置文件并引导用户填写配置
 */

class ConfigInitializer {
  constructor() {
    this.configExamplePath = path.join(__dirname, 'config_example.js');
    this.configPath = path.join(__dirname, 'config.js');
    this.envPath = path.join(__dirname, '.env');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 运行初始化流程
   */
  async run() {
    console.log('🚀 欢迎使用 Notion Helper 配置初始化工具！\n');
    
    try {
      // 检查配置文件是否已存在
      if (fs.existsSync(this.configPath)) {
        const answer = await this.question('⚠️  配置文件 config.js 已存在，是否要覆盖？(y/N): ');
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('❌ 初始化已取消');
          this.rl.close();
          return;
        }
      }

      // 复制配置模板
      await this.copyConfigTemplate();
      
      // 引导用户填写配置
      await this.guideUserConfiguration();
      
      // 创建环境变量文件
      await this.createEnvFile();
      
      console.log('\n✅ 配置初始化完成！');
      console.log('📝 请检查 config.js 文件并填入正确的配置值');
      console.log('🔑 敏感信息建议使用 .env 文件存储');
      
    } catch (error) {
      console.error('❌ 初始化失败:', error.message);
    } finally {
      this.rl.close();
    }
  }

  /**
   * 复制配置模板
   */
  async copyConfigTemplate() {
    if (!fs.existsSync(this.configExamplePath)) {
      throw new Error('配置模板文件 config_example.js 不存在');
    }

    const templateContent = fs.readFileSync(this.configExamplePath, 'utf8');
    fs.writeFileSync(this.configPath, templateContent);
    console.log('📋 已复制配置模板到 config.js');
  }

  /**
   * 引导用户填写配置
   */
  async guideUserConfiguration() {
    console.log('\n📝 现在让我们填写一些基本配置：\n');
    
    // Notion 配置
    console.log('🔑 Notion 配置:');
    const notionToken = await this.question('请输入您的 Notion 集成令牌 (从 https://www.notion.so/my-integrations 获取): ');
    const defaultDbId = await this.question('请输入默认数据库 ID: ');
    
    // IGDB 配置
    console.log('\n🎮 IGDB API 配置:');
    const igdbClientId = await this.question('请输入 Twitch 开发者客户端 ID: ');
    const igdbClientSecret = await this.question('请输入 Twitch 开发者客户端密钥: ');
    
    // 代理配置
    console.log('\n🌐 代理配置 (可选):');
    const useProxy = await this.question('是否使用代理？(y/N): ');
    
    let proxyConfig = 'enabled: false';
    if (useProxy.toLowerCase() === 'y' || useProxy.toLowerCase() === 'yes') {
      const proxyType = await this.question('代理类型 (http/https/socks5): ');
      const proxyHost = await this.question('代理地址: ');
      const proxyPort = await this.question('代理端口: ');
      
      proxyConfig = `enabled: true,
    type: '${proxyType}',
    host: '${proxyHost}',
    port: ${proxyPort}`;
    }
    
    // 更新配置文件
    await this.updateConfigFile({
      notionToken,
      defaultDbId,
      igdbClientId,
      igdbClientSecret,
      proxyConfig
    });
  }

  /**
   * 更新配置文件
   */
  async updateConfigFile(config) {
    let content = fs.readFileSync(this.configPath, 'utf8');
    
    // 替换 Notion 配置
    content = content.replace(
      /token: 'your_notion_integration_token_here'/,
      `token: '${config.notionToken}'`
    );
    
    content = content.replace(
      /defaultDatabaseId: 'your_default_database_id_here'/,
      `defaultDatabaseId: '${config.defaultDbId}'`
    );
    
    // 替换 IGDB 配置
    content = content.replace(
      /clientId: 'your_twitch_client_id_here'/,
      `clientId: '${config.igdbClientId}'`
    );
    
    content = content.replace(
      /clientSecret: 'your_twitch_client_secret_here'/,
      `clientSecret: '${config.igdbClientSecret}'`
    );
    
    // 替换代理配置
    const proxyRegex = /enabled: false,\s*type: 'http',\s*host: '127\.0\.0\.1',\s*port: 8080/;
    content = content.replace(proxyRegex, config.proxyConfig);
    
    fs.writeFileSync(this.configPath, content);
    console.log('💾 配置文件已更新');
  }

  /**
   * 创建环境变量文件
   */
  async createEnvFile() {
    const envContent = `# Notion Helper 环境变量配置
# 复制此文件为 .env 并填入实际值

# Notion API 配置
NOTION_KEY=your_notion_integration_token_here
DATABASE_ID=your_default_database_id_here

# IGDB API 配置
IGDB_CLIENT_ID=your_twitch_client_id_here
IGDB_CLIENT_SECRET=your_twitch_client_secret_here

# 代理配置 (可选)
# HTTP_PROXY=http://127.0.0.1:8080
# HTTPS_PROXY=http://127.0.0.1:8080
`;
    
    fs.writeFileSync(this.envPath, envContent);
    console.log('📄 已创建 .env 环境变量文件模板');
  }

  /**
   * 用户输入提示
   */
  question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }
}

// 运行初始化
if (require.main === module) {
  const initializer = new ConfigInitializer();
  initializer.run();
}

module.exports = ConfigInitializer;
