import { promises as fs } from 'fs';
import path from 'path';
export class ObsidianProcessor {
    notesIndex = new Map();
    vault;
    constructor(vaultPath) {
        this.vault = vaultPath;
    }
    // 解析笔记中的链接
    async parseLinks(content, notePath) {
        const links = [];
        // 匹配 [[链接]] 格式
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = wikiLinkRegex.exec(content)) !== null) {
            const linkText = match[1];
            const linkPath = linkText.split('|')[0]; // 处理 [[目标|显示文本]] 格式
            links.push({
                source: notePath,
                target: path.join(this.vault, `${linkPath}.md`),
                text: linkText
            });
        }
        return links;
    }
    // 解析笔记中的标签
    parseTags(content) {
        const tags = [];
        const tagRegex = /#[a-zA-Z0-9_-]+/g;
        let match;
        while ((match = tagRegex.exec(content)) !== null) {
            tags.push(match[0]);
        }
        return tags;
    }
    // 更新笔记索引
    async updateNoteIndex(notePath) {
        try {
            const content = await fs.readFile(notePath, 'utf-8');
            const stats = await fs.stat(notePath);
            const links = await this.parseLinks(content, notePath);
            const tags = this.parseTags(content);
            const noteIndex = {
                path: notePath,
                title: path.basename(notePath, '.md'),
                links,
                backlinks: [],
                tags,
                created: stats.birthtime,
                modified: stats.mtime
            };
            this.notesIndex.set(notePath, noteIndex);
            // 更新反向链接
            for (const link of links) {
                const targetNote = this.notesIndex.get(link.target);
                if (targetNote) {
                    targetNote.backlinks.push({
                        source: notePath,
                        target: link.target,
                        text: link.text
                    });
                }
            }
        }
        catch (error) {
            console.error(`索引笔记失败 ${notePath}:`, error);
        }
    }
    // 获取笔记的所有反向链接
    getBacklinks(notePath) {
        const note = this.notesIndex.get(notePath);
        return note ? note.backlinks : [];
    }
    // 按标签搜索笔记
    searchByTag(tag) {
        const results = [];
        for (const note of this.notesIndex.values()) {
            if (note.tags.includes(tag)) {
                results.push(note);
            }
        }
        return results;
    }
    // 重建整个仓库的索引
    async rebuildIndex() {
        this.notesIndex.clear();
        async function* walkDir(dir) {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    yield* walkDir(fullPath);
                }
                else if (file.name.endsWith('.md')) {
                    yield fullPath;
                }
            }
        }
        for await (const filePath of walkDir(this.vault)) {
            await this.updateNoteIndex(filePath);
        }
    }
    // 获取笔记的所有相关笔记（基于链接和反向链接）
    getRelatedNotes(notePath) {
        const note = this.notesIndex.get(notePath);
        if (!note)
            return [];
        const relatedPaths = new Set();
        // 添加所有链接的目标笔记
        for (const link of note.links) {
            relatedPaths.add(link.target);
        }
        // 添加所有反向链接的来源笔记
        for (const backlink of note.backlinks) {
            relatedPaths.add(backlink.source);
        }
        return Array.from(relatedPaths)
            .map(path => this.notesIndex.get(path))
            .filter((note) => note !== undefined);
    }
}
