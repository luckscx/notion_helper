const {Client, LogLevel} = require('@notionhq/client');
const superagent = require('superagent');
const cheerio = require('cheerio');
const Promise = require('bluebird');
const retry = require('async-await-retry');
const moment = require('moment');
const process = require('process');
const NotionAPI = require('./notion_api');

const NOTION_KEY = process.env.NOTION_KEY;
const databaseId = process.env.DATABASE_ID;

const notion = new Client({auth: NOTION_KEY, logLevel: LogLevel.WARN, timeoutMs: 10000});
// 用于文件上传（multipart）。@notionhq/client 不支持 file_uploads，这里用项目自带的 NotionAPI
const notionRaw = new NotionAPI({token: NOTION_KEY});

// 浏览器 UA，避免被豆瓣直接 403
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Referer': 'https://book.douban.com/',
};

/**
 * 判断一个 Notion 页面的"封面"字段是不是来自豆瓣的 external URL。
 * 这类封面在 Notion 里会因为豆瓣 Referer 防盗链显示为 broken，需要重刷上传。
 */
function isDoubanExternalCover(page) {
  const files = page && page.properties && page.properties['封面'] &&
      page.properties['封面'].files;
  if (!files || !files.length) return false;
  const f = files[0];
  if (!f || f.type !== 'external') return false;
  const url = f.external && f.external.url;
  return !!(url && /doubanio\.com/i.test(url));
}

/**
 * 第二轮扫描：拉取"封面非空"的页面，用于客户端过滤出 broken 的 external doubanio 封面。
 * Notion 的 files filter 只支持 is_empty/is_not_empty，无法按 URL 模式过滤，
 * 因此先 is_not_empty 拉回，再在 JS 层判断。
 */
async function getNotionDBListWithCover(start_cursor) {
  const query_obj = {
    database_id: databaseId,
    page_size: 50,
    filter: {
      'property': '封面',
      'files': {
        'is_not_empty': true,
      },
    },
    sorts: [
      {
        property: 'ISBN',
        direction: 'descending',
      },
    ],
  };
  if (start_cursor) {
    query_obj.start_cursor = start_cursor;
  }
  return await notion.databases.query(query_obj);
}

async function getNotionDBList(start_cursor) {
  const query_obj = {
    database_id: databaseId,
    page_size: 5,
    filter:
     {
       'or': [
         {
           'property': '原书名',
           'rich_text': {
             'is_empty': true,
           },
         }, {
           'property': '出版社',
           'select': {
             'is_empty': true,
           },
         }, {
           'property': '封面',
           'files': {
             'is_empty': true,
           },
         }],
     },
    sorts: [
      {
        property: 'ISBN',
        direction: 'ascending',
      },
    ],
  };
  if (start_cursor) {
    query_obj.start_cursor = start_cursor;
  }

  // 添加重试机制来处理网络连接问题
  try {
    return await retry(async () => {
      return await notion.databases.query(query_obj);
    }, null, {retriesMax: 3, interval: 2000, exponential: true, factor: 2, jitter: 500});
  } catch (error) {
    console.error('获取 Notion 数据库列表失败:', error.message);
    // 等待一段时间后重试
    await new Promise(resolve => setTimeout(resolve, 5000));
    throw error;
  }
}

/**
 * 通过豆瓣 subject_suggest JSON 接口搜书。
 * 返回详情页 URL，找不到返回 null。
 */
async function searchBook(key) {
  if (!key) {
    return null;
  }
  const info_url = `https://book.douban.com/j/subject_suggest?q=${encodeURIComponent(key)}`;
  try {
    const res = await superagent
        .get(info_url)
        .set(COMMON_HEADERS)
        .timeout({response: 8000, deadline: 15000});
    let list = res.body;
    // superagent 在某些情况下不会自动解析 JSON（比如 content-type 是 text/javascript）
    if (!Array.isArray(list)) {
      try {
        list = JSON.parse(res.text);
      } catch (e) {
        list = [];
      }
    }
    if (Array.isArray(list) && list.length > 0) {
      // 仅保留 type=b（图书）的条目
      const book = list.find((it) => it && it.type === 'b' && it.url) || list[0];
      return book && book.url ? book.url : null;
    }
    return null;
  } catch (error) {
    console.log('search douban error %s, key=%s', error.message, key);
    return null;
  }
}

