import { promises as fs } from 'fs';
import path from 'path';

interface Link {
    source: string;
    target: string;
    text: string;
}

interface NoteIndex {
    path: string;
    title: string;
    links: Link[];
    backlinks: Link[];
    tags: string[];
    created: Date;
    modified: Date;
}

export class ObsidianProcessor {
    private notesIndex: Map<string, NoteIndex> = new Map();
    private vault: string;

    constructor(vaultPath: string) {
        this.vault = vaultPath;
    }

    // 解析笔记中的链接
    private async parseLinks(content: string, notePath: string): Promise<Link[]> {
        const links: Link[] = [];
        
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
    private parseTags(content: string): string[] {
        const tags: string[] = [];
        const tagRegex = /#[a-zA-Z0-9_-]+/g;
        let match;
        
        while ((match = tagRegex.exec(content)) !== null) {
            tags.push(match[0]);
        }
        
        return tags;
    }

    // 更新笔记索引
    public async updateNoteIndex(notePath: string): Promise<void> {
        try {
            const content = await fs.readFile(notePath, 'utf-8');
            const stats = await fs.stat(notePath);
            
            const links = await this.parseLinks(content, notePath);
            const tags = this.parseTags(content);
            
            const noteIndex: NoteIndex = {
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
        } catch (error) {
            console.error(`索引笔记失败 ${notePath}:`, error);
        }
    }

    // 获取笔记的所有反向链接
    public getBacklinks(notePath: string): Link[] {
        const note = this.notesIndex.get(notePath);
        return note ? note.backlinks : [];
    }

    // 按标签搜索笔记
    public searchByTag(tag: string): NoteIndex[] {
        const results: NoteIndex[] = [];
        
        for (const note of this.notesIndex.values()) {
            if (note.tags.includes(tag)) {
                results.push(note);
            }
        }
        
        return results;
    }

    // 重建整个仓库的索引
    public async rebuildIndex(): Promise<void> {
        this.notesIndex.clear();
        
        async function* walkDir(dir: string): AsyncGenerator<string> {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const file of files) {
                const fullPath = path.join(dir, file.name);
                if (file.isDirectory()) {
                    yield* walkDir(fullPath);
                } else if (file.name.endsWith('.md')) {
                    yield fullPath;
                }
            }
        }
        
        for await (const filePath of walkDir(this.vault)) {
            await this.updateNoteIndex(filePath);
        }
    }

    // 获取笔记的所有相关笔记（基于链接和反向链接）
    public getRelatedNotes(notePath: string): NoteIndex[] {
        const note = this.notesIndex.get(notePath);
        if (!note) return [];
        
        const relatedPaths = new Set<string>();
        
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
            .filter((note): note is NoteIndex => note !== undefined);
    }
}
