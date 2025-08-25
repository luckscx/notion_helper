/**
 * 图片代理服务 - 解决Notion图片URL长度限制问题
 */

const superagent = require('superagent');

/**
 * 图片代理服务配置
 */
const IMAGE_PROXY_SERVICES = {
  // 免费图片代理服务
  'imgproxy': {
    baseUrl: 'https://imgproxy.example.com',
    transform: (url) => `https://imgproxy.example.com/insecure/fit/800/600/${Buffer.from(url).toString('base64')}`
  },
  
  // 使用Cloudinary（需要注册免费账号）
  'cloudinary': {
    baseUrl: 'https://res.cloudinary.com',
    transform: (url, cloudName = 'your-cloud-name') => {
      // 使用更短的参数
      const encodedUrl = Buffer.from(url).toString('base64');
      return `https://res.cloudinary.com/${cloudName}/image/fetch/f_auto/${encodedUrl}`;
    }
  },
  
  // 使用TinyURL API（免费，但有请求限制）
  'tinyurl': {
    baseUrl: 'https://tinyurl.com',
    transform: async (url) => {
      try {
        const response = await superagent
          .post('https://tinyurl.com/api-create.php')
          .send({ url: url });
        return response.text;
      } catch (error) {
        console.warn('TinyURL转换失败，使用原URL:', error.message);
        return url;
      }
    }
  },
  
  // 使用is.gd（免费，但有请求限制）
  'isgd': {
    baseUrl: 'https://is.gd',
    transform: async (url) => {
      try {
        const response = await superagent
          .get('https://is.gd/create.php')
          .query({ format: 'json', url: url });
        return response.body.shorturl;
      } catch (error) {
        console.warn('is.gd转换失败，使用原URL:', error.message);
        return url;
      }
    }
  },
  
  // 使用自定义短域名服务（Grissom的短链接服务）
  'grissom': {
    baseUrl: 'https://b.grissom.cn',
    transform: async (url) => {
      try {
        const response = await superagent
          .post('https://b.grissom.cn/api/shorten-url')
          .set('Content-Type', 'application/json')
          .timeout(10000) // 10秒超时
          .send({ url: url });
        
        if (response.body && response.body.short_url) {
          const shortUrl = response.body.short_url;
          
          // 如果返回的是本地开发环境URL，转换为生产环境URL
          if (shortUrl.includes('127.0.0.1') || shortUrl.includes('localhost')) {
            const shortCode = shortUrl.split('/s/')[1];
            if (shortCode) {
              const productionUrl = `https://b.grissom.cn/s/${shortCode}`;
              console.log(`🔄 转换开发环境URL: ${shortUrl} → ${productionUrl}`);
              return productionUrl;
            }
          }
          
          return shortUrl;
        } else {
          console.warn('Grissom短链接服务返回格式异常:', response.body);
          return url;
        }
      } catch (error) {
        console.warn('Grissom短链接服务请求失败:', error.message);
        return url;
      }
    }
  },
  
  // 使用图片压缩服务
  'compress': {
    baseUrl: 'https://compress.image',
    transform: (url) => {
      // 使用图片压缩服务，通常URL会更短
      // 例如：TinyPNG, ImageOptim等
      return url; // 暂时返回原URL
    }
  }
};

/**
 * 处理图片URL，确保符合Notion的长度限制
 * @param {string} originalUrl - 原始图片URL
 * @param {string} service - 使用的代理服务名称
 * @param {Object} options - 服务特定选项
 * @returns {Promise<string>} 处理后的URL
 */
async function processImageUrl(originalUrl, service = 'cloudinary', options = {}) {
  if (!originalUrl) {
    return null;
  }
  
  // 如果URL已经足够短，直接返回
  if (originalUrl.length <= 100) {
    return originalUrl;
  }
  
  const selectedService = IMAGE_PROXY_SERVICES[service];
  if (!selectedService) {
    console.warn(`未知的图片代理服务: ${service}，使用原URL`);
    return originalUrl;
  }
  
  try {
    let processedUrl;
    
    if (typeof selectedService.transform === 'function') {
      if (selectedService.transform.constructor.name === 'AsyncFunction') {
        // 异步转换函数
        processedUrl = await selectedService.transform(originalUrl, options.cloudName);
      } else {
        // 同步转换函数
        processedUrl = selectedService.transform(originalUrl, options.cloudName);
      }
    } else {
      processedUrl = originalUrl;
    }
    
    // 验证处理后的URL长度
    if (processedUrl && processedUrl.length <= 100) {
      console.log(`✅ 图片URL处理成功: ${originalUrl.length} → ${processedUrl.length} 字符`);
      return processedUrl;
    } else {
      console.warn(`⚠️  处理后的URL仍然过长: ${processedUrl.length} 字符`);
      return processedUrl; // 返回处理后的URL，即使仍然过长
    }
    
  } catch (error) {
    console.error(`❌ 图片URL处理失败:`, error.message);
    return originalUrl; // 失败时返回原URL
  }
}

/**
 * 批量处理图片URL
 * @param {Array} urls - 图片URL数组
 * @param {string} service - 代理服务名称
 * @param {Object} options - 服务选项
 * @returns {Promise<Array>} 处理后的URL数组
 */
async function processImageUrls(urls, service = 'cloudinary', options = {}) {
  if (!Array.isArray(urls)) {
    return [];
  }
  
  const processedUrls = [];
  for (const url of urls) {
    const processedUrl = await processImageUrl(url, service, options);
    processedUrls.push(processedUrl);
  }
  
  return processedUrls;
}

/**
 * 获取可用的代理服务列表
 * @returns {Array} 服务名称数组
 */
function getAvailableServices() {
  return Object.keys(IMAGE_PROXY_SERVICES);
}

/**
 * 测试图片代理服务
 * @param {string} testUrl - 测试URL
 */
async function testImageProxy(testUrl = 'https://www.mobygames.com/images/shots/l/12345-baldurs-gate-3-pc-screenshot.jpg') {
  console.log('🧪 测试图片代理服务\n');
  console.log(`📸 测试URL: ${testUrl}`);
  console.log(`📏 原始长度: ${testUrl.length} 字符\n`);
  
  for (const serviceName of getAvailableServices()) {
    try {
      console.log(`🔧 测试服务: ${serviceName}`);
      const processedUrl = await processImageUrl(testUrl, serviceName, { cloudName: 'demo' });
      console.log(`   结果: ${processedUrl ? processedUrl.length : 0} 字符`);
      console.log(`   状态: ${processedUrl && processedUrl.length <= 100 ? '✅ 符合限制' : '⚠️  仍然过长'}\n`);
    } catch (error) {
      console.log(`   状态: ❌ 失败 - ${error.message}\n`);
    }
  }
}

module.exports = {
  processImageUrl,
  processImageUrls,
  getAvailableServices,
  testImageProxy
};

// 如果直接运行此文件，执行测试
if (require.main === module) {
  testImageProxy();
}