/**
 * 从 #info 区域里按 label 提取一行文本
 *  豆瓣 #info 结构：<span class="pl">作者</span>: ...<br/>
 *  我们把整个 #info 抽成纯文本，然后按 label 切。
 */
function buildInfoMap($) {
  const map = {};
  // 把 #info 转成 "label: value\n" 形式
  const infoText = $('#info').text();
  // 行内 <br/> 变成换行；但我们先按 "label:" 拆段
  // 策略：根据所有 .pl 节点的文本作为分隔点
  const labels = [];
  $('#info > span.pl, #info span.pl').each(function() {
    const label = $(this).text().replace(/[:：]/g, '').trim();
    if (label) labels.push(label);
  });

  // 用换行符 + 空格清洗
  const flat = infoText
      .replace(/\u00a0/g, ' ')
      .replace(/\r/g, '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('\n');

  // 解析：每一行可能形如 "作者: 刘慈欣"，也可能 label 与 value 分两行
  const lines = flat.split('\n');
  const isLabelLine = (s) => /^.{1,8}[:：]\s*$/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^(.+?)[:：]\s*(.*)$/);
    if (m) {
      const label = m[1].trim();
      let value = m[2].trim();
      // 跨行 value：仅当下一行不是 label 时才借用
      if (!value && i + 1 < lines.length && !isLabelLine(lines[i + 1])) {
        value = lines[i + 1].trim();
      }
      if (label && value) {
        map[label] = value;
      }
    }
  }
  return map;
}

/**
 * 抓取并解析豆瓣图书详情页。
 */
async function getBookInfo(url) {
  if (!url || !/^https?:\/\//.test(url)) {
    console.log('invalid douban url: %s', url);
    return null;
  }
  try {
    const res = await retry(async () => {
      return await superagent
          .get(url)
          .set(COMMON_HEADERS)
          .timeout({response: 10000, deadline: 20000});
    }, null, {retriesMax: 2, interval: 1500, exponential: true, factor: 2, jitter: 300});

    const $ = cheerio.load(res.text);

    // —— 书名 ——
    const title = ($('meta[property="og:title"]').attr('content') ||
        $('h1 span[property="v:itemreviewed"]').text() || '').trim();

    // —— 封面图 ——
    // 优先大图：a#mainpic > a.nbg 的 href（豆瓣的大图链接）
    // 兜底：og:image（也是大图） → #mainpic img 的 src（小图缩略）
    const pic = ($('#mainpic a.nbg').attr('href') ||
        $('meta[property="og:image"]').attr('content') ||
        $('#mainpic img').attr('src') ||
        $('img[rel="v:photo"]').attr('src') || '').trim();

    // —— 豆瓣评分 ——
    const rating = parseFloat($('.rating_num').first().text().trim()) || 0;

    // —— 打分人数 ——
    // 优先 v:votes 微数据；兜底从 a.rating_people 的文本里抠数字
    let rating_user = parseInt(
        $('span[property="v:votes"]').first().text().trim(), 10);
    if (!rating_user) {
      const m = $('a.rating_people').first().text().match(/(\d+)/);
      rating_user = m ? parseInt(m[1], 10) : 0;
    }
    rating_user = rating_user || 0;

    const info = buildInfoMap($);

    // —— 页数 ——
    // #info 区域行级解析有时会因 br/换行不稳；直接对 #info 文本做正则更可靠
    let page_num = parseInt(info['页数'], 10);
    if (!page_num) {
      const pm = $('#info').text().match(/页数[:：]\s*([0-9]+)/);
      page_num = pm ? parseInt(pm[1], 10) : 0;
    }
    page_num = page_num || 0;

    const data = {
      title: title,
      url: url,
      pic: pic,
      rating: rating,
      rating_user: rating_user,
      page_num: page_num,
      // 兼容旧字段命名
      '作者': info['作者'] || '',
      '译者': info['译者'] || '',
      '出版社': info['出版社'] || '',
      '出品方': info['出品方'] || '',
      '原作名': info['原作名'] || '',
      '副标题': info['副标题'] || '',
      '出版年': info['出版年'] || '',
      '页数': info['页数'] || (page_num ? String(page_num) : ''),
      'ISBN': info['ISBN'] || '',
    };

    if (!data.title) {
      console.log('parse fail (no title): %s', url);
      return null;
    }

    console.log('parsed: %s | %s | rating=%s/%s人 | pages=%s | publisher=%s | isbn=%s | pic=%s',
        data.title, data['作者'], data.rating, data.rating_user, data.page_num,
        data['出版社'] || data['出品方'], data.ISBN, data.pic ? 'Y' : 'N');
    return data;
  } catch (error) {
    console.log('load douban detail error %s url=%s',
        error && error.message ? error.message : error, url);
    return null;
  }
}

