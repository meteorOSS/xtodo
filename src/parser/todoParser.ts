import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TodoItem, TodoFile, TodoGroup, TodoStatus } from '../models/todo';

/**
 * Todo文件解析器
 */
export class TodoParser {
  // 文件内容缓存，避免重复读取
  private static fileContentCache: Map<string, {
    content: string,
    mtime: number
  }> = new Map();
  
  // 文件解析结果缓存
  private static fileParseCache: Map<string, {
    result: TodoFile,
    mtime: number
  }> = new Map();
  
  /**
   * 解析单个Todo文件
   * @param filePath 文件路径
   * @param group 文件所属分组
   * @returns TodoFile对象
   */
  public static async parseTodoFile(filePath: string, group: string): Promise<TodoFile> {
    try {
      // 获取文件状态
      const stats = await fs.promises.stat(filePath).catch(() => null);
      if (!stats) {
        return this.createEmptyTodoFile(filePath, group);
      }
      
      const mtime = stats.mtime.getTime();
      
      // 检查缓存是否有效
      const cachedParse = this.fileParseCache.get(filePath);
      if (cachedParse && cachedParse.mtime === mtime) {
        // 缓存有效，直接返回
        return cachedParse.result;
      }
      
      // 尝试从内容缓存获取
      let content: string;
      const cachedContent = this.fileContentCache.get(filePath);
      
      if (cachedContent && cachedContent.mtime === mtime) {
        // 文件内容缓存有效
        content = cachedContent.content;
      } else {
        // 读取文件内容
        content = await fs.promises.readFile(filePath, 'utf8');
        
        // 更新内容缓存
        this.fileContentCache.set(filePath, { content, mtime });
        
        // 如果缓存过大，清理旧的内容
        if (this.fileContentCache.size > 100) {
          // 淘汰最早加入的10个条目
          const keys = Array.from(this.fileContentCache.keys()).slice(0, 10);
          keys.forEach(key => this.fileContentCache.delete(key));
        }
      }
      
      const lines = content.split(/\r?\n/);
      const items: TodoItem[] = [];
      let currentParents: TodoItem[] = [];
      
      lines.forEach((line, index) => {
        // 跳过空行
        if (line.trim() === '') {
          return;
        }

        const trimmedLine = line.trimStart();
        const indentLevel = line.length - trimmedLine.length;
        
        // 检查任务状态
        let status: TodoStatus = TodoStatus.NotStarted;
        let content = trimmedLine;
        
        if (trimmedLine.startsWith(TodoStatus.NotStarted)) {
          status = TodoStatus.NotStarted;
          content = trimmedLine.substring(TodoStatus.NotStarted.length).trim();
        } else if (trimmedLine.startsWith(TodoStatus.InProgress)) {
          status = TodoStatus.InProgress;
          content = trimmedLine.substring(TodoStatus.InProgress.length).trim();
        } else if (trimmedLine.startsWith(TodoStatus.Completed)) {
          status = TodoStatus.Completed;
          content = trimmedLine.substring(TodoStatus.Completed.length).trim();
        }
        
        // 创建任务项 - 使用对象池减少内存分配
        const todoItem: TodoItem = {
          content,
          status,
          children: [],
          filePath,
          lineNumber: index,
          indentLevel
        };
        
        // 根据缩进级别确定父任务
        // 清除比当前缩进级别大的父任务
        while (currentParents.length > 0 && currentParents[currentParents.length - 1].indentLevel >= indentLevel) {
          currentParents.pop();
        }
        
        if (currentParents.length === 0) {
          // 顶层任务
          items.push(todoItem);
        } else {
          // 子任务，添加到父任务的children中
          currentParents[currentParents.length - 1].children.push(todoItem);
        }
        
        // 将当前任务添加为可能的父任务
        currentParents.push(todoItem);
      });
      
      const todoFile = {
        path: filePath,
        name: path.basename(filePath),
        items,
        group
      };
      
      // 更新解析缓存
      this.fileParseCache.set(filePath, { result: todoFile, mtime });
      
      // 如果缓存过大，清理旧的内容
      if (this.fileParseCache.size > 100) {
        // 淘汰最早加入的10个条目
        const keys = Array.from(this.fileParseCache.keys()).slice(0, 10);
        keys.forEach(key => this.fileParseCache.delete(key));
      }
      
      return todoFile;
    } catch (error) {
      console.error(`解析文件 ${filePath} 出错:`, error);
      return this.createEmptyTodoFile(filePath, group);
    }
  }
  
