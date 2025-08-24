const https = require('https');
const { URL } = require('url');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');

/**
 * Notion API 客户端类
 * 支持代理配置，使用基础HTTP/HTTPS访问api.notion.com
 */
class NotionAPI {
  constructor(options = {}) {
    this.token = options.token;
    this.version = options.version || '2022-06-28';
    this.baseURL = 'https://api.notion.com';
    
    // 代理配置
    this.proxy = options.proxy;
    this.proxyAgent = null;
    
    // 创建代理代理
    if (this.proxy) {
      this.proxyAgent = this.createProxyAgent(this.proxy);
    }
    
    // 默认请求头
    this.defaultHeaders = {
      'Authorization': `Bearer ${this.token}`,
      'Notion-Version': this.version,
      'Content-Type': 'application/json',
      'User-Agent': 'NotionAPI/1.0.0'
    };
  }

  /**
   * 创建代理代理
   * @param {string|object} proxy - 代理配置
   * @returns {object} 代理代理对象
   */
  createProxyAgent(proxy) {
    try {
      if (typeof proxy === 'string') {
        const url = new URL(proxy);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          return new HttpsProxyAgent(proxy);
        } else if (url.protocol === 'socks5:') {
          return new SocksProxyAgent(proxy);
        }
      } else if (proxy.host && proxy.port) {
        const proxyUrl = `http://${proxy.host}:${proxy.port}`;
        return new HttpsProxyAgent(proxyUrl);
      }
      
      throw new Error('不支持的代理类型');
    } catch (error) {
      console.warn(`代理创建失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 发送HTTP请求（带重试机制）
   * @param {string} method - HTTP方法
   * @param {string} endpoint - API端点
   * @param {object} data - 请求数据
   * @param {object} options - 额外选项
   * @returns {Promise} 响应Promise
   */
  async request(method, endpoint, data = null, options = {}) {
    const maxRetries = options.maxRetries || 3;
    const retryDelay = options.retryDelay || 1000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._makeRequest(method, endpoint, data, options);
        return result;
      } catch (error) {
        // 如果是最后一次尝试，直接抛出错误
        if (attempt === maxRetries) {
          throw error;
        }
        
        // 检查是否应该重试
        if (this._shouldRetry(error)) {
          console.log(`⚠️ 请求失败，${retryDelay}ms 后重试 (${attempt}/${maxRetries}): ${error.message}`);
          await this._sleep(retryDelay);
          continue;
        } else {
          // 不应该重试的错误，直接抛出
          throw error;
        }
      }
    }
  }

  /**
   * 判断是否应该重试
   * @param {object} error - 错误对象
   * @returns {boolean} 是否应该重试
   */
  _shouldRetry(error) {
    // 网络错误通常可以重试
    if (error.code === 'ECONNRESET' || 
        error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'PROXY_CONNECTION_RESET' ||
        error.code === 'PROXY_CONNECTION_REFUSED' ||
        error.code === 'PROXY_CONNECTION_TIMEOUT') {
      return true;
    }
    
    // HTTP 5xx 错误可以重试
    if (error.status && error.status >= 500) {
      return true;
    }
    
    // 其他错误不重试
    return false;
  }

  /**
   * 延迟函数
   * @param {number} ms - 延迟毫秒数
   * @returns {Promise} Promise对象
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 实际发送HTTP请求
   * @param {string} method - HTTP方法
   * @param {string} endpoint - API端点
   * @param {object} data - 请求数据
   * @param {object} options - 额外选项
   * @returns {Promise} 响应Promise
   */
  async _makeRequest(method, endpoint, data = null, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseURL);
      const headers = { ...this.defaultHeaders, ...options.headers };
      
      // 请求配置
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: headers,
        agent: this.proxyAgent,
        // 添加更多连接选项以提高稳定性
        timeout: options.timeout || 30000,
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1
      };

      // 如果有数据，添加到请求体
      let postData = null;
      if (data && method !== 'GET') {
        postData = JSON.stringify(data);
        headers['Content-Length'] = Buffer.byteLength(postData);
      }

      // 创建请求
      const req = https.request(requestOptions, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = responseData ? JSON.parse(responseData) : null;
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                status: res.statusCode,
                headers: res.headers,
                data: parsedData
              });
            } else {
              reject({
                status: res.statusCode,
                headers: res.headers,
                data: parsedData,
                message: `HTTP ${res.statusCode}: ${res.statusMessage}`
              });
            }
          } catch (error) {
            reject({
              status: res.statusCode,
              headers: res.headers,
              data: responseData,
              error: error.message
            });
          }
        });
      });

      req.on('error', (error) => {
        // 对于代理连接问题，提供更详细的错误信息
        let errorMessage = error.message;
        let errorCode = error.code;
        
        if (error.code === 'ECONNRESET' && this.proxyAgent) {
          errorMessage = `代理连接被重置: ${error.message}`;
          errorCode = 'PROXY_CONNECTION_RESET';
        } else if (error.code === 'ECONNREFUSED' && this.proxyAgent) {
          errorMessage = `代理服务器拒绝连接: ${error.message}`;
          errorCode = 'PROXY_CONNECTION_REFUSED';
        } else if (error.code === 'ETIMEDOUT' && this.proxyAgent) {
          errorMessage = `代理连接超时: ${error.message}`;
          errorCode = 'PROXY_CONNECTION_TIMEOUT';
        }
        
        reject({
          error: errorMessage,
          code: errorCode,
          message: errorMessage,
          originalError: error.message,
          proxyUsed: !!this.proxyAgent
        });
      });

      // 设置超时
      req.setTimeout(options.timeout || 30000, () => {
        req.destroy();
        reject({
          error: '请求超时',
          code: 'TIMEOUT'
        });
      });

      // 发送数据
      if (postData) {
        req.write(postData);
      }
      
      req.end();
    });
  }

  /**
   * GET请求
   * @param {string} endpoint - API端点
   * @param {object} options - 请求选项
   * @returns {Promise} 响应Promise
   */
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, null, options);
  }

  /**
   * POST请求
   * @param {string} endpoint - API端点
   * @param {object} data - 请求数据
   * @param {object} options - 请求选项
   * @returns {Promise} 响应Promise
   */
  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  /**
   * PATCH请求
   * @param {string} endpoint - API端点
   * @param {object} data - 请求数据
   * @param {object} options - 请求选项
   * @returns {Promise} 响应Promise
   */
  async patch(endpoint, data, options = {}) {
    return this.request('PATCH', endpoint, data, options);
  }

  /**
   * DELETE请求
   * @param {string} endpoint - API端点
   * @param {object} options - 请求选项
   * @returns {Promise} 响应Promise
   */
  async delete(endpoint, options = {}) {
    return this.request('DELETE', endpoint, null, options);
  }

  // ========== Notion API 方法 ==========

  /**
   * 获取数据库
   * @param {string} databaseId - 数据库ID
   * @returns {Promise} 数据库信息
   */
  async getDatabase(databaseId) {
    return this.get(`/v1/databases/${databaseId}`);
  }

  /**
   * 查询数据库
   * 完全符合官方 API 规范
   * 
   * @param {string} databaseId - 数据库ID
   * @param {object} options - 查询选项
   * @param {object} options.filter - 过滤条件 (可选)
   * @param {object} options.sorts - 排序条件 (可选)
   * @param {number} options.page_size - 页面大小 (可选，默认 100)
   * @param {string} options.start_cursor - 开始游标 (可选)
   * @returns {Promise} 查询结果
   * 
   * @example
   * // 基本查询
   * const results = await notion.queryDatabase('database_id');
   * 
   * // 带过滤和排序的查询
   * const results = await notion.queryDatabase('database_id', {
   *   filter: {
   *     or: [
   *       {
   *         property: "In stock",
   *         checkbox: { equals: true }
   *       },
   *       {
   *         property: "Cost of next trip",
   *         number: { greater_than_or_equal_to: 2 }
   *       }
   *     ]
   *   },
   *   sorts: [
   *     {
   *       property: "Last ordered",
   *       direction: "ascending"
   *     }
   *   ],
   *   page_size: 50
   * });
   */
  async queryDatabase(databaseId, options = {}) {
    // 验证参数
    if (!databaseId) {
      throw new Error('数据库ID是必需的');
    }
    
    // 构建请求数据，完全符合官方API规范
    const data = {};
    
    // 添加过滤条件
    if (options.filter) {
      data.filter = options.filter;
    }
    
    // 添加排序条件
    if (options.sorts) {
      data.sorts = options.sorts;
    }
    
    // 添加页面大小
    if (options.page_size !== undefined) {
      data.page_size = options.page_size;
    }
    
    // 添加开始游标
    if (options.start_cursor) {
      data.start_cursor = options.start_cursor;
    }
    
    return this.post(`/v1/databases/${databaseId}/query`, data);
  }

  /**
   * 获取页面
   * @param {string} pageId - 页面ID
   * @returns {Promise} 页面信息
   */
  async getPage(pageId) {
    return this.get(`/v1/pages/${pageId}`);
  }

  /**
   * 创建页面
   * @param {object} pageData - 页面数据
   * @returns {Promise} 创建的页面
   */
  async createPage(pageData) {
    return this.post('/v1/pages', pageData);
  }

  /**
   * 更新页面
   * @param {string} pageId - 页面ID
   * @param {object} pageData - 更新数据
   * @returns {Promise} 更新后的页面
   */
  async updatePage(pageId, pageData) {
    return this.patch(`/v1/pages/${pageId}`, pageData);
  }

  /**
   * 删除页面
   * @param {string} pageId - 页面ID
   * @returns {Promise} 删除结果
   */
  async deletePage(pageId) {
    return this.delete(`/v1/pages/${pageId}`);
  }

  /**
   * 获取块
   * @param {string} blockId - 块ID
   * @returns {Promise} 块信息
   */
  async getBlock(blockId) {
    return this.get(`/v1/blocks/${blockId}`);
  }

  /**
   * 获取块子块
   * @param {string} blockId - 块ID
   * @param {number} pageSize - 页面大小
   * @param {string} startCursor - 开始游标
   * @returns {Promise} 子块列表
   */
  async getBlockChildren(blockId, pageSize = 100, startCursor = null) {
    const params = new URLSearchParams();
    if (pageSize) params.append('page_size', pageSize);
    if (startCursor) params.append('start_cursor', startCursor);
    
    const query = params.toString();
    const endpoint = `/v1/blocks/${blockId}/children${query ? '?' + query : ''}`;
    
    return this.get(endpoint);
  }

  /**
   * 创建块
   * @param {string} blockId - 父块ID
   * @param {object} blockData - 块数据
   * @returns {Promise} 创建的块
   */
  async createBlock(blockId, blockData) {
    return this.post(`/v1/blocks/${blockId}/children`, blockData);
  }

  /**
   * 更新块
   * @param {string} blockId - 块ID
   * @param {object} blockData - 更新数据
   * @returns {Promise} 更新后的块
   */
  async updateBlock(blockId, blockData) {
    return this.patch(`/v1/blocks/${blockId}`, blockData);
  }

  /**
   * 删除块
   * @param {string} blockId - 块ID
   * @returns {Promise} 删除结果
   */
  async deleteBlock(blockId) {
    return this.delete(`/v1/blocks/${blockId}`);
  }

  /**
   * 搜索
   * @param {string} query - 搜索查询
   * @param {string} filter - 过滤条件
   * @param {string} sort - 排序条件
   * @param {number} pageSize - 页面大小
   * @param {string} startCursor - 开始游标
   * @returns {Promise} 搜索结果
   */
  async search(query = '', filter = null, sort = null, pageSize = 100, startCursor = null) {
    const data = {
      query: query,
      page_size: pageSize
    };
    
    if (filter) data.filter = filter;
    if (sort) data.sort = sort;
    if (startCursor) data.start_cursor = startCursor;
    
    return this.post('/v1/search', data);
  }

  /**
   * 获取用户
   * @param {string} userId - 用户ID
   * @returns {Promise} 用户信息
   */
  async getUser(userId) {
    return this.get(`/v1/users/${userId}`);
  }

  /**
   * 获取用户列表
   * @returns {Promise} 用户列表
   */
  async getUsers() {
    return this.get('/v1/users');
  }
}

module.exports = NotionAPI;