/**
 * 带豆瓣 Referer 下载图片，返回 { buffer, contentType, filename }。
 * 豆瓣图片 CDN 校验 Referer，否则会返 418 (I'm a teapot)。
 */
async function downloadDoubanImage(imageUrl) {
  const res = await retry(async () => {
    return await superagent
        .get(imageUrl)
        .set(COMMON_HEADERS) // COMMON_HEADERS 已经带 Referer: https://book.douban.com/
        .responseType('arraybuffer')
        .timeout({response: 8000, deadline: 20000});
  }, null, {retriesMax: 2, interval: 1000, exponential: true, factor: 2, jitter: 200});

  const buffer = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body || '');
  if (!buffer || buffer.length === 0) {
    throw new Error('downloaded cover is empty');
  }
  const contentType = (res.headers && res.headers['content-type']) || 'image/jpeg';

  // 从 URL 推断 filename
  let filename = '封面图.jpg';
  try {
    const u = new (require('url').URL)(imageUrl);
    const last = u.pathname.split('/').pop();
    if (last && /\.(jpe?g|png|webp|gif)$/i.test(last)) {
      filename = last;
    } else if (/png/.test(contentType)) {
      filename = '封面图.png';
    } else if (/webp/.test(contentType)) {
      filename = '封面图.webp';
    }
  } catch (e) { /* ignore */ }

  return {buffer, contentType, filename};
}

/**
 * 把豆瓣图片上传到 Notion 自有存储，返回 { file_upload_id, filename }。
 * 失败抛错（外层会降级回 external URL）。
 */
async function downloadAndUploadCover(imageUrl, bookTitle) {
  const {buffer, contentType, filename} = await downloadDoubanImage(imageUrl);
  console.log('cover downloaded: %s (%d bytes, %s)', filename, buffer.length, contentType);

  // 用书名给文件起个有意义的名字（保留扩展名）
  let finalName = filename;
  if (bookTitle) {
    const ext = (filename.match(/\.(jpe?g|png|webp|gif)$/i) || [, 'jpg'])[1];
    const safeTitle = bookTitle.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60);
    finalName = `${safeTitle}.${ext}`;
  }

  const result = await notionRaw.uploadFileComplete(buffer, finalName, contentType);
  return {file_upload_id: result.file_id, filename: finalName};
}