  /**
   * 创建空的TodoFile
   */
  private static createEmptyTodoFile(filePath: string, group: string): TodoFile {
    return {
      path: filePath,
      name: path.basename(filePath),
      items: [],
      group
    };
  }
  
  /**
   * 查找并解析工作区中所有的Todo文件
   * @returns 所有的TodoGroup对象
   */
  public static async findAllTodoFiles(): Promise<TodoGroup[]> {
    const groups = new Map<string, TodoGroup>();
    
    if (!vscode.workspace.workspaceFolders) {
      return [];
    }
    
    // 获取用户配置的待办文件夹
    const config = vscode.workspace.getConfiguration('xtodo');
    const todoFolders: string[] = config.get('todoFolders', []);
    
    try {
      // 如果没有配置待办文件夹，则搜索整个工作区
      if (todoFolders.length === 0) {
        return await this.searchWorkspaceFolders();
      }
    
      // 并行处理每个配置的文件夹
      const folderPromises = todoFolders.map(async folderPath => {
        // 检查是否是绝对路径
        if (path.isAbsolute(folderPath)) {
          // 是绝对路径，直接使用
          return this.searchTodoFolder(folderPath, path.basename(folderPath));
        } else {
          // 是相对路径，并行处理每个工作区
          const wsPromises = vscode.workspace.workspaceFolders!.map(async wsFolder => {
            const absolutePath = path.join(wsFolder.uri.fsPath, folderPath);
            return this.searchTodoFolder(absolutePath, path.basename(folderPath));
          });
          
          // 合并工作区结果
          const wsResults = await Promise.all(wsPromises);
          return wsResults.flat();
        }
      });
      
      const results = await Promise.all(folderPromises);
      
      // 按分组名合并结果
      const mergedGroups = new Map<string, TodoGroup>();
      
      for (const groupList of results) {
        for (const group of groupList) {
          if (!mergedGroups.has(group.name)) {
            mergedGroups.set(group.name, { name: group.name, files: [] });
          }
          
          mergedGroups.get(group.name)!.files.push(...group.files);
        }
      }
      
      return Array.from(mergedGroups.values());
    } catch (error) {
      console.error('搜索Todo文件出错:', error);
      return [];
    }
  }
  
  /**
   * 搜索指定文件夹中的待办文件
   * @param folderPath 文件夹路径
   * @param defaultGroupName 默认分组名
   * @returns 所有的TodoGroup对象
   */
  private static async searchTodoFolder(
    folderPath: string,
    defaultGroupName: string
  ): Promise<TodoGroup[]> {
    try {
      // 检查文件夹是否存在
      const stats = await fs.promises.stat(folderPath).catch(() => null);
      if (!stats || !stats.isDirectory()) {
        console.warn(`配置的待办文件夹不存在或不是一个目录: ${folderPath}`);
        return [];
      }
      
      // 创建glob模式
      const folderUri = vscode.Uri.file(folderPath);
      const todoFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folderUri, '**/*.todo'),
        '**/node_modules/**'
      );
      
      // 按分组组织文件
      const groups = new Map<string, TodoGroup>();
      
      // 并行解析文件
      const filePromises = todoFiles.map(async todoFile => {
        const relativePath = path.relative(folderPath, todoFile.fsPath);
        const pathParts = relativePath.split(path.sep);
        
        // 确定分组名
        let groupName = defaultGroupName;
        if (pathParts.length > 1) {
          groupName = pathParts[0];
        }
        
        const todoFileObj = await this.parseTodoFile(todoFile.fsPath, groupName);
        
        return { groupName, todoFileObj };
      });
      
