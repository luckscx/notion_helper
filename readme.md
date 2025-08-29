# nodejs脚本
帮助notion中页面和数据库的方便管理
如新增一行数据、新增模板页面并实时修改部分数据等

- meal_add_day.js 
每日新增一行数据

- movie_refresh.js
基于豆瓣电影详情页 刷新表格

- book_refresh.js
基于豆瓣书籍详情页 刷新notion表格
需搭配 douban_api  库使用
 
- daily_job.js
日报页面复制后刷新标题内容

- add_todo.js
读取文本，往指定页面中，添加一行内容

## 配置说明

### 快速开始
1. 运行初始化脚本：
   ```bash
   npm run init
   ```
   或者直接运行：
   ```bash
   node init.js
   ```

2. 按照提示填写配置信息：
   - Notion 集成令牌
   - 数据库 ID
   - IGDB API 凭据
   - 代理设置（可选）

3. 检查生成的配置文件：
   - `config.js` - 主配置文件
   - `.env` - 环境变量文件（用于敏感信息）

### 配置文件说明
- `config_example.js` - 配置模板文件
- `config.js` - 实际配置文件（运行初始化后生成）
- `.env` - 环境变量文件（可选）

### 配置项说明
- **Notion 配置**: API 令牌、数据库 ID、API 版本等
- **IGDB 配置**: 游戏信息 API 凭据
- **代理配置**: 网络代理设置（可选）
- **应用配置**: 服务器端口、日志级别、重试策略等
- **数据库字段映射**: 各数据库的字段名称映射

## Notion API官方文档
https://developers.notion.com/reference/intro