function getPropertiesFromInfo(Info) {
  const rating = parseFloat(Info.rating) || 0;
  const rating_user = parseInt(Info.rating_user, 10) || 0;
  const pub_date = Info['出版年'];
  let formate_date = moment(pub_date, 'YYYY-MM-DD').format('YYYY-MM-DD');
  if (formate_date == 'Invalid date') {
    formate_date = moment(pub_date, 'YYYY-M').format('YYYY-MM-DD');
  }
  if (formate_date == 'Invalid date') {
    formate_date = moment(pub_date, 'YYYY年M月').format('YYYY-MM-DD');
  }
  // 没有有效值
  if (formate_date == 'Invalid date') {
    formate_date = '1000-01-01';
  }

  let author = [];
  if (Info['作者']) {
    author = Info['作者'].split('/').map((s) => s.trim()).filter(Boolean);
  }
  let trans = [];
  if (Info['译者']) {
    trans = Info['译者'].split('/').map((s) => s.trim()).filter(Boolean);
  }

  let ori_name = Info['原作名'];
  if (!ori_name) {
    ori_name = Info.title;
  }

  let publisher = Info['出版社'] || Info['出品方'];
  if (!publisher) {
    publisher = '';
  }

  const page_num = (typeof Info.page_num === 'number' && Info.page_num > 0) ?
      Info.page_num : (parseInt(Info['页数'], 10) || 0);
  const obj = {
    '书名': {
      title: [{type: 'text', text: {content: Info.title}}],
    },
    'ISBN': {
      'rich_text': [{
        'type': 'text',
        'text': {content: Info.ISBN || ''},
      }],
    },
    '原书名': {
      'rich_text': [{
        'type': 'text',
        'text': {content: ori_name || ''},
      }],
    },
    '豆瓣评分': {
      'number': rating,
    },
    '页数': {
      'number': page_num,
    },
    '豆瓣页面': {
      'url': Info.url,
    },
    '出版时间': {
      'date': {
        start: formate_date,
      },
    },
    '出版社': {
      'select':
      {
        'name': publisher || 'none',
      },
    },
    '豆瓣打分人数': {
      'number': rating_user,
    },
    '作者': {
      'multi_select': author.map((name) => {
        return {
          name: name,
        };
      }),
    },
    '译者': {
      'multi_select': trans.map((name) => {
        return {
          name: name,
        };
      }),
    },
  };

  if (Info.cover_file_upload_id) {
    // 已经把图上传到 Notion 自有存储，使用 file_upload 引用
    obj['封面'] = {
      'files': [
        {
          name: Info.cover_filename || '封面图.jpg',
          type: 'file_upload',
          file_upload: {
            id: Info.cover_file_upload_id,
          },
        },
      ],
    };
  } else if (Info.pic) {
    // 兜底：external URL（豆瓣图因防盗链在 Notion 中不显示，仅留链接存档）
    obj['封面'] = {
      'files': [
        {
          name: '封面图',
          type: 'external',
          external: {
            url: Info.pic,
          },
        },
      ],
    };
  }
  return obj;
}

async function updateNotionPage(page_info, obj) {
  const pageId = page_info.id;
  try {
    await retry(async () => {
      return await notion.pages.update({
        page_id: pageId,
        properties: getPropertiesFromInfo(obj),
      });
    }, null, {retriesMax: 2, interval: 1000, exponential: true, factor: 3, jitter: 100});
  } catch (err) {
    console.log(obj);
    console.error(err);
    console.error('The function execution failed !');
  }
}

/**
 * 判断 Notion 里 "豆瓣页面" 字段值是否是真的豆瓣详情链接。
 */
function isValidDoubanUrl(u) {
  return typeof u === 'string' &&
      /^https?:\/\/([^/]*\.)?douban\.com\/subject\/\d+\/?/.test(u);
}

