# ChatGPT Actions for Obsidian

This Actions configuration allows ChatGPT to:

1. Create new notes
2. Update existing notes
3. Create backlinks
4. Add tags
5. Organize content

## API Endpoints

- `POST /repos/:owner/:repo/contents/:path`
  - 创建或更新文件
  - 需要 `repo` 权限

- `GET /repos/:owner/:repo/contents/:path`
  - 读取文件内容
  - 需要 `repo` 权限（私有仓库）

## Authentication

使用 GitHub Token 进行身份验证：

1. 访问 GitHub -> Settings -> Developer settings -> Personal access tokens
2. 生成新的 token，选择 `repo` 权限
3. 在 ChatGPT 的 Actions 配置中使用此 token

## 自动提交

每次通过 ChatGPT 更新笔记时：

1. 自动创建 commit
2. 推送到远程仓库
3. Obsidian Git 插件会自动同步这些更改
