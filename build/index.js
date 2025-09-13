import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { ObsidianProcessor } from './obsidian.js';
// 创建 MCP 服务器实例
const server = new McpServer({
    name: "obsidian-chatgpt",
    version: "1.0.0",
    tools: [], // 工具列表会通过 registerTool 添加
    streamingEnabled: true, // 启用流式传输
});
let obsidianProcessor;
// 初始化 Obsidian 处理器
function initializeProcessor(vaultPath) {
    obsidianProcessor = new ObsidianProcessor(vaultPath);
    return obsidianProcessor.rebuildIndex();
}
// 定义工具：初始化仓库
server.registerTool('initializeVault', {
    title: '初始化仓库',
    description: '初始化 Obsidian 仓库并构建索引',
    inputSchema: {
        vaultPath: z.string().describe("Obsidian 仓库的完整路径")
    }
}, async (args) => {
    try {
        await initializeProcessor(args.vaultPath);
        return {
            content: [{ type: 'text', text: "成功初始化 Obsidian 仓库并构建索引" }],
            structuredContent: { status: 'success' }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `初始化失败: ${error.message}` }],
            structuredContent: { status: 'error', message: error.message }
        };
    }
});
server.registerTool("createNote", {
    title: "创建笔记",
    description: "在指定路径创建新的 Obsidian 笔记",
    inputSchema: {
        title: z.string().describe("笔记标题"),
        content: z.string().describe("笔记内容"),
        folder: z.string().optional().describe("笔记所在文件夹路径（可选）")
    }
}, async (args) => {
    const { title, content, folder = "" } = args;
    const notePath = path.join(folder, `${title}.md`);
    try {
        if (folder) {
            await fs.mkdir(folder, { recursive: true });
        }
        await fs.writeFile(notePath, content);
        // 更新索引
        await obsidianProcessor?.updateNoteIndex(notePath);
        return {
            content: [{ type: 'text', text: `成功创建笔记: ${notePath}` }],
            structuredContent: {
                status: 'success',
                notePath
            }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `创建笔记失败: ${error.message}` }],
            structuredContent: {
                status: 'error',
                message: error.message
            }
        };
    }
});
server.registerTool("readNote", {
    title: "读取笔记",
    description: "读取指定路径的 Obsidian 笔记内容",
    inputSchema: {
        path: z.string().describe("笔记文件的完整路径")
    }
}, async (args) => {
    try {
        const content = await fs.readFile(args.path, 'utf-8');
        return {
            content: [{ type: 'text', text: content }],
            structuredContent: {
                status: 'success',
                content
            }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `读取笔记失败: ${error.message}` }],
            structuredContent: {
                status: 'error',
                message: error.message
            }
        };
    }
});
server.registerTool("searchNotes", {
    title: "搜索笔记",
    description: "在 Obsidian 仓库中搜索笔记",
    inputSchema: {
        keyword: z.string().describe("搜索关键词"),
        folder: z.string().optional().describe("搜索的文件夹范围（可选）")
    }
}, async (args) => {
    const { keyword, folder = "." } = args;
    async function searchFiles(dir) {
        const files = await fs.readdir(dir, { withFileTypes: true });
        const results = [];
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                results.push(...await searchFiles(fullPath));
            }
            else if (file.name.endsWith('.md')) {
                const content = await fs.readFile(fullPath, 'utf-8');
                if (content.toLowerCase().includes(keyword.toLowerCase())) {
                    results.push(fullPath);
                }
            }
        }
        return results;
    }
    try {
        const matches = await searchFiles(folder);
        return {
            content: [{ type: 'text', text: JSON.stringify(matches, null, 2) }],
            structuredContent: {
                status: 'success',
                matches
            }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `搜索失败: ${error.message}` }],
            structuredContent: {
                status: 'error',
                message: error.message
            }
        };
    }
});
server.registerTool("getBacklinks", {
    title: "获取笔记的反向链接",
    description: "获取指定笔记的所有反向链接",
    inputSchema: {
        notePath: z.string().describe("笔记文件的完整路径")
    }
}, async (args) => {
    try {
        const backlinks = obsidianProcessor?.getBacklinks(args.notePath) || [];
        return {
            content: [{ type: 'text', text: JSON.stringify(backlinks, null, 2) }],
            structuredContent: {
                status: 'success',
                backlinks
            }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `获取反向链接失败: ${error.message}` }],
            structuredContent: {
                status: 'error',
                message: error.message
            }
        };
    }
});
server.registerTool("searchByTag", {
    title: "按标签搜索笔记",
    description: "按标签搜索笔记",
    inputSchema: {
        tag: z.string().describe("要搜索的标签（包含#）")
    }
}, async (args) => {
    try {
        const notes = obsidianProcessor?.searchByTag(args.tag) || [];
        return {
            content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }],
            structuredContent: {
                status: 'success',
                notes
            }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `按标签搜索失败: ${error.message}` }],
            structuredContent: {
                status: 'error',
                message: error.message
            }
        };
    }
});
server.registerTool("getRelatedNotes", {
    title: "获取相关笔记",
    description: "获取与指定笔记相关的所有笔记",
    inputSchema: {
        notePath: z.string().describe("笔记文件的完整路径")
    }
}, async (args) => {
    try {
        const relatedNotes = obsidianProcessor?.getRelatedNotes(args.notePath) || [];
        return {
            content: [{ type: 'text', text: JSON.stringify(relatedNotes, null, 2) }],
            structuredContent: {
                status: 'success',
                relatedNotes
            }
        };
    }
    catch (error) {
        return {
            content: [{ type: 'text', text: `获取相关笔记失败: ${error.message}` }],
            structuredContent: {
                status: 'error',
                message: error.message
            }
        };
    }
});
// 获取本机 IP 地址
async function getLocalIpAddress() {
    const { networkInterfaces } = await import('os');
    const interfaces = networkInterfaces();
    for (const interfaceName of Object.keys(interfaces)) {
        const ifaces = interfaces[interfaceName];
        if (!ifaces)
            continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}
// 创建 Express 应用
const app = express();
// 配置 CORS
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};
app.use(cors(corsOptions));
// 创建 HTTP MCP 服务器
const PORT = 8080;
// 初始化 StreamableHTTPServerTransport
const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // 无状态模式
    enableJsonResponse: true // 启用 JSON 响应
});
// 将 MCP HTTP 服务器集成到 Express
app.post('/mcp', express.json(), async (req, res) => {
    try {
        // 将请求体转发给传输器
        await transport.handleRequest(req, res, req.body);
    }
    catch (error) {
        console.error('处理请求时出错:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});
// 处理 WebSocket 和 SSE 连接
app.get('/mcp', async (req, res) => {
    // 启用 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    try {
        // 使用传输器处理流式连接
        await transport.handleRequest(req, res);
    }
    catch (error) {
        console.error('处理流式连接时出错:', error);
        res.status(500).end();
    }
});
// 启动服务器
app.listen(PORT, '0.0.0.0', async () => {
    const ipAddress = await getLocalIpAddress();
    console.log(`Obsidian ChatGPT MCP 服务器已启动`);
    console.log(`MCP 服务器 URL: http://${ipAddress}:${PORT}/mcp`);
    console.log(`您也可以使用: http://localhost:${PORT}/mcp`);
});
