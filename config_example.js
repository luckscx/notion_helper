/**
 * 配置文件模板
 * 复制此文件为 config.js 并填入实际配置值
 */

module.exports = {
  // Notion API 配置
  notion: {
    // Notion 集成令牌 (从 https://www.notion.so/my-integrations 获取)
    token: 'your_notion_integration_token_here',
    
    // Notion API 版本
    version: '2022-06-28',
    
    // 默认数据库 ID (用于各种操作)
    defaultDatabaseId: 'your_default_database_id_here',
    
    // 游戏数据库 ID
    gameDatabaseId: 'your_game_database_id_here',
    
    // 书籍数据库 ID
    bookDatabaseId: 'your_book_database_id_here',
    
    // 电影数据库 ID
    movieDatabaseId: 'your_movie_database_id_here',
    
    // 习惯追踪数据库 ID
    habitDatabaseId: 'your_habit_database_id_here',
    
    // 餐食数据库 ID
    mealDatabaseId: 'your_meal_database_id_here',
    
    // 待办事项数据库 ID
    todoDatabaseId: 'your_todo_database_id_here'
  },

  // IGDB API 配置 (用于游戏信息)
  igdb: {
    // Twitch 开发者客户端 ID
    clientId: 'your_twitch_client_id_here',
    
    // Twitch 开发者客户端密钥
    clientSecret: 'your_twitch_client_secret_here'
  },

  // 代理配置 (可选，用于网络访问)
  proxy: {
    // 启用代理
    enabled: false,
    
    // 代理类型: 'http', 'https', 'socks5'
    type: 'http',
    
    // 代理地址
    host: '127.0.0.1',
    
    // 代理端口
    port: 8080,
    
    // 代理认证 (可选)
    auth: {
      username: '',
      password: ''
    },
    
    // 或者直接使用代理 URL
    url: 'http://127.0.0.1:8080'
  },

  // 应用配置
  app: {
    // 服务器端口
    port: 3000,
    
    // 日志级别: 'debug', 'info', 'warn', 'error'
    logLevel: 'info',
    
    // 请求重试配置
    retry: {
      maxRetries: 3,
      retryDelay: 1000
    },
    
    // 缓存配置
    cache: {
      enabled: true,
      ttl: 3600000 // 1小时，单位毫秒
    }
  },

  // 数据库字段映射配置
  databaseFields: {
    // 游戏数据库字段
    game: {
      title: '游戏名称',
      platform: '平台',
      genre: '类型',
      releaseDate: '发售日期',
      rating: '评分',
      status: '状态'
    },
    
    // 书籍数据库字段
    book: {
      title: '书名',
      author: '作者',
      isbn: 'ISBN',
      status: '状态',
      rating: '评分'
    },
    
    // 电影数据库字段
    movie: {
      title: '电影名',
      director: '导演',
      year: '年份',
      genre: '类型',
      rating: '评分',
      status: '状态'
    }
  },

  // 环境变量配置 (用于 .env 文件)
  env: {
    // 从环境变量读取的配置
    // 这些值会覆盖上面的配置
    NOTION_KEY: process.env.NOTION_KEY,
    DATABASE_ID: process.env.DATABASE_ID,
    IGDB_CLIENT_ID: process.env.IGDB_CLIENT_ID,
    IGDB_CLIENT_SECRET: process.env.IGDB_CLIENT_SECRET
  }
};
