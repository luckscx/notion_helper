const NotionAPI = require('./notion_api');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const process = require('process');
const config = require('./config');

const NOTION_KEY = config.notion.token;

// ========== 配置区域 ==========
// 请根据实际需求修改以下配置

// 目标数据库ID
const DATABASE_ID = config.notion.accountDatabaseId; // 可以改为其他数据库ID

// 要运算的列名（属性名）
const COLUMN_NAME = '微信理财通'; // 修改为你需要运算的列名

// 批处理大小
const BATCH_SIZE = 10;

// 运算函数：对列值进行运算，返回新的值
// 参数：originalValue - 原始值，page - 页面对象（包含所有属性）
// 返回：运算后的值（需要符合Notion属性格式）
function calculateColumnValue(originalValue, page) {
  // 示例1: 如果是数字，乘以2
  if (typeof originalValue === 'number') {
    return originalValue * 1000;
  }
  return originalValue;

  // 示例2: 如果是数字，加10
  // if (typeof originalValue === 'number') {
  //   return originalValue + 10;
  // }
  // return originalValue;

  // 示例3: 如果是数字，四舍五入到整数
  // if (typeof originalValue === 'number') {
  //   return Math.round(originalValue);
  // }
  // return originalValue;

  // 示例4: 根据其他列的值进行计算
  // const otherValue = page.properties['其他列名']?.number || 0;
  // if (typeof originalValue === 'number') {
  //   return originalValue + otherValue;
  // }
  // return originalValue;

  // 默认：不做任何运算，直接返回原值（用于测试）
  // return originalValue;
}

// ========== 代码区域 ==========

const notion_config = {
  token: NOTION_KEY,
  proxy: config.proxy.enabled ? config.proxy.url : null,
};

const notion = new NotionAPI(notion_config);

/**
 * 从Notion属性中提取值
 * @param {object} property - Notion属性对象
 * @returns {any} 提取的值
 */
function extractPropertyValue(property) {
  if (!property) return null;

  // 数字类型
  if (property.number !== null && property.number !== undefined) {
    return property.number;
  }

  // 文本类型
  if (property.rich_text && property.rich_text.length > 0) {
    return property.rich_text[0].plain_text;
  }

  // 标题类型
  if (property.title && property.title.length > 0) {
    return property.title[0].plain_text;
  }

  // URL类型
  if (property.url) {
    return property.url;
  }

  // 日期类型
  if (property.date) {
    return property.date;
  }

  // 复选框类型
  if (property.checkbox !== null && property.checkbox !== undefined) {
    return property.checkbox;
  }

  // 选择类型
  if (property.select) {
    return property.select.name;
  }

  // 多选类型
  if (property.multi_select && property.multi_select.length > 0) {
    return property.multi_select.map(item => item.name);
  }

  return null;
}

/**
 * 根据值类型构建Notion属性格式
 * @param {any} value - 值
 * @param {string} propertyType - 属性类型（'number', 'rich_text', 'title', 'url', 'date', 'checkbox', 'select', 'multi_select'）
 * @returns {object} Notion属性对象
 */
function buildPropertyFromValue(value, propertyType = 'number') {
  if (value === null || value === undefined) {
    return null;
  }

  switch (propertyType) {
    case 'number':
      return {
        number: typeof value === 'number' ? value : parseFloat(value) || 0
      };

    case 'rich_text':
      return {
        rich_text: [{
          type: 'text',
          text: { content: String(value) }
        }]
      };

    case 'title':
      return {
        title: [{
          type: 'text',
          text: { content: String(value) }
        }]
      };

    case 'url':
      return {
        url: String(value)
      };

    case 'date':
      if (typeof value === 'string') {
        return {
          date: {
            start: value
          }
        };
      } else if (value.start) {
        return {
          date: value
        };
      }
      return null;

    case 'checkbox':
      return {
        checkbox: Boolean(value)
      };

    case 'select':
      return {
        select: {
          name: String(value)
        }
      };

    case 'multi_select':
      const items = Array.isArray(value) ? value : [value];
      return {
        multi_select: items.map(item => ({ name: String(item) }))
      };

    default:
      return {
        number: typeof value === 'number' ? value : parseFloat(value) || 0
      };
  }
}

/**
 * 检测属性类型
 * @param {object} property - Notion属性对象
 * @returns {string} 属性类型
 */
function detectPropertyType(property) {
  if (!property) return 'number';

  if (property.number !== null && property.number !== undefined) return 'number';
  if (property.rich_text) return 'rich_text';
  if (property.title) return 'title';
  if (property.url !== null && property.url !== undefined) return 'url';
  if (property.date) return 'date';
  if (property.checkbox !== null && property.checkbox !== undefined) return 'checkbox';
  if (property.select) return 'select';
  if (property.multi_select) return 'multi_select';

  return 'number'; // 默认
}