      const parsedFiles = await Promise.all(filePromises);
      
      // 整理结果到分组
      for (const { groupName, todoFileObj } of parsedFiles) {
        if (!groups.has(groupName)) {
          groups.set(groupName, { name: groupName, files: [] });
        }
        
        groups.get(groupName)!.files.push(todoFileObj);
      }
      
      return Array.from(groups.values());
    } catch (error) {
      console.error(`搜索待办文件夹出错: ${folderPath}`, error);
      return [];
    }
  }
  
  /**
   * 搜索工作区中的所有待办文件
   * @returns 所有的TodoGroup对象
   */
  private static async searchWorkspaceFolders(): Promise<TodoGroup[]> {
    // 并行处理工作区
    const workspacePromises = vscode.workspace.workspaceFolders!.map(async folder => {
      try {
        const todoFiles = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, '**/*.todo'),
          '**/node_modules/**'
        );
        
        // 按分组组织文件
        const groups = new Map<string, TodoGroup>();
        
        // 并行解析文件
        const filePromises = todoFiles.map(async todoFile => {
          const relativePath = vscode.workspace.asRelativePath(todoFile);
          const pathParts = relativePath.split(path.sep);
          
          // 使用第一级目录作为分组名
          let groupName = '未分组';
          if (pathParts.length > 1) {
            groupName = pathParts[0];
          }
          
          const todoFileObj = await this.parseTodoFile(todoFile.fsPath, groupName);
          
          return { groupName, todoFileObj };
        });
        
        const parsedFiles = await Promise.all(filePromises);
        
        // 整理结果到分组
        for (const { groupName, todoFileObj } of parsedFiles) {
          if (!groups.has(groupName)) {
            groups.set(groupName, { name: groupName, files: [] });
          }
          
          groups.get(groupName)!.files.push(todoFileObj);
        }
        
        return Array.from(groups.values());
      } catch (error) {
        console.error(`搜索工作区文件夹失败: ${folder.name}`, error);
        return [];
      }
    });
    
    // 合并所有工作区结果
    const results = await Promise.all(workspacePromises);
    const allGroups = results.flat();
    
    // 合并同名分组
    const mergedGroups = new Map<string, TodoGroup>();
    
    for (const group of allGroups) {
      if (!mergedGroups.has(group.name)) {
        mergedGroups.set(group.name, { name: group.name, files: [] });
      }
      
      mergedGroups.get(group.name)!.files.push(...group.files);
    }
    
    return Array.from(mergedGroups.values());
  }
  
  /**
   * 判断任务是否有进行中的子任务
   * @param task 任务
   * @returns 是否有进行中子任务
   */
  private static hasInProgressChildren(task: TodoItem): boolean {
    if (task.children && task.children.length > 0) {
      for (const child of task.children) {
        if (child.status === TodoStatus.InProgress || this.hasInProgressChildren(child)) {
          return true;
        }
      }
    }
    return false;
  }
  
  /**
   * 查找所有进行中的任务
   * @param groups 所有分组和文件
   * @returns 进行中的任务列表
   */
  public static findInProgressTasks(groups: TodoGroup[]): Array<{group: string, file: TodoFile, task: TodoItem}> {
    const inProgressTasks: Array<{group: string, file: TodoFile, task: TodoItem}> = [];
    
    // 使用迭代器模式而不是递归，减少调用栈开销
    for (const group of groups) {
      for (const file of group.files) {
        // 只收集顶层的进行中任务，子任务在视图展示时处理
        for (const task of file.items) {
          if (task.status === TodoStatus.InProgress || this.hasInProgressChildren(task)) {
            inProgressTasks.push({ group: group.name, file, task });
          }
        }
      }
    }
    
    return inProgressTasks;
  }
  
  /**
   * 清除文件缓存
   * 当需要重新加载文件内容时调用
   */
  public static clearCache(filePath?: string): void {
    if (filePath) {
      this.fileContentCache.delete(filePath);
      this.fileParseCache.delete(filePath);
    } else {
      this.fileContentCache.clear();
      this.fileParseCache.clear();
    }
  }
} 