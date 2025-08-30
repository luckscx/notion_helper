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

  /**
   * 创建文件上传对象
   * @returns {Promise} 文件上传对象信息，包含 id 和 upload_url
   */
  async createFileUpload() {
    return this.post('/v1/file_uploads', {});
  }

  /**
   * 上传文件内容
   * @param {string} fileUploadId - 文件上传对象ID
   * @param {Buffer|string} fileContent - 文件内容
   * @param {string} filename - 文件名
   * @param {string} contentType - 文件类型
   * @returns {Promise} 上传结果，包含文件ID
   */
  async uploadFile(fileUploadId, fileContent, filename, contentType = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`/v1/file_uploads/${fileUploadId}/send`, this.baseURL);
      
      // 构建 multipart/form-data 边界
      const boundary = '----WebKitFormBoundary' + Math.random().toString(16).substr(2, 8);
      
      // 构建 multipart 数据
      let postData = Buffer.alloc(0);
      
      // 添加文件字段
      let fileField = `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`;
      
      if (contentType) {
        fileField += `Content-Type: ${contentType}\r\n`;
      }
      
      fileField += `\r\n`;
      
      postData = Buffer.concat([
        postData,
        Buffer.from(fileField, 'utf8'),
        Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent, 'utf8'),
        Buffer.from('\r\n', 'utf8')
      ]);
      
      // 添加结束边界
      postData = Buffer.concat([
        postData,
        Buffer.from(`--${boundary}--\r\n`, 'utf8')
      ]);

      // 请求配置
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Notion-Version': this.version,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': postData.length,
          'User-Agent': 'NotionAPI/1.0.0'
        },
        agent: this.proxyAgent,
        timeout: 60000, // 文件上传需要更长的超时时间
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1
      };

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
                data: parsedData,
                file_id: parsedData?.id // 返回文件ID
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
        reject({
          error: error.message,
          code: error.code,
          message: error.message,
          originalError: error.message,
          proxyUsed: !!this.proxyAgent
        });
      });

      // 设置超时
      req.setTimeout(60000, () => {
        req.destroy();
        reject({
          error: '文件上传超时',
          code: 'TIMEOUT'
        });
      });

      // 发送数据
      req.write(postData);
      req.end();
    });
  }

  /**
   * 完整的文件上传流程（创建上传对象 + 上传文件）
   * @param {Buffer|string} fileContent - 文件内容
   * @param {string} filename - 文件名
   * @param {string} contentType - 文件类型
   * @returns {Promise} 上传结果，包含文件ID
   */
  async uploadFileComplete(fileContent, filename, contentType = null) {
    try {
      // 步骤1: 创建文件上传对象
      console.log('📤 创建文件上传对象...');
      const uploadObject = await this.createFileUpload();
      const fileUploadId = uploadObject.data.id;
      console.log(`✅ 文件上传对象创建成功，ID: ${fileUploadId}`);
      
      // 步骤2: 上传文件内容
      console.log('📤 上传文件内容...');
      const uploadResult = await this.uploadFile(fileUploadId, fileContent, filename, contentType);
      console.log(`✅ 文件上传成功，文件ID: ${uploadResult.file_id}`);
      
      return {
        success: true,
        file_id: uploadResult.file_id,
        upload_object: uploadObject.data,
        upload_result: uploadResult.data
      };
    } catch (error) {
      console.error('❌ 文件上传失败:', error);
      throw error;
    }
  }

  /**
   * 从URL下载文件并上传到Notion
   * @param {string} fileUrl - 文件URL
   * @param {string} filename - 文件名（可选，如果不提供则从URL中提取）
   * @param {string} contentType - 文件类型（可选，如果不提供则自动检测）
   * @param {object} options - 额外选项
   * @returns {Promise} 上传结果，包含文件ID
   */
  async uploadFileFromUrl(fileUrl, filename = null, contentType = null, options = {}) {
    try {
      // 如果没有提供文件名，从URL中提取
      if (!filename) {
        const url = new URL(fileUrl);
        filename = url.pathname.split('/').pop() || 'downloaded_file';
      }

      // 如果没有提供文件类型，尝试从URL或文件名推断
      if (!contentType) {
        const url = new URL(fileUrl);
        const pathname = url.pathname.toLowerCase();
        if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
          contentType = 'image/jpeg';
        } else if (pathname.endsWith('.png')) {
          contentType = 'image/png';
        } else if (pathname.endsWith('.gif')) {
          contentType = 'image/gif';
        } else if (pathname.endsWith('.webp')) {
          contentType = 'image/webp';
        } else if (pathname.endsWith('.pdf')) {
          contentType = 'application/pdf';
        } else if (pathname.endsWith('.txt')) {
          contentType = 'text/plain';
        } else if (pathname.endsWith('.md')) {
          contentType = 'text/markdown';
        } else {
          contentType = 'application/octet-stream';
        }
      }

      console.log(`🌐 正在从 ${fileUrl} 下载文件...`);
      console.log(`📁 文件名: ${filename}`);
      console.log(`📋 文件类型: ${contentType}`);

      // 下载文件内容
      const fileBuffer = await this._downloadFileFromUrl(fileUrl, options);
      console.log(`✅ 文件下载成功！大小: ${fileBuffer.length} 字节`);

      // 使用现有的完整上传流程
      const result = await this.uploadFileComplete(fileBuffer, filename, contentType);
      
      return {
        ...result,
        source_url: fileUrl,
        downloaded_size: fileBuffer.length
      };

    } catch (error) {
      console.error('❌ 从URL下载并上传文件失败:', error);
      throw error;
    }
  }

  /**
   * 从URL下载文件的内部方法
   * @param {string} url - 文件URL
   * @param {object} options - 下载选项
   * @returns {Promise<Buffer>} 文件内容的Buffer
   */
  async _downloadFileFromUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
      const timeout = options.timeout || 60000; // 默认60秒超时
      const maxSize = options.maxSize || 50 * 1024 * 1024; // 默认50MB最大文件大小
      
      const urlObj = new URL(url);
      const protocol = urlObj.protocol === 'https:' ? https : require('http');
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'NotionAPI/1.0.0',
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        agent: this.proxyAgent, // 使用配置的代理
        timeout: timeout,
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 1
      };

      const request = protocol.request(requestOptions, (response) => {
        // 检查响应状态
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        // 检查Content-Length（如果可用）
        const contentLength = response.headers['content-length'];
        if (contentLength && parseInt(contentLength) > maxSize) {
          reject(new Error(`文件过大: ${contentLength} 字节，最大允许: ${maxSize} 字节`));
          return;
        }

        const chunks = [];
        let totalSize = 0;

        response.on('data', (chunk) => {
          totalSize += chunk.length;
          
          // 检查文件大小限制
          if (totalSize > maxSize) {
            request.destroy();
            reject(new Error(`文件过大: ${totalSize} 字节，最大允许: ${maxSize} 字节`));
            return;
          }
          
          chunks.push(chunk);
        });

        response.on('end', () => {
          if (totalSize === 0) {
            reject(new Error('下载的文件为空'));
            return;
          }
          
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });
      });

      request.on('error', (error) => {
        reject(new Error(`下载失败: ${error.message}`));
      });

      // 设置超时
      request.setTimeout(timeout, () => {
        request.destroy();
        reject(new Error('下载超时'));
      });

      request.end();
    });
  }
}

module.exports = NotionAPI;