/**
 * 更新Notion页面
 * @param {object} page - 页面对象
 * @param {any} newValue - 新值
 * @param {string} propertyType - 属性类型
 */
async function updateNotionPage(page, newValue, propertyType) {
  const pageId = page.id;
  try {
    const propertyData = buildPropertyFromValue(newValue, propertyType);
    
    if (!propertyData) {
      console.log(`⚠️  跳过页面 ${pageId}: 无法构建属性数据`);
      return;
    }

    const properties = {
      [COLUMN_NAME]: propertyData
    };

    await retry(async () => {
      return await notion.updatePage(pageId, {
        properties: properties
      });
    }, null, { retriesMax: 3, interval: 1000, exponential: true, factor: 3, jitter: 100 });

    console.log(`✅ 成功更新页面 ${pageId}`);
  } catch (err) {
    console.error(`❌ 更新页面 ${pageId} 失败:`, err.message);
  }
}

/**
 * 处理单个页面
 * @param {object} page - 页面对象
 */
async function processPage(page) {
  try {
    const properties = page.properties;
    const columnProperty = properties[COLUMN_NAME];

    if (!columnProperty) {
      console.log(`⚠️  页面 ${page.id}: 未找到列 "${COLUMN_NAME}"`);
      return;
    }

    // 提取原始值
    const originalValue = extractPropertyValue(columnProperty);
    const propertyType = detectPropertyType(columnProperty);

    // 获取页面名称用于日志
    let pageName = '未知页面';
    if (properties['Name']?.title?.[0]) {
      pageName = properties['Name'].title[0].plain_text;
    } else if (properties['Name']?.rich_text?.[0]) {
      pageName = properties['Name'].rich_text[0].plain_text;
    }

    console.log(`🔍 处理页面: ${pageName} (${page.id})`);
    console.log(`   原始值: ${JSON.stringify(originalValue)}`);

    // 执行运算
    const newValue = calculateColumnValue(originalValue, page);

    // 检查值是否改变
    if (JSON.stringify(newValue) === JSON.stringify(originalValue)) {
      console.log(`⏭️  值未改变，跳过更新`);
      return;
    }

    console.log(`   新值: ${JSON.stringify(newValue)}`);

    // 更新页面
    await updateNotionPage(page, newValue, propertyType);

  } catch (error) {
    console.error(`❌ 处理页面失败 (${page.id}):`, error.message);
  }
}

/**
 * 获取数据库列表（分页）
 * @param {string} startCursor - 开始游标
 * @returns {Promise} 查询结果
 */
async function getNotionDBList(startCursor) {
  const query_obj = {
    page_size: BATCH_SIZE,
    // 可以添加过滤条件，例如只处理特定条件的行
    // filter: {
    //   'and': [{
    //     'property': COLUMN_NAME,
    //     'number': { 'is_not_empty': true }
    //   }]
    // },
  };

  if (startCursor) {
    query_obj.start_cursor = startCursor;
  }

  return await notion.queryDatabase(DATABASE_ID, query_obj);
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🚀 开始处理数据库...');
    console.log(`📊 数据库ID: ${DATABASE_ID}`);
    console.log(`📝 目标列: ${COLUMN_NAME}`);
    console.log(`📦 批处理大小: ${BATCH_SIZE}`);

    let cursor;
    let totalProcessed = 0;
    let totalUpdated = 0;

    while (true) {
      const response = await getNotionDBList(cursor);

      if (!response || !response.data) {
        console.error('❌ 查询数据库失败:', response);
        break;
      }

      const list = response.data;
      const cnt = list.results.length;
      
      console.log(`\n📄 获取到 ${cnt} 条记录`);

      await Promise.map(list.results, processPage, { concurrency: BATCH_SIZE });
      
      totalProcessed += cnt;
      console.log(`✅ 批次完成，已处理 ${totalProcessed} 条记录`);

      if (list.has_more) {
        cursor = list.next_cursor;
        console.log(`📍 下一个游标: ${cursor}`);
      } else {
        break;
      }
    }

    console.log('\n🎉 全部完成！');
    console.log(`📊 总共处理: ${totalProcessed} 条记录`);
  } catch (error) {
    console.error('❌ 主函数执行失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

// 使用 .catch() 处理未捕获的Promise拒绝
main().catch(error => {
  console.error('❌ 程序执行失败:', error.message);
  console.error('错误详情:', error);
  process.exit(1);
});