async function pageWork(one) {
  const prop = one.properties;
  let key = '';
  if (prop['书名'] && prop['书名'].title && prop['书名'].title[0]) {
    key = prop['书名'].title[0].plain_text;
  }

  if (prop['ISBN'] && prop['ISBN'].rich_text && prop['ISBN'].rich_text[0]) {
    const isbn = prop['ISBN'].rich_text[0].plain_text;
    if (isbn && isbn.length > 10) {
      key = isbn;
    }
  }

  const existing = prop['豆瓣页面'] && prop['豆瓣页面'].url;
  let page_url = '';

  if (isValidDoubanUrl(existing)) {
    page_url = existing;
    console.log('use existing douban url: %s', page_url);
  } else {
    if (existing) {
      console.log('ignore invalid douban url field: %j', existing);
    }
    if (!key) {
      console.log('no valid key, skip page %s', one.id);
      return;
    }
    key = key.replace(/-/g, '').trim();
    page_url = await searchBook(key);
    if (!page_url) {
      console.log('search fail, key=%s', key);
      return;
    }
    console.log('searched douban url: %s -> %s', key, page_url);
  }

  const douban_info = await getBookInfo(page_url);
  if (!douban_info) {
    console.log('not get page info for %s', page_url);
    return;
  }

  // —— 封面图：先下载（带豆瓣 Referer 绕过 418 防盗链），再上传到 Notion 自有存储 ——
  // 这样在 Notion 里能直接显示，不会因为防盗链而 broken。
  if (douban_info.pic) {
    try {
      const upload = await downloadAndUploadCover(douban_info.pic, douban_info.title);
      if (upload && upload.file_upload_id) {
        douban_info.cover_file_upload_id = upload.file_upload_id;
        douban_info.cover_filename = upload.filename;
        console.log('cover uploaded -> file_upload_id=%s', upload.file_upload_id);
      }
    } catch (e) {
      console.log('cover upload fail (will fallback to external url): %s',
          e && e.message ? e.message : e);
    }
  }

  await updateNotionPage(one, douban_info);
}

async function main() {
  let cursor;
  let retryCount = 0;
  const maxRetries = 2;

  while (true) {
    try {
      const list = await getNotionDBList(cursor);
      const cnt = list.results.length;
      console.log('get notion db list %d', cnt);

      // 重置重试计数器，因为成功获取到了数据
      retryCount = 0;

      // 逐条串行刷新，最大限度降低被豆瓣风控的概率
      await Promise.map(list.results, pageWork, {concurrency: 1});
      console.log('batch done %d', cnt);

      if (list.has_more) {
        cursor = list.next_cursor;
        console.log('now cursor %s', cursor);
      } else {
        break;
      }
    } catch (error) {
      console.error('获取数据时发生错误:', error.message);
      retryCount++;

      if (retryCount >= maxRetries) {
        console.error('达到最大重试次数，程序退出');
        throw error;
      }

      const waitTime = retryCount * 10000; // 递增等待时间
      console.log(`等待 ${waitTime/1000} 秒后进行第 ${retryCount} 次重试...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  // —— 第二轮：修复"封面已经是 external doubanio URL"的脏数据 ——
  // 这类封面因豆瓣防盗链在 Notion 中无法显示，需要走完整下载+上传流程重刷。
  // Notion 的 files filter 不支持 URL 模式匹配，所以拉回 is_not_empty 后客户端过滤。
  console.log('---- start scan: external doubanio covers ----');
  let cursor2;
  let scanned = 0;
  let fixed = 0;
  while (true) {
    try {
      const list = await getNotionDBListWithCover(cursor2);
      scanned += list.results.length;
      const targets = list.results.filter(isDoubanExternalCover);
      if (targets.length) {
        console.log('scan batch: %d/%d need cover-refix', targets.length, list.results.length);
        await Promise.map(targets, pageWork, {concurrency: 1});
        fixed += targets.length;
      }
      if (list.has_more) {
        cursor2 = list.next_cursor;
      } else {
        break;
      }
    } catch (error) {
      console.error('扫描 doubanio 封面时发生错误:', error.message);
      break;
    }
  }
  console.log('cover-refix scan done: scanned=%d, fixed=%d', scanned, fixed);

  console.log('finish all');
}

main();
